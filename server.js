const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const { getSpecialists, getMetadata, ensureDataDir } = require('./services/store');
const { routeSymptoms, rankDoctorsForRouting, canonicalSpecialty } = require('./services/router');
const { runScrape } = require('./scraper/lipsScraper');
const { concepts: clinicalConcepts, knowledgeSchemaVersion } = require('./services/clinicalKnowledge');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTO_UPDATE_ON_START = /^(1|true|yes)$/i.test(process.env.AUTO_UPDATE_ON_START || 'false');
const AUTO_UPDATE_MIN_COUNT = Number(process.env.AUTO_UPDATE_MIN_COUNT || 120);
const AUTO_UPDATE_MAX_AGE_DAYS = Number(process.env.AUTO_UPDATE_MAX_AGE_DAYS || 7);
const READY_MIN_SPECIALTIES = Number(process.env.MIN_UPDATE_SPECIALTIES || 20);
const MAX_API_MATCHES = Math.max(5, Math.min(100, Number(process.env.MAX_API_MATCHES || 40)));
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const PREFER_LIPS_HEALTHCARE = !/^(0|false|no)$/i.test(process.env.PREFER_LIPS_HEALTHCARE || 'true');
const REQUIRE_READY_DIRECTORY = !/^(0|false|no)$/i.test(process.env.REQUIRE_READY_DIRECTORY || (process.env.NODE_ENV === 'production' ? 'true' : 'false'));
const SERVER_SCRAPER_ENABLED = /^(1|true|yes)$/i.test(process.env.SERVER_SCRAPER_ENABLED || 'false');

let updateRunning = false;
let lastUpdateResult = null;
let updateProgress = { stage: 'idle', message: 'Ready.', percent: 0, processed: 0, total: 0, successful: 0, failed: 0 };

function setUpdateProgress(progress) {
  updateProgress = { ...updateProgress, ...progress, updatedAt: new Date().toISOString() };
}
const rateBuckets = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use((req, res, next) => {
  // Allow the optional browser dictation control on our own HTTPS origin only.
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});

app.use(express.json({ limit: '12kb' }));
app.use(express.urlencoded({ extended: false, limit: '12kb' }));

app.use((req, res, next) => {
  const requestId = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  const started = Date.now();
  res.on('finish', () => {
    // Privacy: never log request bodies or symptom text.
    console.log(JSON.stringify({
      type: 'http', requestId, method: req.method, path: req.path,
      status: res.statusCode, durationMs: Date.now() - started
    }));
  });
  next();
});

function apiRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.', requestId: req.requestId });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
}, Math.min(RATE_LIMIT_WINDOW_MS, 60_000)).unref();

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

async function directoryStatus() {
  const [specialists, metadata] = await Promise.all([getSpecialists(), getMetadata()]);
  const specialtyCount = new Set(specialists.flatMap(x => [
    x.specialty,
    ...(Array.isArray(x.specialties) ? x.specialties : [])
  ]).map(canonicalSpecialty).filter(Boolean)).size;
  const last = metadata?.lastUpdated ? Date.parse(metadata.lastUpdated) : 0;
  const ageDays = last ? (Date.now() - last) / 86_400_000 : null;
  return {
    specialists: specialists.length,
    specialties: specialtyCount,
    locationVerified: specialists.filter(x => x.locationVerified === true).length,
    lipsHealthcareSpecialists: specialists.filter(x => x.worksAtLipsHealthcare === true).length,
    lastUpdated: metadata?.lastUpdated || null,
    ageDays: ageDays == null ? null : Math.round(ageDays * 10) / 10,
    preservedPrevious: Boolean(metadata?.preservedPrevious),
    updateRunning,
    updateProgress,
    serverScraperEnabled: SERVER_SCRAPER_ENABLED,
    clinicalConcepts: clinicalConcepts.length,
    knowledgeSchemaVersion
  };
}

app.get('/health', async (_req, res, next) => {
  try {
    const status = await directoryStatus();
    res.json({ ok: true, ...status, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

app.get('/ready', async (_req, res, next) => {
  try {
    const status = await directoryStatus();
    const ready = status.specialists >= AUTO_UPDATE_MIN_COUNT && status.specialties >= READY_MIN_SPECIALTIES && Boolean(status.lastUpdated);
    res.status(ready ? 200 : 503).json({ ready, ...status });
  } catch (err) { next(err); }
});

app.post('/api/analyze', apiRateLimit, async (req, res, next) => {
  try {
    const symptomText = typeof req.body?.symptoms === 'string' ? req.body.symptoms.trim() : '';
    if (!symptomText) return res.status(400).json({ error: 'Please describe the symptoms.', requestId: req.requestId });
    if (symptomText.length > 4000) return res.status(400).json({ error: 'Please keep the description under 4,000 characters.', requestId: req.requestId });

    const [specialists, metadata] = await Promise.all([getSpecialists(), getMetadata()]);
    if (!specialists.length) {
      return res.status(503).json({
        code: 'DATABASE_EMPTY',
        error: 'The specialist database has not been initialized yet. Please run an LIPS database update.',
        requestId: req.requestId
      });
    }

    const specialtyCount = new Set(specialists.flatMap(x => [
      x.specialty,
      ...(Array.isArray(x.specialties) ? x.specialties : [])
    ]).map(canonicalSpecialty).filter(Boolean)).size;
    const directoryReady = specialists.length >= AUTO_UPDATE_MIN_COUNT && specialtyCount >= READY_MIN_SPECIALTIES && Boolean(metadata?.lastUpdated);
    if (REQUIRE_READY_DIRECTORY && !directoryReady) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        code: 'DIRECTORY_NOT_READY',
        error: 'The live LIPS specialist directory has not passed the production coverage gate yet. Refresh the directory before routing patients.',
        directory: {
          specialists: specialists.length,
          specialties: specialtyCount,
          preservedPrevious: Boolean(metadata?.preservedPrevious),
          requiredSpecialists: AUTO_UPDATE_MIN_COUNT,
          requiredSpecialties: READY_MIN_SPECIALTIES
        },
        requestId: req.requestId
      });
    }

    const routing = routeSymptoms(symptomText, specialists);
    const matches = routing.specialty
      ? rankDoctorsForRouting(specialists, routing, symptomText, { preferLipsHealthcare: PREFER_LIPS_HEALTHCARE }).slice(0, MAX_API_MATCHES)
      : [];
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      routing,
      matches,
      directory: {
        specialists: specialists.length,
        specialties: specialtyCount,
        lastUpdated: metadata?.lastUpdated || null,
        preservedPrevious: Boolean(metadata?.preservedPrevious),
        locationVerified: specialists.filter(x => x.locationVerified === true).length,
        lipsHealthcareSpecialists: specialists.filter(x => x.worksAtLipsHealthcare === true).length,
        preferLipsHealthcare: PREFER_LIPS_HEALTHCARE,
        requireReadyDirectory: REQUIRE_READY_DIRECTORY,
        ready: directoryReady
      },
      requestId: req.requestId
    });
  } catch (err) { next(err); }
});

function safePasswordEqual(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).send('ADMIN_PASSWORD is not configured.');
  const provided = req.get('x-admin-password') || '';
  if (!safePasswordEqual(provided, ADMIN_PASSWORD)) return res.status(401).send('Unauthorized');
  next();
}

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/admin/status', adminAuth, async (_req, res, next) => {
  try {
    const specialists = await getSpecialists();
    const metadata = await getMetadata();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ count: specialists.length, metadata, updateRunning, updateProgress, lastUpdateResult, serverScraperEnabled: SERVER_SCRAPER_ENABLED, clinicalConcepts: clinicalConcepts.length, knowledgeSchemaVersion });
  } catch (err) { next(err); }
});

app.post('/api/admin/update', adminAuth, async (_req, res) => {
  if (!SERVER_SCRAPER_ENABLED) {
    return res.status(503).json({
      code: 'SERVER_SCRAPER_DISABLED',
      error: 'Server-side crawling is disabled on this low-memory deployment. Refresh the directory with the GitHub Actions workflow or run npm run update locally, then deploy the updated data files.'
    });
  }
  if (updateRunning) return res.status(409).json({ error: 'An update is already running.' });
  updateRunning = true;
  lastUpdateResult = null;
  updateProgress = { stage: 'starting', message: 'Starting update…', percent: 0, processed: 0, total: 0, successful: 0, failed: 0, updatedAt: new Date().toISOString() };
  res.status(202).json({ ok: true, message: 'Update started.' });
  try {
    const result = await runScrape({ onProgress: setUpdateProgress });
    lastUpdateResult = { metadata: result.metadata, count: result.specialists.length };
  } catch (err) {
    lastUpdateResult = { error: err.message, finishedAt: new Date().toISOString() };
    setUpdateProgress({ stage: 'failed', message: `Update failed: ${err.message}`, error: err.message, finishedAt: new Date().toISOString() });
    console.error('[admin] update failed:', err);
  } finally {
    updateRunning = false;
  }
});

async function maybeAutoUpdate() {
  if (!SERVER_SCRAPER_ENABLED || !AUTO_UPDATE_ON_START || updateRunning) return;
  const specialists = await getSpecialists();
  const metadata = await getMetadata();
  const last = metadata?.lastUpdated ? Date.parse(metadata.lastUpdated) : 0;
  const stale = !last || (Date.now() - last) > AUTO_UPDATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const lastAttemptFailedCoverage = metadata?.lastAttemptPassedCoverageGate === false;
  if (specialists.length >= AUTO_UPDATE_MIN_COUNT && !stale && !lastAttemptFailedCoverage) return;
  updateRunning = true;
  updateProgress = { stage: 'starting', message: 'Automatic directory update starting…', percent: 0, processed: 0, total: 0, successful: 0, failed: 0, updatedAt: new Date().toISOString() };
  try {
    console.log(`[startup] automatic LIPS update started (count=${specialists.length}, stale=${stale})`);
    const result = await runScrape({ onProgress: setUpdateProgress });
    lastUpdateResult = { metadata: result.metadata, count: result.specialists.length };
  } catch (err) {
    lastUpdateResult = { error: err.message, finishedAt: new Date().toISOString() };
    setUpdateProgress({ stage: 'failed', message: `Automatic update failed: ${err.message}`, error: err.message, finishedAt: new Date().toISOString() });
    console.error('[startup] automatic update failed:', err);
  } finally {
    updateRunning = false;
  }
}

app.use((err, req, res, _next) => {
  console.error('[server] unhandled request error', { requestId: req.requestId, message: err.message, stack: err.stack });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error.', requestId: req.requestId });
});

let server;
async function start() {
  await ensureDataDir();
  server = app.listen(PORT, HOST, () => {
    console.log(`LIPS Specialist Finder listening on http://${HOST}:${PORT}`);
    void maybeAutoUpdate();
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;
}

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  if (!server) return process.exit(0);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  start().catch(err => {
    console.error('[startup] fatal:', err);
    process.exit(1);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.start = start;
module.exports.directoryStatus = directoryStatus;

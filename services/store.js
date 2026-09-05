const fs = require('node:fs/promises');
const path = require('node:path');

const defaultData = path.join(__dirname, '..', 'data', 'specialists.json');
const defaultMeta = path.join(__dirname, '..', 'data', 'metadata.json');

let cache = {
  specialistsPath: null,
  metadataPath: null,
  specialistsMtimeMs: -1,
  metadataMtimeMs: -1,
  specialists: null,
  metadata: null
};

function dataPaths() {
  const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.dirname(defaultData);
  return {
    dir,
    specialists: path.join(dir, 'specialists.json'),
    metadata: path.join(dir, 'metadata.json')
  };
}

async function ensureDataDir() {
  const p = dataPaths();
  await fs.mkdir(p.dir, { recursive: true });
  const seeds = [
    [defaultData, p.specialists, []],
    [defaultMeta, p.metadata, {
      schemaVersion: 5,
      lastUpdated: null,
      discovered: 0,
      updated: 0,
      stored: 0,
      failed: 0,
      errors: [],
      source: 'bootstrap'
    }]
  ];
  for (const [src, dst, fallback] of seeds) {
    try {
      await fs.access(dst);
      continue;
    } catch {}
    try {
      if (path.resolve(src) !== path.resolve(dst)) await fs.copyFile(src, dst);
      else throw Object.assign(new Error('Packaged seed missing'), { code: 'ENOENT' });
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
      await fs.writeFile(dst, JSON.stringify(fallback, null, 2), 'utf8');
    }
  }
  return p;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function mtimeMs(file) {
  try { return (await fs.stat(file)).mtimeMs; }
  catch { return -1; }
}

async function getSpecialists() {
  const p = await ensureDataDir();
  const mtime = await mtimeMs(p.specialists);
  if (cache.specialists && cache.specialistsPath === p.specialists && cache.specialistsMtimeMs === mtime) return cache.specialists;
  const data = await readJson(p.specialists, []);
  cache.specialistsPath = p.specialists;
  cache.specialistsMtimeMs = mtime;
  cache.specialists = Array.isArray(data) ? data : [];
  return cache.specialists;
}

async function getMetadata() {
  const p = await ensureDataDir();
  const mtime = await mtimeMs(p.metadata);
  if (cache.metadata && cache.metadataPath === p.metadata && cache.metadataMtimeMs === mtime) return cache.metadata;
  const data = await readJson(p.metadata, { lastUpdated: null, discovered: 0, updated: 0, failed: 0, errors: [] });
  cache.metadataPath = p.metadata;
  cache.metadataMtimeMs = mtime;
  cache.metadata = data && typeof data === 'object' ? data : {};
  return cache.metadata;
}

async function atomicWriteJson(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function saveDataset(specialists, metadata) {
  const p = await ensureDataDir();
  await atomicWriteJson(p.specialists, specialists);
  await atomicWriteJson(p.metadata, metadata);
  cache = {
    specialistsPath: p.specialists,
    metadataPath: p.metadata,
    specialistsMtimeMs: await mtimeMs(p.specialists),
    metadataMtimeMs: await mtimeMs(p.metadata),
    specialists,
    metadata
  };
}

module.exports = { getSpecialists, getMetadata, saveDataset, ensureDataDir, dataPaths };

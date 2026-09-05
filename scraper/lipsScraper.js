const { saveDataset, getSpecialists, getMetadata } = require('../services/store');
const { ROUTES, normalizeText, canonicalSpecialty } = require('../services/router');

const BASE = 'https://lips.org.uk';
const DIRECTORY = `${BASE}/our-specialists/`;
const ENTRY_POINTS = [
  DIRECTORY,
  `${BASE}/our-specialists`,
  `${BASE}/specialities/`,
  `${BASE}/specialties/`,
  BASE
];
const USER_AGENT = 'LIPS-Specialist-Finder/5.0 (+public-directory-indexer; respectful rate-limited crawling)';
const PROFILE_RE = /(?:https?:\/\/lips\.org\.uk)?\/our-specialists\/([a-z0-9][a-z0-9-]*)(?:\/)?/gi;
const SPECIALITY_PATH_RE = /^\/(?:specialit(?:y|ies)|specialt(?:y|ies))\/(?!$)[^?#]+\/?$/i;
const PROFILE_PATH_RE = /^\/our-specialists\/[^/?#]+\/?$/i;
const MIN_VALID_RECORDS = Number(process.env.MIN_UPDATE_RECORDS || 100);
const MIN_VALID_SPECIALTIES = Number(process.env.MIN_UPDATE_SPECIALTIES || 20);
const MIN_PREVIOUS_RETENTION_RATIO = Math.max(0.5, Math.min(1, Number(process.env.MIN_PREVIOUS_RETENTION_RATIO || 0.85)));
const MAX_DISCOVERY_PAGES = Number(process.env.MAX_DISCOVERY_PAGES || 120);
const MAX_PROFILE_PAGES = Number(process.env.MAX_PROFILE_PAGES || 400);
const MAX_RESPONSE_TEXT = 3_500_000;
const DISCOVERY_STABLE_ROUNDS = Math.max(2, Math.min(8, Number(process.env.DISCOVERY_STABLE_ROUNDS || 4)));
const DIRECTORY_MAX_ROUNDS = Math.max(8, Math.min(60, Number(process.env.DIRECTORY_MAX_ROUNDS || 28)));
const OTHER_MAX_ROUNDS = Math.max(4, Math.min(24, Number(process.env.OTHER_MAX_ROUNDS || 8)));
const SCRAPE_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.SCRAPE_CONCURRENCY || 3)));
const SCRAPE_RETRY_CONCURRENCY = Math.max(1, Math.min(SCRAPE_CONCURRENCY, Number(process.env.SCRAPE_RETRY_CONCURRENCY || 2)));
const PROFILE_NAV_TIMEOUT_MS = Math.max(10000, Math.min(60000, Number(process.env.PROFILE_NAV_TIMEOUT_MS || 30000)));
const PROFILE_SETTLE_MS = Math.max(0, Math.min(2000, Number(process.env.PROFILE_SETTLE_MS || 250)));
const TRACKER_HOST_RE = /(?:google-analytics|googletagmanager|doubleclick|hotjar|clarity\.ms|facebook\.com|connect\.facebook)/i;

const EXTRA_TAXONOMY = [
  'Aesthetics', 'Cardiology', 'Dentistry', 'Dermatology', 'Diabetes', 'Endocrinology', 'ENT',
  'Gastroenterology', 'General Practice', 'General Surgery', 'Geriatrics', 'Gynaecology & Obstetrics',
  'Haematology', 'Neurology', 'Neurosurgery', 'Ophthalmology', 'Paediatrics',
  'Plastic Surgery', 'Psychiatry', 'Radiology', 'Respiratory Medicine', 'Rheumatology',
  'Sexual Health', 'Sports & Exercise Medicine', 'Trauma & Orthopaedics',
  'Urology & Andrology', 'Physiotherapy', 'Maxillofacial', 'Anaesthetics',
  'Pain Management', 'Urgent Care', 'Vascular Surgery', 'Breast Surgery', 'Colorectal Surgery',
  'Orthodontics', 'Oral Surgery', 'Periodontology', 'Endodontics', 'Dietetics',
  'Gastroenterology and Hepatology', 'General Practitioner', 'Gynaecology', "Women's Health"
];
const TAXONOMY = [...new Set([
  ...ROUTES.map(r => r.specialty),
  ...EXTRA_TAXONOMY
])].sort((a, b) => b.length - a.length);

function canonicalUrl(href) {
  try {
    const u = new URL(href, BASE);
    if (u.hostname !== 'lips.org.uk' || u.protocol !== 'https:') return null;
    u.hash = '';
    u.search = '';
    u.pathname = u.pathname.replace(/\/+/g, '/');
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    if (!PROFILE_PATH_RE.test(u.pathname)) return null;
    return `${BASE}${u.pathname}`;
  } catch { return null; }
}

function canonicalSiteUrl(href) {
  try {
    const u = new URL(href, BASE);
    if (u.hostname !== 'lips.org.uk' || u.protocol !== 'https:') return null;
    u.hash = '';
    u.search = '';
    u.pathname = u.pathname.replace(/\/+/g, '/');
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    return u.toString();
  } catch { return null; }
}

function uniq(list) { return [...new Set(list)]; }
function cleanLine(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function decodeLooseText(raw) {
  let text = String(raw || '');
  // JSON/Next.js payloads often escape slashes or unicode characters.
  text = text.replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  try { text = decodeURIComponent(text); } catch {}
  return text;
}

function extractProfileUrls(raw) {
  const urls = new Set();
  const text = decodeLooseText(raw);
  for (const m of text.matchAll(PROFILE_RE)) {
    const u = canonicalUrl(`${BASE}/our-specialists/${m[1]}/`);
    if (u) urls.add(u);
  }

  // Some API payloads return only a relative path in a JSON string.
  for (const m of text.matchAll(/["'](?:url|href|path|profileUrl)["']\s*:\s*["']([^"']+)["']/gi)) {
    const u = canonicalUrl(m[1]);
    if (u) urls.add(u);
  }
  return [...urls];
}

function extractProfileSlugs(raw) {
  const urls = new Set();
  const text = decodeLooseText(raw);
  for (const m of text.matchAll(/["'](?:slug|profileSlug|specialistSlug)["']\s*:\s*["']([a-z0-9][a-z0-9-]{2,})["']/gi)) {
    const slug = m[1].toLowerCase();
    if (['our-specialists','specialists','specialities','specialties','about-lips','contact-us'].includes(slug)) continue;
    const u = canonicalUrl(`${BASE}/our-specialists/${slug}/`);
    if (u) urls.add(u);
  }
  return [...urls];
}

function extractSiteUrls(raw) {
  const urls = new Set();
  const text = decodeLooseText(raw);
  for (const m of text.matchAll(/https?:\/\/lips\.org\.uk\/[^\s<"']+/gi)) {
    const cleaned = m[0].replace(/[),.;]+$/, '');
    const u = canonicalSiteUrl(cleaned);
    if (u) urls.add(u);
  }
  return [...urls];
}

const KNOWN_PROFILE_TERMS = [
  'knee','hip','shoulder','spine','sports injury','trauma','fracture','acl','meniscus','cardiology','heart failure',
  'arrhythmia','arrythmia','palpitations','atrial fibrillation','cardiomyopathy','hypertension','heart valve','cardiac mri',
  'electrophysiology','headache','migraine','seizure','epilepsy','dementia','parkinson','neurovascular','brain tumour',
  'brain tumor','dermatology','skin cancer','eczema','psoriasis','acne','rash','hair loss','alopecia','melasma','rosacea',
  'gastroenterology','hepatology','liver','ibs','reflux','crohn','colitis','fertility','menopause','pregnancy','endometriosis',
  'fibroid','respiratory','asthma','copd','sleep apnoea','ophthalmology','cataract','retina','glaucoma','rheumatology',
  'lupus','rheumatoid arthritis','urology','kidney stone','prostate','haematuria','plastic surgery','reconstructive surgery',
  'maxillofacial','neurosurgery','spinal surgery','sciatica','ent','tinnitus','hearing','sinus','tonsil','gynaecology',
  'obstetrics','endocrinology','diabetes','thyroid','paediatrics','anaesthetics','psychiatry','general practice','dentistry',
  'radiology','physiotherapy','sexual health','erectile dysfunction','pain management','chronic pain','vascular surgery',
  'varicose veins','breast surgery','breast lump','colorectal','haemorrhoids','dietetics','nutrition','weight management'
];

const SUB_SPECIALTY_CANDIDATES = [
  'Traumatic Injuries','Pelvic Trauma','Knee','Hip','Sports Injury','Upper Limb','Lower Limb','Foot & Ankle','Foot','Ankle',
  'Shoulder','Elbow','Wrist','Spinal Surgery','Spinal Disorders','Back Surgery','Craniual Surgery','Cranial Surgery',
  'Neurovascular Surgery','Neuro-Oncology','Hydrocephalus','Heart Failure','Heart Muscle Disease','Arrhythmia','Arrythmia',
  'Electrophysiology','Clinical Cardiology','General Cardiology','Preventive Cardiology','Cardiac Electrophysiology','Cardiac MRI',
  'Echocardiography','Cardio-Oncology','Cardiothoracic Surgery','Coronary & Ischaemic Heart Disease','Off-pump Coronary Surgery',
  'Cataracts','Cataract','Diabetic Retinopathy','Macular Degeneration','Retina','Headache','Seizures','Dementia',
  "Parkinson's Disease",'Movement Disorders','Neuro-Diagnostics','Psychodermatology','Skin Cancer','Hair Loss','General Dermatology',
  'Gynaecological Oncology','Female Health Screening','Fertility','Menopause','General Gynaecology','Obstetrics','Pelvic',
  'General Surgery','Hernia','Upper GI','Lower GI','Hepatology','Inflammatory Bowel Disease','Obesity & Metabolic','Primary Care',
  'General Practice','Paediatric ENT','Anaesthetics','Psychiatry','Rheumatology','Urology','Andrology','Kidney Stones',"Men's Health",
  'Dental Implants','Orthodontics','Maxillofacial','Endodontics','Periodontology','Sexual Health','Sexual Function','Pain Management',
  'Vascular Surgery','Breast Surgery','Colorectal Surgery','Radiology','Interventional Radiology','Physiotherapy','Dietetics',
  'Musculoskeletal Medicine','Sleep Apnoea','Ear & Balance','Nose & Sinus','Throat','General Ophthalmology','General Neurology'
];

function textToKeywords(text) {
  const lower = ` ${normalizeText(text)} `;
  return KNOWN_PROFILE_TERMS.filter(k => {
    const needle = normalizeText(k);
    return needle && lower.includes(` ${needle} `);
  });
}

const ROLE_SPECIALTY_PATTERNS = [
  [/\borthopaedic|\borthopedic/i, 'Trauma & Orthopaedics'],
  [/\bcardiologist|\bcardiology/i, 'Cardiology'],
  [/\bneurologist|\bneurology/i, 'Neurology'],
  [/\bdermatologist|\bdermatology/i, 'Dermatology'],
  [/\bgastroenterologist|\bhepatologist|\bgastroenterology|\bhepatology/i, 'Gastroenterology'],
  [/\bgynaecologist|\bgynecologist|\bobstetrician|\bgynaecology|\bgynecology|\bobstetrics/i, 'Gynaecology & Obstetrics'],
  [/\brespiratory physician|\bpulmonologist|\brespiratory medicine/i, 'Respiratory Medicine'],
  [/\bophthalmologist|\bophthalmology/i, 'Ophthalmology'],
  [/\brheumatologist|\brheumatology/i, 'Rheumatology'],
  [/\burologist|\bandrologist|\burology|\bandrology/i, 'Urology & Andrology'],
  [/\bplastic surgeon|\bplastic surgery/i, 'Plastic Surgery'],
  [/\bmaxillofacial|\boral and maxillofacial/i, 'Maxillofacial'],
  [/\bneurosurgeon|\bneurosurgery/i, 'Neurosurgery'],
  [/\bdiabetologist|\bdiabetes specialist/i, 'Diabetes'],
  [/\bendocrinologist|\bendocrinology/i, 'Endocrinology'],
  [/\bent surgeon|\botolaryngologist|\bear nose and throat/i, 'ENT'],
  [/\bpsychiatrist|\bpsychiatry/i, 'Psychiatry'],
  [/\bpaediatrician|\bpediatrician|\bpaediatrics|\bpediatrics/i, 'Paediatrics'],
  [/\bgeriatrician|\bgeriatrics|\bgeriatric medicine|\belderly medicine/i, 'Geriatrics'],
  [/\bgeneral practitioner|\bprivate gp\b|\bgp\b/i, 'General Practice'],
  [/\bsports medicine|\bsport exercise|\bmusculoskeletal medicine/i, 'Sports & Exercise Medicine'],
  [/\bgeneral surgeon|\bgeneral surgery/i, 'General Surgery'],
  [/\bhaematologist|\bhematologist|\bhaematology|\bhematology/i, 'Haematology'],
  [/\banaesthetist|\banesthetist|\banaesthetics|\banesthetics/i, 'Anaesthetics'],
  [/\baesthetic physician|\baesthetic specialist|\baesthetics/i, 'Aesthetics'],
  [/\bdentist|\bdentistry/i, 'Dentistry'],
  [/\bvascular surgeon|\bvascular surgery/i, 'Vascular Surgery'],
  [/\bbreast surgeon|\bbreast surgery/i, 'Breast Surgery'],
  [/\bcolorectal surgeon|\bcolorectal surgery/i, 'Colorectal Surgery'],
  [/\bradiologist|\bradiology/i, 'Radiology'],
  [/\bphysiotherapist|\bphysiotherapy/i, 'Physiotherapy'],
  [/\bdietitian|\bdietetics/i, 'Dietetics']
];

function specialtyFromRoleText(text) {
  for (const [pattern, specialty] of ROLE_SPECIALTY_PATTERNS) if (pattern.test(text)) return specialty;
  return '';
}

function looksLikeRoleLine(line) {
  return /consultant|specialist|surgeon|physician|professor|general practitioner|\bgp\b|dentist|radiologist|physiotherapist|psychiatrist|cardiologist|dermatologist|neurologist|urologist|gastroenterologist|hepatologist|ophthalmologist|anaesthetist|anesthetist|dietitian|paediatrician|pediatrician|geriatrician/i.test(line || '');
}

function specialtyLabelsInLine(line) {
  const compact = ` ${normalizeText(line)} `;
  const hits = [];
  for (const label of TAXONOMY) {
    const needle = ` ${normalizeText(label)} `;
    const index = compact.indexOf(needle);
    if (index >= 0) hits.push({ index, label: canonicalSpecialty(label) });
  }
  return hits
    .sort((a, b) => a.index - b.index || b.label.length - a.label.length)
    .map(x => x.label);
}

function extractSpecialtiesFromLines(lines) {
  const found = [];
  // Profile taxonomy is normally displayed after the clinician role. Prefer those
  // labels over words inside a role such as "Consultant Endocrinology and Diabetes".
  for (const line of lines) {
    if (looksLikeRoleLine(line)) continue;
    for (const label of specialtyLabelsInLine(line)) if (label && !found.includes(label)) found.push(label);
  }
  if (found.length) return found;

  const joined = lines.join(' ');
  const fallback = specialtyFromRoleText(joined);
  return fallback ? [fallback] : [];
}

function extractSpecialtyFromLines(lines) {
  return extractSpecialtiesFromLines(lines)[0] || '';
}

function isProfileNoise(line) {
  const n = normalizeText(line);
  if (!n) return true;
  return /^(reviews?|gmc|about|biography|locations?|availability|contact us|languages?|book|send us|earliest availability|private|primary)$/i.test(line)
    || /doctify|check availability|appointment request|confirm booking|£\d|\d(?:\.\d+)?\s*\/\s*5|\d+\+?\s*reviews?/i.test(line)
    || /^gmc\s*:?\s*\d+/i.test(line)
    || n.length > 120;
}

function extractSectionItems(lines, headingPatterns, maxItems = 24) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!headingPatterns.some(re => re.test(lines[i]))) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 35); j++) {
      const line = lines[j];
      if (/^(locations?|educational & professional highlights|research & publications|contact us|languages?|availability|our location|subscribe|biography|about )/i.test(line)) break;
      if (/^(special interests?|sub[- ]?specialit(?:y|ies)|subspecialt(?:y|ies)|areas? of expertise|expertise|conditions? treated|conditions?)$/i.test(line)) continue;
      if (isProfileNoise(line)) continue;
      const words = normalizeText(line).split(/\s+/).filter(Boolean);
      if (words.length >= 1 && words.length <= 14 && line.length <= 120) out.push(line);
      if (out.length >= maxItems) return uniq(out);
    }
  }
  return uniq(out);
}


function isLocationMetaLine(line) {
  return /^(locations?|sub[- ]?specialit(?:y|ies)|subspecialt(?:y|ies)|special interests?|research & publications|educational & professional highlights)$/i.test(line);
}

function isLocationType(line) {
  return /^(primary|private|nhs|other)$/i.test(line);
}

function isLocationSectionStop(line) {
  return /^(availability|contact us|languages?|our location|biography|about |subscribe|doctify rating)/i.test(line);
}

function isLikelyLocationName(line) {
  if (!line || isLocationMetaLine(line) || isLocationSectionStop(line) || isLocationType(line)) return false;
  if (/^(view all|view more|learn more|check availability|send us a message|book|reviews?)$/i.test(line)) return false;
  if (/^https?:\/\//i.test(line) || /@/.test(line) || /^\+?[\d\s()\-]{8,}$/.test(line)) return false;
  return line.length >= 3 && line.length <= 120;
}

function parseLocationDetails(lines) {
  const details = lines.filter(Boolean);
  const email = details.find(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) || '';
  const phone = details.find(x => /^\+?[\d\s()\-]{8,}$/.test(x)) || '';
  const website = details.find(x => /^https?:\/\//i.test(x)) || '';
  const address = details
    .filter(x => x !== email && x !== phone && x !== website)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return { address, email, phone, website };
}

function extractLocationsFromLines(lines) {
  const headingIndexes = [];
  for (let i = 0; i < lines.length; i++) if (/^locations?$/i.test(lines[i])) headingIndexes.push(i);
  if (!headingIndexes.length) return { locationVerified: false, locations: [], worksAtLipsHealthcare: null };

  // Prefer the first Locations section after the doctor header. Footer content uses "Our Location",
  // which is intentionally not considered a clinician location section.
  const start = headingIndexes[0] + 1;
  const section = [];
  for (let i = start; i < Math.min(lines.length, start + 150); i++) {
    if (isLocationSectionStop(lines[i])) break;
    section.push(lines[i]);
  }

  const locations = [];
  let current = null;
  const flush = () => {
    if (!current?.name) return;
    const details = parseLocationDetails(current.details);
    locations.push({
      type: current.type || '',
      name: current.name,
      ...details
    });
  };

  for (const line of section) {
    if (isLocationMetaLine(line)) continue;
    if (isLocationType(line)) {
      flush();
      current = { type: line, name: '', details: [] };
      continue;
    }
    if (!current) continue;
    if (!current.name && isLikelyLocationName(line)) {
      current.name = line;
      continue;
    }
    if (current.name) current.details.push(line);
  }
  flush();

  const deduped = [...new Map(locations.map(x => [`${normalizeText(x.name)}|${normalizeText(x.address)}`, x])).values()];
  const worksAtLipsHealthcare = deduped.some(location => {
    const name = normalizeText(location.name);
    return name === 'lips healthcare' || name.startsWith('lips healthcare battersea') || name.includes('lips healthcare battersea power station');
  });

  if (!deduped.length) {
    return { locationVerified: false, locations: [], worksAtLipsHealthcare: null };
  }

  return {
    locationVerified: true,
    locations: deduped.slice(0, 30),
    worksAtLipsHealthcare
  };
}

function extractLocations(text) {
  const lines = String(text || '').split(/\n+/).map(cleanLine).filter(Boolean);
  return extractLocationsFromLines(lines);
}

function extractStructured(text, h1) {
  const lines = text.split(/\n+/).map(cleanLine).filter(Boolean);
  const nameIndex = h1 ? lines.findIndex(x => normalizeText(x) === normalizeText(h1)) : -1;
  const start = nameIndex >= 0 ? nameIndex + 1 : 0;
  const headerWindow = lines.slice(start, Math.min(lines.length, start + 50));
  const headerStop = headerWindow.findIndex(x => /^(about\b|biography$|locations?$|availability$|contact us$|languages?$)/i.test(x));
  const header = headerWindow.slice(0, headerStop >= 0 ? headerStop : headerWindow.length);

  const role = header.find(x => /consultant|specialist|surgeon|physician|professor|general practitioner|\bgp\b|dentist|radiologist|physiotherapist|psychiatrist|cardiologist|dermatologist|neurologist|urologist|gastroenterologist|hepatologist|ophthalmologist|anaesthetist|anesthetist|dietitian|paediatrician|pediatrician|geriatrician/i.test(x)) || '';
  const specialties = extractSpecialtiesFromLines(header);
  const specialty = specialties[0] || '';

  const headerText = header.join(' ');
  const tags = SUB_SPECIALTY_CANDIDATES.filter(tag => normalizeText(headerText).includes(normalizeText(tag)));

  // Sub-specialities are taken from known/live labels in the profile header.
  // Do not treat arbitrary comma-separated header text as taxonomy: degree credentials
  // such as MBBS, FRCP and MRCS are common here and must never become specialties.

  const specialtySet = new Set(specialties.map(x => normalizeText(canonicalSpecialty(x))));
  const subSpecialties = uniq(tags)
    .filter(x => !specialtySet.has(normalizeText(canonicalSpecialty(x))))
    .filter(x => normalizeText(x) !== normalizeText(role))
    .slice(0, 20);

  const bioHeading = lines.findIndex(x => /^biography$/i.test(x));
  let biography = '';
  if (bioHeading >= 0) {
    const b = [];
    for (let i = bioHeading + 1; i < Math.min(lines.length, bioHeading + 70); i++) {
      if (/^(locations?|special interests?|sub[- ]?specialit(?:y|ies)|subspecialt(?:y|ies)|educational & professional highlights|research & publications|contact us|languages?|availability|our location)$/i.test(lines[i])) break;
      if (lines[i].length > 30 && !isProfileNoise(lines[i])) b.push(lines[i]);
    }
    biography = b.join(' ').slice(0, 14000);
  }

  const interestItems = extractSectionItems(lines, [
    /^special interests?$/i,
    /^areas? of expertise$/i,
    /^expertise$/i
  ]);
  const conditionItems = extractSectionItems(lines, [/^conditions? treated$/i, /^conditions?$/i]);

  const expertise = uniq([
    ...subSpecialties,
    ...interestItems,
    ...textToKeywords(`${headerText} ${biography}`)
  ]).slice(0, 40);
  const conditions = uniq([
    ...conditionItems,
    ...textToKeywords(`${headerText} ${biography}`)
  ]).slice(0, 40);
  const locationData = extractLocationsFromLines(lines);

  return {
    role,
    specialty,
    specialties,
    subSpecialties,
    expertise,
    conditions,
    biography,
    ...locationData,
    sourceText: normalizeText(text).slice(0, 16000)
  };
}

async function collectProfileUrlsFromPage(page, { deep = false } = {}) {
  const urls = new Set();
  const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(a => a.href)).catch(() => []);
  for (const href of hrefs) {
    const u = canonicalUrl(href);
    if (u) urls.add(u);
  }
  // Full HTML parsing is relatively expensive, so only do it on selected discovery rounds.
  if (deep) {
    const html = await page.content().catch(() => '');
    for (const u of extractProfileUrls(html)) urls.add(u);
  }
  return [...urls];
}

async function collectSiteLinksFromPage(page) {
  const profileUrls = new Set();
  const specialtyUrls = new Set();
  const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(a => a.href)).catch(() => []);
  for (const href of hrefs) {
    const p = canonicalUrl(href);
    if (p) profileUrls.add(p);
    const s = canonicalSiteUrl(href);
    if (s) {
      try {
        const path = new URL(s).pathname;
        if (SPECIALITY_PATH_RE.test(path) && !/\/our-specialists\//i.test(path)) specialtyUrls.add(s);
      } catch {}
    }
  }
  return { profileUrls: [...profileUrls], specialtyUrls: [...specialtyUrls] };
}

async function clickMoreControls(page, logger) {
  const labels = /^(view all|view more|load more|show more|more specialists|see all|load additional|load more specialists)$/i;

  // Click one real visible control at a time. After the DOM changes we return to
  // the discovery loop, recollect URLs, and look for the next control. This avoids
  // double-clicking dynamic controls and makes the process deterministic.
  const candidates = page.locator('button, a, [role="button"]');
  const n = await candidates.count().catch(() => 0);

  for (let i = 0; i < n; i++) {
    const item = candidates.nth(i);
    if (!(await item.isVisible().catch(() => false))) continue;

    const txt = cleanLine(await item.innerText().catch(() => ''));
    if (!labels.test(txt)) continue;

    const tag = await item.evaluate(el => el.tagName).catch(() => '');
    const href = await item.getAttribute('href').catch(() => null);
    const beforeProfiles = await collectProfileUrlsFromPage(page);
    const beforeKey = beforeProfiles.length;

    await item.scrollIntoViewIfNeeded().catch(() => {});

    let clicked = false;
    try {
      await item.click({ timeout: 5000, noWaitAfter: true });
      clicked = true;
    } catch {
      try {
        clicked = await item.evaluate(el => {
          el.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }));
          return true;
        });
      } catch {}
    }

    if (!clicked) continue;

    await sleep(650);
    const afterProfiles = await collectProfileUrlsFromPage(page, { deep: true });
    logger.log(`[scrape] clicked control: ${txt} tag=${tag || '?'} href=${href || '-'} profiles ${beforeKey}->${afterProfiles.length}`);
    return true;
  }

  return false;
}
async function scrollAllPossibleContainers(page, logger) {
  const result = await page.evaluate(() => {
    let moved = 0;
    window.scrollTo(0, document.body.scrollHeight);
    moved++;
    const els = [...document.querySelectorAll('*')];
    for (const el of els) {
      if (el.scrollHeight > el.clientHeight + 300 && el.clientHeight > 200) {
        const before = el.scrollTop;
        el.scrollTop = el.scrollHeight;
        if (el.scrollTop !== before) moved++;
      }
    }
    return { moved, y: window.scrollY, h: document.body.scrollHeight };
  }).catch(() => ({ moved: 0, y: 0, h: 0 }));
  if (result.moved) await sleep(650);
  logger.log(`[scrape] scroll moved=${result.moved} y=${Math.round(result.y)} height=${Math.round(result.h)}`);
  return result;
}

async function discoverFromPage(page, entry, logger, onProgress) {
  const isDirectory = /\/our-specialists(?:\/)?$/i.test(new URL(entry).pathname);
  const maxRounds = isDirectory ? DIRECTORY_MAX_ROUNDS : OTHER_MAX_ROUNDS;
  const scrollPasses = isDirectory ? 2 : 1;
  const seenProfiles = new Set();
  const seenSpecialities = new Set();
  await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(700);
  await page.waitForLoadState('load', { timeout: 4000 }).catch(() => {});

  let stable = 0;
  let lastProfileCount = 0;
  let lastHeight = 0;
  let lastHrefCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    for (const u of await collectProfileUrlsFromPage(page, { deep: round === 0 })) seenProfiles.add(u);
    const siteLinks = await collectSiteLinksFromPage(page);
    siteLinks.specialtyUrls.forEach(u => seenSpecialities.add(u));

    const before = seenProfiles.size;
    const clicked = await clickMoreControls(page, logger);
    const afterClick = await collectProfileUrlsFromPage(page);
    afterClick.forEach(u => seenProfiles.add(u));

    for (let i = 0; i < scrollPasses; i++) {
      await scrollAllPossibleContainers(page, logger);
      const discovered = await collectProfileUrlsFromPage(page, { deep: i === scrollPasses - 1 });
      discovered.forEach(u => seenProfiles.add(u));
    }

    const hrefCount = await page.locator('a[href]').count().catch(() => 0);
    const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)).catch(() => 0);
    const grew = seenProfiles.size > before || seenProfiles.size > lastProfileCount || height > lastHeight + 100 || hrefCount > lastHrefCount;
    if (grew || clicked) stable = 0; else stable++;
    lastProfileCount = seenProfiles.size;
    lastHeight = height;
    lastHrefCount = hrefCount;

    logger.log(`[scrape] discovery entry=${entry} round=${round + 1} profiles=${seenProfiles.size} specialtyPages=${seenSpecialities.size} stable=${stable}`);
    if (onProgress) onProgress({ stage: 'discovery', discovered: seenProfiles.size, message: `Discovering specialists (${seenProfiles.size} found)` });
    if (stable >= DISCOVERY_STABLE_ROUNDS) break;
  }

  return { profiles: [...seenProfiles], specialityPages: [...seenSpecialities] };
}

async function discoverFromSitemaps(page, logger, onProgress) {
  const sitemapQueue = [
    `${BASE}/sitemap.xml`, `${BASE}/sitemap_index.xml`, `${BASE}/wp-sitemap.xml`
  ];
  const visitedSitemaps = new Set();
  const profiles = new Set();
  const specialityPages = new Set();

  try {
    await page.goto(`${BASE}/robots.txt`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const robots = await page.locator('body').innerText().catch(() => '');
    for (const line of robots.split(/\n+/)) {
      const m = line.match(/^sitemap:\s*(https?:\/\/[^\s]+)$/i);
      if (m && !sitemapQueue.includes(m[1].trim())) sitemapQueue.push(m[1].trim());
    }
  } catch (err) {
    logger.log(`[scrape] robots skipped: ${err.message}`);
  }

  while (sitemapQueue.length && visitedSitemaps.size < 30) {
    const sitemap = sitemapQueue.shift();
    if (!sitemap || visitedSitemaps.has(sitemap)) continue;
    visitedSitemaps.add(sitemap);
    try {
      await page.goto(sitemap, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const body = await page.locator('body').innerText().catch(() => '');
      const html = await page.content().catch(() => '');
      const all = `${body}\n${html}`;

      for (const u of extractProfileUrls(all)) profiles.add(u);
      for (const u of extractSiteUrls(all)) {
        try {
          const parsed = new URL(u);
          const path = parsed.pathname;
          if (SPECIALITY_PATH_RE.test(path) && !/\/our-specialists\//i.test(path)) specialityPages.add(u);
        } catch {}
      }

      // Follow sitemap indexes. Keep the original URL form (without forcing a trailing slash).
      for (const m of decodeLooseText(all).matchAll(/https?:\/\/lips\.org\.uk\/[^\s<"']*sitemap[^\s<"']*\.xml/gi)) {
        const child = m[0].replace(/&amp;/gi, '&').replace(/[),.;]+$/, '');
        if (!visitedSitemaps.has(child) && !sitemapQueue.includes(child)) sitemapQueue.push(child);
      }
      logger.log(`[scrape] sitemap=${sitemap} profiles=${profiles.size} specialtyPages=${specialityPages.size} sitemapQueue=${sitemapQueue.length}`);
      if (onProgress) onProgress({ stage: 'discovery', discovered: profiles.size, message: `Reading LIPS sitemaps (${profiles.size} specialists found)` });
    } catch (err) {
      logger.log(`[scrape] sitemap skipped=${sitemap} (${err.message})`);
    }
  }

  return { profiles: [...profiles], specialityPages: [...specialityPages] };
}

async function collectProfileUrls(page, logger = console, onProgress) {
  const profiles = new Set();
  const specialityPages = new Set();
  const visitedSitePages = new Set();
  const queue = [DIRECTORY, `${BASE}/specialities/`];

  // Sitemaps are often the most complete, least fragile source of public profile URLs.
  // Use them first, then visit discovered specialty pages to catch cards/links not present in the sitemap.
  const sitemapResult = await discoverFromSitemaps(page, logger, onProgress);
  sitemapResult.profiles.forEach(u => profiles.add(u));
  sitemapResult.specialityPages.forEach(u => specialityPages.add(u));

  // If the sitemap already has healthy coverage, avoid crawling every specialty page.
  // The directory page is still visited to catch any profile not yet present in the sitemap.
  const sitemapLooksHealthy = profiles.size >= MIN_VALID_RECORDS;
  if (!sitemapLooksHealthy) {
    for (const u of ENTRY_POINTS) if (!queue.includes(u)) queue.push(u);
    for (const u of sitemapResult.specialityPages) if (!queue.includes(u)) queue.push(u);
  }
  if (onProgress) onProgress({
    stage: 'discovery',
    discovered: profiles.size,
    message: sitemapLooksHealthy
      ? `Sitemap coverage looks healthy (${profiles.size} specialists); validating the live directory`
      : `Sitemap coverage is incomplete (${profiles.size}); scanning specialty pages`
  });

  while (queue.length && visitedSitePages.size < MAX_DISCOVERY_PAGES) {
    const entry = queue.shift();
    const normalized = canonicalSiteUrl(entry);
    if (!normalized || visitedSitePages.has(normalized)) continue;
    visitedSitePages.add(normalized);

    try {
      const result = await discoverFromPage(page, normalized, logger, onProgress);
      result.profiles.forEach(u => profiles.add(u));
      result.specialityPages.forEach(u => specialityPages.add(u));

      for (const u of result.specialityPages) {
        if (!visitedSitePages.has(u) && !queue.includes(u) && visitedSitePages.size + queue.length < MAX_DISCOVERY_PAGES) queue.push(u);
      }
      logger.log(`[scrape] visited=${visitedSitePages.size}/${MAX_DISCOVERY_PAGES} queue=${queue.length} profiles=${profiles.size} specialtyPages=${specialityPages.size}`);
      if (onProgress) onProgress({ stage: 'discovery', discovered: profiles.size, visitedPages: visitedSitePages.size, queuedPages: queue.length });
    } catch (err) {
      logger.error(`[scrape] entry failed ${normalized}: ${err.message}`);
    }
  }

  return [...profiles];
}

function inferSpecialtyFromSlug(url) {
  const slug = normalizeText((url.match(/\/our-specialists\/([^/]+)\/?$/i) || [,''])[1].replace(/-/g, ' '));
  return TAXONOMY.find(t => slug.includes(normalizeText(t).replace(/[^a-z0-9]+/g, ' '))) || '';
}

async function scrapeProfile(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PROFILE_NAV_TIMEOUT_MS });
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: Math.min(10000, PROFILE_NAV_TIMEOUT_MS) }).catch(() => {});
    if (PROFILE_SETTLE_MS) await page.waitForTimeout(PROFILE_SETTLE_MS);
    const h1 = cleanLine(await page.locator('h1').first().innerText().catch(() => ''));
    const text = await page.locator('body').innerText({ timeout: 10000 });
    if (!h1) throw new Error('Missing H1 / doctor name');
    const parsed = extractStructured(text, h1);
    const specialty = parsed.specialty || inferSpecialtyFromSlug(url);
    const specialties = uniq([specialty, ...(parsed.specialties || [])].filter(Boolean));
    return {
      name: h1,
      profileUrl: url,
      specialty,
      specialties,
      subSpecialties: parsed.subSpecialties,
      expertise: parsed.expertise,
      conditions: parsed.conditions,
      biography: parsed.biography,
      role: parsed.role,
      locations: parsed.locations,
      locationVerified: parsed.locationVerified,
      worksAtLipsHealthcare: parsed.worksAtLipsHealthcare,
      source: 'lips.org.uk',
      scrapedAt: new Date().toISOString()
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWorkerPool(items, concurrency, worker, onResult) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        const value = await worker(items[index], index);
        results[index] = { ok: true, value, item: items[index], index };
      } catch (error) {
        results[index] = { ok: false, error, item: items[index], index };
      }
      if (onResult) onResult(results[index]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function mergeFreshWithPrevious(fresh, previous) {
  const previousByUrl = new Map((previous || []).map(x => [canonicalUrl(x.profileUrl), x]));
  return fresh.map(record => {
    const old = previousByUrl.get(canonicalUrl(record.profileUrl)) || {};
    return {
      ...old,
      ...record,
      specialty: record.specialty || old.specialty || '',
      specialties: record.specialties?.length
        ? uniq(record.specialties.map(canonicalSpecialty).filter(Boolean))
        : (old.specialties?.length ? old.specialties : uniq([record.specialty || old.specialty].filter(Boolean))),
      subSpecialties: record.subSpecialties?.length ? record.subSpecialties : (old.subSpecialties || []),
      expertise: record.expertise?.length ? record.expertise : (old.expertise || []),
      conditions: record.conditions?.length ? record.conditions : (old.conditions || []),
      biography: record.biography || old.biography || '',
      role: record.role || old.role || '',
      locations: record.locationVerified === true ? (record.locations || []) : (old.locations || []),
      locationVerified: record.locationVerified === true ? true : Boolean(old.locationVerified),
      worksAtLipsHealthcare: record.locationVerified === true
        ? Boolean(record.worksAtLipsHealthcare)
        : (typeof old.worksAtLipsHealthcare === 'boolean' ? old.worksAtLipsHealthcare : null),
      scrapedAt: record.scrapedAt || new Date().toISOString(),
      seeded: false
    };
  });
}

async function runScrape({ logger = console, onProgress } = {}) {
  const started = new Date().toISOString();
  const { chromium } = require('playwright');
  let browser;
  let progress = {
    stage: 'starting', message: 'Starting LIPS directory update', discovered: 0, total: 0,
    processed: 0, successful: 0, failed: 0, retryProcessed: 0, retryTotal: 0,
    concurrency: SCRAPE_CONCURRENCY, startedAt: started, updatedAt: started
  };
  const report = patch => {
    progress = { ...progress, ...patch, updatedAt: new Date().toISOString() };
    try { if (onProgress) onProgress({ ...progress }); } catch {}
  };

  try {
    report({ stage: 'launching', message: 'Launching optimized browser session' });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
      locale: 'en-GB',
      serviceWorkers: 'block'
    });
    context.setDefaultTimeout(12000);
    context.setDefaultNavigationTimeout(PROFILE_NAV_TIMEOUT_MS);

    // Profiles are text-driven. Blocking heavy assets and third-party trackers materially
    // reduces CPU, memory and bandwidth without changing the clinical taxonomy we extract.
    await context.route('**/*', route => {
      const request = route.request();
      const type = request.resourceType();
      let host = '';
      try { host = new URL(request.url()).hostname; } catch {}
      if (['image', 'media', 'font'].includes(type) || TRACKER_HOST_RE.test(host)) return route.abort();
      return route.continue();
    });

    // Capture public JSON/XHR responses that may contain profile URLs which never become anchors.
    const discoveredFromResponses = new Set();
    const responsePage = await context.newPage();
    responsePage.on('response', async response => {
      try {
        const url = response.url();
        const type = response.request().resourceType();
        const ct = response.headers()['content-type'] || '';
        if (!(ct.includes('json') || ['xhr', 'fetch'].includes(type))) return;
        if (!/lips\.org\.uk/i.test(url)) return;
        const body = await response.text().catch(() => '');
        if (!body || body.length > MAX_RESPONSE_TEXT) return;
        for (const u of extractProfileUrls(body)) discoveredFromResponses.add(u);
        if (/specialist|consultant|doctor/i.test(url)) {
          for (const u of extractProfileSlugs(body)) discoveredFromResponses.add(u);
        }
      } catch {}
    });

    report({ stage: 'discovery', message: 'Discovering specialist profile URLs' });
    const urls = new Set(await collectProfileUrls(responsePage, logger, report));
    await responsePage.waitForTimeout(250).catch(() => {});
    discoveredFromResponses.forEach(u => urls.add(u));
    await responsePage.close().catch(() => {});

    const profileUrls = [...urls].slice(0, MAX_PROFILE_PAGES);
    report({
      stage: 'profiles', message: `Processing ${profileUrls.length} specialist profiles`,
      discovered: profileUrls.length, total: profileUrls.length, processed: 0,
      successful: 0, failed: 0, retryProcessed: 0, retryTotal: 0
    });
    logger.log(`[scrape] discovered=${profileUrls.length} (response-derived=${discoveredFromResponses.size}) concurrency=${SCRAPE_CONCURRENCY}`);

    let processed = 0;
    let successful = 0;
    let firstPassFailed = 0;
    const firstPass = await runWorkerPool(
      profileUrls,
      SCRAPE_CONCURRENCY,
      url => scrapeProfile(context, url),
      result => {
        processed++;
        if (result.ok && result.value?.name && result.value?.profileUrl) successful++;
        else firstPassFailed++;
        const pct = profileUrls.length ? Math.round((processed / profileUrls.length) * 100) : 100;
        report({
          stage: 'profiles', processed, successful, failed: firstPassFailed,
          percent: pct,
          message: `Processing specialist profiles: ${processed}/${profileUrls.length}`
        });
        if (processed === 1 || processed % 10 === 0 || processed === profileUrls.length) {
          logger.log(`[scrape] profiles ${processed}/${profileUrls.length} ok=${successful} failed=${firstPassFailed}`);
        }
      }
    );

    const specialists = firstPass.filter(x => x?.ok && x.value?.name && x.value?.profileUrl).map(x => x.value);
    let failures = firstPass.filter(x => !x?.ok || !x.value?.name || !x.value?.profileUrl);

    // Retry only failed profiles once, at a lower concurrency, to recover transient page/network issues.
    if (failures.length) {
      const retryUrls = failures.map(x => x.item);
      let retryProcessed = 0;
      let retryRecovered = 0;
      report({
        stage: 'retry', retryTotal: retryUrls.length, retryProcessed: 0,
        failed: failures.length, message: `Retrying ${retryUrls.length} failed profiles`
      });
      const retryResults = await runWorkerPool(
        retryUrls,
        SCRAPE_RETRY_CONCURRENCY,
        url => scrapeProfile(context, url),
        result => {
          retryProcessed++;
          if (result.ok && result.value?.name && result.value?.profileUrl) retryRecovered++;
          report({
            stage: 'retry', retryProcessed, retryRecovered,
            message: `Retrying failed profiles: ${retryProcessed}/${retryUrls.length}`
          });
        }
      );
      for (const result of retryResults) {
        if (result.ok && result.value?.name && result.value?.profileUrl) specialists.push(result.value);
      }
      failures = retryResults.filter(x => !x?.ok || !x.value?.name || !x.value?.profileUrl);
      successful += retryRecovered;
    }

    const errors = failures.map(x => ({ url: x.item, error: x.error?.message || 'Profile could not be parsed' }));
    for (const error of errors) logger.error(`[scrape] failed ${error.url}: ${error.error}`);

    report({ stage: 'validating', failed: errors.length, successful, message: 'Validating coverage before replacing the live directory' });
    const deduped = [...new Map(specialists.map(x => [canonicalUrl(x.profileUrl), x])).values()];
    const valid = deduped.filter(x => x.name && x.profileUrl && (x.specialty || x.role));
    const [previous, previousMetadata] = await Promise.all([getSpecialists(), getMetadata()]);
    const merged = mergeFreshWithPrevious(valid, previous);
    const validSpecialties = new Set(merged.flatMap(x => [
      x.specialty,
      ...(Array.isArray(x.specialties) ? x.specialties : [])
    ]).map(canonicalSpecialty).filter(Boolean));

    const minimumSafeRecords = previous.length === 0
      ? Math.min(20, MIN_VALID_RECORDS)
      : Math.max(MIN_VALID_RECORDS, Math.floor(previous.length * MIN_PREVIOUS_RETENTION_RATIO));
    const minimumSafeSpecialties = previous.length === 0 ? 1 : MIN_VALID_SPECIALTIES;
    const safeToReplace = merged.length >= minimumSafeRecords && validSpecialties.size >= minimumSafeSpecialties;
    const finalDataset = safeToReplace ? merged : previous;
    const finished = new Date().toISOString();
    const gateErrors = [];
    if (!safeToReplace) {
      gateErrors.push({
        error: `Update rejected by coverage gate: extracted ${merged.length} valid profiles across ${validSpecialties.size} specialties; required at least ${minimumSafeRecords} profiles across ${minimumSafeSpecialties} specialties. Previous dataset (${previous.length}) was preserved.`
      });
    }
    const metadata = {
      schemaVersion: 5,
      scraperVersion: '5.0.0',
      startedAt: started,
      lastUpdated: safeToReplace ? finished : (previousMetadata?.lastUpdated || null),
      attemptedAt: finished,
      discovered: profileUrls.length,
      updated: merged.length,
      stored: finalDataset.length,
      specialtyCount: safeToReplace ? validSpecialties.size : new Set(previous.flatMap(x => [
        x.specialty,
        ...(Array.isArray(x.specialties) ? x.specialties : [])
      ]).map(canonicalSpecialty).filter(Boolean)).size,
      extractedSpecialtyCount: validSpecialties.size,
      locationVerifiedCount: finalDataset.filter(x => x.locationVerified === true).length,
      lipsHealthcareSpecialistCount: finalDataset.filter(x => x.worksAtLipsHealthcare === true).length,
      failed: errors.length,
      retried: firstPassFailed,
      recoveredOnRetry: Math.max(0, firstPassFailed - errors.length),
      preservedPrevious: !safeToReplace,
      lastAttemptPassedCoverageGate: safeToReplace,
      minimumRecordsRequired: minimumSafeRecords,
      minimumSpecialtiesRequired: minimumSafeSpecialties,
      minimumPreviousRetentionRatio: MIN_PREVIOUS_RETENTION_RATIO,
      maxProfilePages: MAX_PROFILE_PAGES,
      scrapeConcurrency: SCRAPE_CONCURRENCY,
      retryConcurrency: SCRAPE_RETRY_CONCURRENCY,
      errors: [...errors, ...gateErrors].slice(0, 100),
      source: DIRECTORY,
      userAgent: USER_AGENT
    };
    await saveDataset(finalDataset, metadata);
    report({
      stage: safeToReplace ? 'completed' : 'preserved', percent: 100,
      processed: profileUrls.length, successful: valid.length, failed: errors.length,
      finishedAt: finished,
      message: safeToReplace
        ? `Update complete: ${finalDataset.length} specialists stored`
        : `Coverage gate preserved the previous directory (${previous.length} specialists)`
    });
    logger.log(`[scrape] completed extracted=${valid.length} stored=${finalDataset.length} failed=${errors.length} preserved=${!safeToReplace}`);
    return { specialists: finalDataset, metadata, progress };
  } catch (error) {
    report({ stage: 'failed', error: error.message, message: `Update failed: ${error.message}`, finishedAt: new Date().toISOString() });
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  runScrape,
  collectProfileUrls,
  scrapeProfile,
  canonicalUrl,
  canonicalSiteUrl,
  extractStructured,
  extractSpecialtiesFromLines,
  extractLocations,
  extractProfileUrls,
  SPECIALISTS: DIRECTORY,
  USER_AGENT,
  MIN_VALID_RECORDS,
  MIN_VALID_SPECIALTIES,
  MIN_PREVIOUS_RETENTION_RATIO,
  extractSiteUrls,
  extractProfileSlugs,
  mergeFreshWithPrevious,
  runWorkerPool,
  SCRAPE_CONCURRENCY,
  SCRAPE_RETRY_CONCURRENCY
};

'use strict';

const symptomKnowledge = require('../clinical-knowledge/symptoms.json');
const redFlagKnowledge = require('../clinical-knowledge/red-flags.json');
const { normalizeText, phraseContext, contextTokens, inferPatientContext } = require('./context');

const concepts = Array.isArray(symptomKnowledge.concepts) ? symptomKnowledge.concepts : [];
const knowledgeSchemaVersion = Number(symptomKnowledge.schemaVersion || 1);
const conceptById = new Map(concepts.map(x => [x.id, x]));
const GENERIC_DIRECTORY_TERMS = new Set([
  'medicine','surgery','general','specialist','consultant','pain','health','care','clinic','treatment','diagnosis','trauma',
  'cardiology','neurology','dermatology','physiotherapy','dietetics','radiology','anaesthetics','anesthetics','aesthetics'
]);
const TOKEN_STOPWORDS = new Set([
  'patient','patients','reports','report','reporting','says','said','having','with','from','that','this','been','have','has','had',
  'about','symptom','symptoms','persistent','severe','mild','moderate','very','really','there','their','pain','ache','problem','problems',
  'issue','issues','and','the','for','are','was','were','but','into','over','under','today','yesterday','currently','current','recent',
  'recently','history','known','any','some','much','many','also','still','now','then','please','wants','needs','denies','denied','deny',
  'without','negative','absence','free','does','doesnt','did','didnt','not','no','never','possible','possibly','maybe','suspected',
  'left','right','bilateral','both'
]);


// Conservative typo correction is deliberately limited to clinical vocabulary. It never
// rewrites short/common English words or assertion cues such as "no" and "not".
const COMMON_INPUT_WORDS = new Set([
  ...TOKEN_STOPWORDS,
  'after','before','during','while','when','where','which','what','main','mostly','usually','sometimes','always',
  'started','starting','worse','better','improved','improving','getting','feels','feeling','feel','felt','comes','goes',
  'week','weeks','month','months','year','years','day','days','hour','hours','morning','evening','night','time',
  'male','female','woman','women','man','men','child','adult','older','young','mother','father','sister','brother',
  'taking','takes','medication','medications','tablet','tablets','doctor','consultant','appointment','review'
]);

const KNOWN_CLINICAL_TYPOS = new Map(Object.entries({
  palpatation: 'palpitation',
  palpatations: 'palpitations',
  palpitationns: 'palpitations',
  sciatca: 'sciatica',
  sciattica: 'sciatica',
  arthritus: 'arthritis',
  migrene: 'migraine',
  migrane: 'migraine',
  dizzyness: 'dizziness',
  numbnes: 'numbness',
  breathlesness: 'breathlessness',
  breathlessnesss: 'breathlessness',
  swolen: 'swollen',
  haemorroids: 'haemorrhoids',
  hemorroids: 'haemorrhoids',
  diarrhoea: 'diarrhoea',
  diarhoea: 'diarrhoea'
}));

function clinicalVocabularyTokens() {
  const out = new Set();
  for (const concept of concepts) {
    for (const phrase of [concept.label, ...(concept.synonyms || [])]) {
      const normalized = normalizeText(phrase);
      for (const token of normalized.split(/\s+/)) {
        if (/^[a-z][a-z'-]+$/.test(token) && token.length >= 5 && !COMMON_INPUT_WORDS.has(token)) out.add(token);
      }
    }
  }
  return out;
}

const MEDICAL_VOCABULARY = clinicalVocabularyTokens();
const MEDICAL_VOCABULARY_BY_INITIAL = new Map();
for (const token of MEDICAL_VOCABULARY) {
  const key = token[0];
  if (!MEDICAL_VOCABULARY_BY_INITIAL.has(key)) MEDICAL_VOCABULARY_BY_INITIAL.set(key, []);
  MEDICAL_VOCABULARY_BY_INITIAL.get(key).push(token);
}

function damerauLevenshtein(a, b, maxDistance = Infinity) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  const rows = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i++) rows[i][0] = i;
  for (let j = 0; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, rows[i][j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
  }
  return rows[left.length][right.length];
}

function correctClinicalTypos(text) {
  const corrections = [];
  const correctedText = String(text || '').replace(/\b[A-Za-z][A-Za-z'-]{4,}\b/g, raw => {
    const token = normalizeText(raw);
    if (!token || COMMON_INPUT_WORDS.has(token) || MEDICAL_VOCABULARY.has(token)) return raw;
    const known = KNOWN_CLINICAL_TYPOS.get(token);
    if (known) {
      corrections.push({ from: raw, to: known, distance: damerauLevenshtein(token, known, 3) });
      return known;
    }
    const candidates = MEDICAL_VOCABULARY_BY_INITIAL.get(token[0]) || [];
    const maxDistance = token.length >= 8 ? 2 : 1;
    let best = null;
    let bestDistance = maxDistance + 1;
    let ties = 0;
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - token.length) > maxDistance) continue;
      const distance = damerauLevenshtein(token, candidate, maxDistance);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; ties = 1; }
      else if (distance === bestDistance) ties += 1;
    }
    if (!best || bestDistance > maxDistance || ties !== 1) return raw;
    const similarity = 1 - bestDistance / Math.max(token.length, best.length);
    if (similarity < 0.78) return raw;
    corrections.push({ from: raw, to: best, distance: bestDistance });
    return best;
  });
  return { text: correctedText, corrections: corrections.slice(0, 12) };
}

function medicalPhraseNormalisations(conceptMatches) {
  const out = [];
  const seen = new Set();
  for (const match of conceptMatches || []) {
    const canonical = String(match.label || '').trim();
    if (!canonical) continue;
    const phrases = [...(match.matchedPhrases || [])].sort((a,b) => String(b).length - String(a).length);
    const phrase = phrases.find(x => normalizeText(x) && normalizeText(x) !== normalizeText(canonical));
    if (!phrase) continue;
    const key = `${normalizeText(phrase)}|${normalizeText(canonical)}|${match.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: phrase, to: canonical, state: match.state, conceptId: match.id });
  }
  return out.slice(0, 12);
}

function prepareClinicalInput(text) {
  const corrected = correctClinicalTypos(text);
  const conceptMatches = extractClinicalConcepts(corrected.text);
  return {
    text: corrected.text,
    corrections: corrected.corrections,
    normalisations: medicalPhraseNormalisations(conceptMatches),
    conceptMatches
  };
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(x => String(x || '').trim()).filter(Boolean))];
}

function stateMultiplier(state) {
  if (state === 'present') return 1;
  if (state === 'uncertain') return 0.42;
  if (state === 'historical') return 0.12;
  return 0;
}

function extractClinicalConcepts(text) {
  const found = [];
  for (const concept of concepts) {
    const phrases = uniqueStrings([concept.label, ...(concept.synonyms || [])]).sort((a,b) => b.length - a.length);
    const states = new Set();
    const matchedPhrases = [];
    for (const phrase of phrases) {
      const context = phraseContext(text, phrase);
      if (!context.found) continue;
      matchedPhrases.push(phrase);
      for (const state of context.states || []) states.add(state);
    }
    if (!matchedPhrases.length) continue;
    const priority = ['present','uncertain','historical','resolved','family','negated'];
    const state = priority.find(x => states.has(x)) || 'present';
    found.push({
      id: concept.id,
      label: concept.label,
      state,
      states: [...states],
      matchedPhrases: uniqueStrings(matchedPhrases).slice(0, 8),
      specialtyWeights: concept.specialtyWeights || {},
      subSpecialtyWeights: concept.subSpecialtyWeights || {},
      clarification: concept.clarification || null,
      sources: concept.sources || [],
      multiplier: stateMultiplier(state)
    });
  }
  return found;
}

function scoreConcepts(conceptMatches) {
  const specialtyScores = new Map();
  const subSpecialtyScores = new Map();
  for (const match of conceptMatches || []) {
    const mult = Number(match.multiplier || 0);
    if (mult <= 0) continue;
    for (const [specialty, weight] of Object.entries(match.specialtyWeights || {})) {
      specialtyScores.set(specialty, (specialtyScores.get(specialty) || 0) + Number(weight || 0) * mult);
    }
    for (const [sub, weight] of Object.entries(match.subSpecialtyWeights || {})) {
      subSpecialtyScores.set(sub, (subSpecialtyScores.get(sub) || 0) + Number(weight || 0) * mult);
    }
  }
  return { specialtyScores, subSpecialtyScores };
}

function activeQueryTokens(text) {
  return contextTokens(text)
    .filter(x => !x.cue && !x.negated && !x.family && !x.historical)
    .filter(x => x.token.length >= 3 && !TOKEN_STOPWORDS.has(x.token))
    .map(x => x.token);
}

function safeDirectoryTerm(value) {
  const n = normalizeText(value);
  if (!n || n.length < 4 || n.length > 80) return '';
  const words = n.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8) return '';
  if (words.length === 1 && (GENERIC_DIRECTORY_TERMS.has(n) || n.length < 5)) return '';
  if (/^\d+$/.test(n)) return '';
  return n;
}

function buildDirectoryTermIndex(specialists) {
  const index = new Map();
  for (const doctor of specialists || []) {
    const specialties = uniqueStrings([doctor.specialty, ...(doctor.specialties || [])]);
    const terms = uniqueStrings([...(doctor.conditions || []), ...(doctor.expertise || []), ...(doctor.subSpecialties || [])]);
    for (const rawTerm of terms) {
      const term = safeDirectoryTerm(rawTerm);
      if (!term) continue;
      if (!index.has(term)) index.set(term, { term, specialties: new Map(), subSpecialties: new Map() });
      const row = index.get(term);
      for (const specialty of specialties) row.specialties.set(specialty, (row.specialties.get(specialty) || 0) + 1);
      for (const sub of doctor.subSpecialties || []) row.subSpecialties.set(sub, (row.subSpecialties.get(sub) || 0) + 1);
    }
  }
  return index;
}

function directoryEvidenceScores(text, specialists) {
  const index = buildDirectoryTermIndex(specialists);
  const specialtyScores = new Map();
  const subSpecialtyScores = new Map();
  const evidence = [];
  for (const row of index.values()) {
    const ctx = phraseContext(text, row.term);
    if (!ctx.found || !['present','uncertain'].includes(ctx.state)) continue;
    const mult = ctx.state === 'present' ? 1 : 0.35;
    const phraseBoost = row.term.includes(' ') ? 4 : 2.4;
    for (const [specialty, count] of row.specialties) {
      const score = Math.min(6, phraseBoost + Math.min(count, 3) * 0.5) * mult;
      specialtyScores.set(specialty, Math.max(specialtyScores.get(specialty) || 0, score));
    }
    for (const [sub, count] of row.subSpecialties) {
      const score = Math.min(7, phraseBoost + Math.min(count, 3) * 0.7) * mult;
      subSpecialtyScores.set(sub, Math.max(subSpecialtyScores.get(sub) || 0, score));
    }
    evidence.push({ term: row.term, state: ctx.state, specialties: [...row.specialties.keys()].slice(0,4), subSpecialties: [...row.subSpecialties.keys()].slice(0,4) });
  }
  evidence.sort((a,b) => b.term.length - a.term.length);
  return { specialtyScores, subSpecialtyScores, evidence: evidence.slice(0, 12) };
}

function profileText(doctor) {
  return normalizeText([
    doctor.specialty,
    ...(doctor.specialties || []),
    ...(doctor.subSpecialties || []),
    ...(doctor.expertise || []),
    ...(doctor.conditions || []),
    doctor.role || '',
    doctor.biography || ''
  ].filter(Boolean).join(' '));
}

function textContainsPhrase(normalizedHaystack, phrase) {
  const n = normalizeText(phrase);
  if (!n) return false;
  return ` ${normalizedHaystack} `.includes(` ${n} `);
}

function doctorConceptEvidence(doctor, conceptMatches) {
  const searchable = profileText(doctor);
  const evidence = [];
  for (const match of conceptMatches || []) {
    if (!['present','uncertain'].includes(match.state)) continue;
    const concept = conceptById.get(match.id);
    if (!concept) continue;
    const candidates = uniqueStrings([concept.label, ...(concept.synonyms || []), ...(match.matchedPhrases || [])]);
    const profilePhrase = candidates.find(p => textContainsPhrase(searchable, p));
    if (profilePhrase) evidence.push({ id: match.id, label: concept.label, profilePhrase, state: match.state });
  }
  return evidence;
}

function detectSupportingConcepts(text) {
  const out = new Set();
  for (const [id, phrases] of Object.entries(redFlagKnowledge.supportingConcepts || {})) {
    if ((phrases || []).some(p => phraseContext(text, p).state === 'present')) out.add(id);
  }
  return out;
}

function detectRedFlags(text, conceptMatches = []) {
  const presentConcepts = new Set((conceptMatches || []).filter(x => x.state === 'present').map(x => x.id));
  const supporting = detectSupportingConcepts(text);
  const allConceptIds = new Set([...presentConcepts, ...supporting]);
  const matches = [];
  const ignored = [];

  for (const rule of redFlagKnowledge.rules || []) {
    let hit = false;
    for (const phrase of rule.anyPhrases || []) {
      const ctx = phraseContext(text, phrase);
      if (ctx.state === 'present') hit = true;
      else if (ctx.found && ['negated','family','historical','resolved'].includes(ctx.state)) ignored.push(phrase);
    }
    if (!hit && Array.isArray(rule.requiresConceptGroups)) {
      hit = rule.requiresConceptGroups.every(group => group.some(id => allConceptIds.has(id)));
    }
    if (hit) matches.push({ id: rule.id, label: rule.label, severity: rule.severity, message: rule.message, sources: rule.sources || [] });
  }
  return { urgent: matches.some(x => x.severity === 'emergency'), matches, ignoredNegated: uniqueStrings(ignored) };
}

function chooseClarification(conceptMatches, specialtyCandidates = [], options = {}) {
  const active = (conceptMatches || []).filter(x => ['present','uncertain'].includes(x.state) && x.clarification);
  if (!active.length) return null;
  const top = Number(specialtyCandidates[0]?.score || 0);
  const second = Number(specialtyCandidates[1]?.score || 0);
  const ambiguous = !top || (second > 0 && top - second < 4.5);
  const uncertain = active.some(x => x.state === 'uncertain');
  const needsSubSpecialty = Boolean(options.subSpecialtyMissing);
  if (!ambiguous && !uncertain && !needsSubSpecialty) return null;

  const topSpecialty = specialtyCandidates[0]?.specialty || '';
  const secondSpecialty = specialtyCandidates[1]?.specialty || '';
  const scored = active.map(match => {
    const weights = match.specialtyWeights || {};
    const firstWeight = Number(weights[topSpecialty] || 0);
    const secondWeight = Number(weights[secondSpecialty] || 0);
    const spreadsAcrossTopRoutes = topSpecialty && secondSpecialty && firstWeight > 0 && secondWeight > 0;
    let score = 0;
    if (match.state === 'uncertain') score += 6;
    if (spreadsAcrossTopRoutes) score += 5 - Math.min(4, Math.abs(firstWeight - secondWeight));
    if (Object.keys(match.subSpecialtyWeights || {}).length) score += 2.5;
    if (needsSubSpecialty) score += 2;
    score += Math.max(0, ...Object.values(weights).map(Number)) / 10;
    return { match, score };
  }).sort((a,b) => b.score - a.score || String(a.match.label).localeCompare(String(b.match.label)));

  const selected = scored[0]?.match;
  if (!selected?.clarification) return null;
  return { ...selected.clarification, conceptId: selected.id, trigger: selected.state === 'uncertain' ? 'uncertainty' : (ambiguous ? 'ambiguity' : 'sub-specialty') };
}

function contextSummary(conceptMatches) {
  const buckets = { present: [], uncertain: [], historical: [], resolved: [], family: [], negated: [] };
  for (const m of conceptMatches || []) {
    if (buckets[m.state]) buckets[m.state].push(m.label);
  }
  for (const key of Object.keys(buckets)) buckets[key] = uniqueStrings(buckets[key]).slice(0,12);
  return buckets;
}

module.exports = {
  concepts,
  knowledgeSchemaVersion,
  conceptById,
  extractClinicalConcepts,
  scoreConcepts,
  directoryEvidenceScores,
  activeQueryTokens,
  doctorConceptEvidence,
  detectRedFlags,
  chooseClarification,
  contextSummary,
  prepareClinicalInput,
  correctClinicalTypos,
  medicalPhraseNormalisations,
  inferPatientContext,
  normalizeText
};

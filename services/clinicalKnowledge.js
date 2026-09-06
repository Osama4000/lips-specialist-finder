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

function chooseClarification(conceptMatches, specialtyCandidates = []) {
  const active = (conceptMatches || []).filter(x => ['present','uncertain'].includes(x.state) && x.clarification);
  if (!active.length) return null;
  const top = specialtyCandidates[0]?.score || 0;
  const second = specialtyCandidates[1]?.score || 0;
  const ambiguous = !top || second > 0 && top - second < 4;
  const uncertain = active.some(x => x.state === 'uncertain');
  if (!ambiguous && !uncertain) return null;
  return active[0].clarification;
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
  inferPatientContext,
  normalizeText
};

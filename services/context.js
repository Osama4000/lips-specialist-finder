'use strict';

const HARD_BREAKS = new Set(['.', ';', '!', '?']);
const CONTRAST_BREAKS = new Set(['but', 'however', 'although', 'though', 'yet', 'except']);
const NEGATION_SINGLE_CUES = new Set(['no', 'denies', 'deny', 'denied', 'denying', 'without', 'never']);
const NEGATION_EXCEPTION_HEADS = new Set(['improvement', 'relief', 'response', 'change', 'benefit', 'effect']);
const POSITIVE_RESETS_AFTER_COMMA = new Set([
  'reports','reporting','has','have','having','with','experiencing','experience','presents','presenting','complains','complaining',
  'positive','developed','develops','now','currently','today','new','current','ongoing','persistent','recurrent','worsening',
  'mild','moderate','severe','painful','swollen','blocked','itchy','burning','bloody'
]);
const BODY_START_WORDS = new Set([
  'back','neck','head','face','eye','ear','nose','throat','chest','breast','abdomen','abdominal','stomach','pelvis','pelvic',
  'shoulder','arm','elbow','wrist','hand','finger','hip','knee','leg','ankle','foot','toe','skin','urine','jaw'
]);
const PRESENTATION_VERBS = new Set([
  'aches','hurts','locks','catches','clicks','swells','bleeds','burns','races','flutters','tingles','itches','pounds','throbs','gives'
]);
const OPTIONAL_LATERALITY = new Set(['left','right','bilateral','both']);
const WITH_NEGATION_CONTEXT = new Set([
  'activity', 'breathing', 'coughing', 'deep', 'eating', 'exercise', 'exertion', 'food',
  'meals', 'movement', 'motion', 'standing', 'swallowing', 'touch', 'urination', 'walking'
]);

const FAMILY_WORDS = new Set([
  'mother','mum','mom','father','dad','sister','brother','daughter','son','wife','husband','partner',
  'grandmother','grandfather','aunt','uncle','relative','family'
]);
const FAMILY_PATTERNS = [
  ['family','history','of'], ['family','hx','of'], ['mother','has'], ['mother','had'], ['father','has'], ['father','had'],
  ['mum','has'], ['mum','had'], ['dad','has'], ['dad','had'], ['sister','has'], ['sister','had'], ['brother','has'], ['brother','had']
];
const HISTORY_PATTERNS = [
  ['history','of'], ['past','history','of'], ['previous','history','of'], ['previously','had'], ['previously','suffered','from'],
  ['used','to','have'], ['in','the','past'], ['prior','episode','of'], ['previous','episode','of'], ['old','history','of']
];
const UNCERTAIN_PATTERNS = [
  ['possible'], ['possibly'], ['maybe'], ['perhaps'], ['suspected'], ['suspect'], ['query'], ['likely'], ['might','be'], ['could','be'],
  ['concern','for'], ['rule','out'], ['r/o']
];
const CURRENT_RESET = new Set(['currently','now','today','presenting','presents','reports','reporting','experiencing','has','having','developed','new']);
const RESOLVED_WORDS = new Set(['resolved','settled','cleared','gone']);

function normalizeText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9'+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeRaw(text) {
  const normalized = String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/([.,;!?])/g, ' $1 ')
    .replace(/[^a-z0-9'+.,;!?-]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.split(' ') : [];
}

function cueLengthAt(tokens, i) {
  const a = tokens[i] || '';
  const b = tokens[i + 1] || '';
  const c = tokens[i + 2] || '';
  const d = tokens[i + 3] || '';
  if (a === 'negative' && b === 'for') return 2;
  if (a === 'free' && b === 'of') return 2;
  if (a === 'absence' && b === 'of') return 2;
  if (['does', 'do', 'did'].includes(a) && b === 'not' && ['have', 'report', 'experience', 'describe'].includes(c)) return 3;
  if (["doesn't", 'doesnt', "don't", 'dont', "didn't", 'didnt'].includes(a) && ['have', 'report', 'experience', 'describe'].includes(b)) return 2;
  if (['is', 'are', 'was', 'were'].includes(a) && b === 'not' && ['experiencing', 'reporting', 'having'].includes(c)) return 3;
  if (a === 'not' && ['experiencing', 'reporting', 'having'].includes(b)) return 2;
  if (['has', 'have', 'had'].includes(a) && b === 'no') return 2;
  if (a === 'no' && NEGATION_EXCEPTION_HEADS.has(b)) return 0;
  if (a === 'not' && ['only', 'sure', 'certain'].includes(b)) return 0;
  if (NEGATION_SINGLE_CUES.has(a)) return 1;
  if (['does', 'do', 'did'].includes(a) && b === 'not' && ['currently', 'now'].includes(c) && d === 'have') return 4;
  return 0;
}

function startsPattern(tokens, i, patterns) {
  for (const p of patterns) {
    let ok = true;
    for (let j = 0; j < p.length; j++) if ((tokens[i + j] || '') !== p[j]) { ok = false; break; }
    if (ok) return p.length;
  }
  return 0;
}

function contextTokens(text) {
  const raw = tokenizeRaw(text);
  const result = [];
  let negRemaining = 0;
  let familyRemaining = 0;
  let historicalRemaining = 0;
  let uncertainRemaining = 0;
  let commaSinceNegCue = false;
  let negatedContentCount = 0;
  let clause = 0;

  const clearClauseScopes = () => {
    negRemaining = 0;
    familyRemaining = 0;
    historicalRemaining = 0;
    uncertainRemaining = 0;
    commaSinceNegCue = false;
    negatedContentCount = 0;
  };

  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];
    if (HARD_BREAKS.has(token) || CONTRAST_BREAKS.has(token)) {
      clearClauseScopes();
      clause += 1;
      continue;
    }
    if (token === ',') {
      commaSinceNegCue = true;
      // Commas separate local context windows (history/resolution/family look-back)
      // without automatically ending an active negation list.
      clause += 1;
      continue;
    }

    if (negRemaining > 0 && commaSinceNegCue && POSITIVE_RESETS_AFTER_COMMA.has(token)) negRemaining = 0;
    if (negRemaining > 0 && commaSinceNegCue && BODY_START_WORDS.has(token) && PRESENTATION_VERBS.has(raw[i + 1] || '')) negRemaining = 0;
    if (negRemaining > 0 && token === 'and' && POSITIVE_RESETS_AFTER_COMMA.has(raw[i + 1] || '')) negRemaining = 0;
    if (negRemaining > 0 && token === 'with' && negatedContentCount >= 2 && !WITH_NEGATION_CONTEXT.has(raw[i + 1] || '')) negRemaining = 0;

    if (CURRENT_RESET.has(token) && (historicalRemaining > 0 || familyRemaining > 0) && i > 0) {
      historicalRemaining = 0;
      familyRemaining = 0;
      uncertainRemaining = 0;
    }

    const negCue = cueLengthAt(raw, i);
    if (negCue > 0) {
      for (let j = 0; j < negCue; j++) result.push({ token: raw[i + j], negated: false, family: false, historical: false, uncertain: false, cue: true, clause });
      i += negCue - 1;
      negRemaining = 24;
      commaSinceNegCue = false;
      negatedContentCount = 0;
      continue;
    }

    const familyCue = startsPattern(raw, i, FAMILY_PATTERNS);
    if (familyCue > 0 || FAMILY_WORDS.has(token) && ['has','had','with','suffers'].includes(raw[i + 1] || '')) {
      const len = familyCue || 1;
      for (let j = 0; j < len; j++) result.push({ token: raw[i + j], negated: false, family: true, historical: false, uncertain: false, cue: true, clause });
      i += len - 1;
      familyRemaining = 24;
      historicalRemaining = 0;
      continue;
    }

    const historyCue = startsPattern(raw, i, HISTORY_PATTERNS);
    if (historyCue > 0) {
      for (let j = 0; j < historyCue; j++) result.push({ token: raw[i + j], negated: false, family: false, historical: true, uncertain: false, cue: true, clause });
      i += historyCue - 1;
      historicalRemaining = 20;
      continue;
    }

    const uncertainCue = startsPattern(raw, i, UNCERTAIN_PATTERNS);
    if (uncertainCue > 0) {
      for (let j = 0; j < uncertainCue; j++) result.push({ token: raw[i + j], negated: false, family: false, historical: false, uncertain: true, cue: true, clause });
      i += uncertainCue - 1;
      uncertainRemaining = 8;
      continue;
    }

    result.push({
      token,
      negated: negRemaining > 0,
      family: familyRemaining > 0,
      historical: historicalRemaining > 0,
      uncertain: uncertainRemaining > 0,
      cue: false,
      clause
    });

    if (negRemaining > 0) {
      negRemaining -= 1;
      if (!['and', 'or', 'with'].includes(token)) negatedContentCount += 1;
    }
    if (familyRemaining > 0) familyRemaining -= 1;
    if (historicalRemaining > 0) historicalRemaining -= 1;
    if (uncertainRemaining > 0) uncertainRemaining -= 1;
  }
  return result;
}

function phraseTokens(term) {
  return tokenizeRaw(term).filter(t => !HARD_BREAKS.has(t) && t !== ',');
}

function phraseContexts(text, term) {
  const phrase = phraseTokens(term);
  const allWords = contextTokens(text).filter(x => !x.cue);
  // Generic clinical phrases should still match normal laterality wording, e.g.
  // "right knee pain" → "knee pain" and "buzzing in the left ear" → "buzzing in the ear".
  // A phrase that explicitly contains laterality keeps exact matching.
  const phraseHasLaterality = phrase.some(t => OPTIONAL_LATERALITY.has(t));
  const words = phraseHasLaterality ? allWords : allWords.filter(x => !OPTIONAL_LATERALITY.has(x.token));
  const matches = [];
  if (!phrase.length || words.length < phrase.length) return matches;

  for (let i = 0; i <= words.length - phrase.length; i++) {
    let same = true;
    for (let j = 0; j < phrase.length; j++) {
      if (words[i + j].token !== phrase[j]) { same = false; break; }
      if (j > 0 && words[i + j].clause !== words[i].clause) { same = false; break; }
    }
    if (!same) continue;
    const slice = words.slice(i, i + phrase.length);
    const clauseWords = words.filter(x => x.clause === words[i].clause);
    const clauseIndex = clauseWords.findIndex(x => x === words[i]);
    const around = clauseWords.slice(Math.max(0, clauseIndex - 5), Math.min(clauseWords.length, clauseIndex + phrase.length + 5));
    const after = clauseWords.slice(clauseIndex + phrase.length, Math.min(clauseWords.length, clauseIndex + phrase.length + 5)).map(x => x.token);
    const before = clauseWords.slice(Math.max(0, clauseIndex - 5), clauseIndex).map(x => x.token);

    let state = 'present';
    if (slice.some(x => x.negated)) state = 'negated';
    else if (slice.some(x => x.family)) state = 'family';
    else if (slice.some(x => x.historical)) state = 'historical';
    else if (slice.some(x => x.uncertain)) state = 'uncertain';

    // Post-mention wording such as "back pain resolved" or "pain has now gone".
    if (state === 'present') {
      const afterSet = new Set(after);
      if (after.some(x => RESOLVED_WORDS.has(x)) || (afterSet.has('no') && afterSet.has('longer')) || (afterSet.has('now') && afterSet.has('gone'))) state = 'resolved';
      if (state === 'present' && (before.includes('resolved') || before.includes('previous'))) state = 'historical';
    }

    matches.push({ state, clause: words[i].clause, before, after, tokens: around.map(x => x.token) });
  }
  return matches;
}

const STATE_PRIORITY = ['present','uncertain','historical','resolved','family','negated'];
function phraseContext(text, term) {
  const matches = phraseContexts(text, term);
  if (!matches.length) return { found: false, state: null, states: [] };
  const states = [...new Set(matches.map(x => x.state))];
  const state = STATE_PRIORITY.find(x => states.includes(x)) || states[0];
  return { found: true, state, states, matches };
}

function inferPatientContext(text) {
  const n = normalizeText(text);
  let ageGroup = null;
  const ageMatch = n.match(/\b(\d{1,3})\s*(?:year|years|yr|yrs)\s*old\b/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    if (age >= 0 && age <= 15) ageGroup = 'child';
    else if (age >= 16) ageGroup = 'adult';
  }
  if (!ageGroup && /\b(baby|infant|toddler|child|paediatric|pediatric|boy|girl)\b/.test(n)) ageGroup = 'child';
  if (!ageGroup && /\b(adult|elderly|older adult|older patient)\b/.test(n)) ageGroup = 'adult';
  return { ageGroup };
}

module.exports = {
  normalizeText,
  tokenizeRaw,
  contextTokens,
  phraseTokens,
  phraseContext,
  phraseContexts,
  inferPatientContext
};

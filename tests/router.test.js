const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  routeSymptoms,
  rankDoctors,
  rankDoctorsForRouting,
  detectUrgency,
  phraseAssertion,
  subSpecialtyEquivalent
} = require('../services/router');

const doctors = [
  {name:'Barry',specialty:'Trauma & Orthopaedics',subSpecialties:['Knee','Sports Injury'],expertise:['knee replacement'],conditions:['knee pain']},
  {name:'Fadi',specialty:'Cardiology',subSpecialties:['Heart Failure','Arrythmia'],expertise:['palpitations'],conditions:['heart failure']},
  {name:'Imtiaz',specialty:'Neurology',subSpecialties:['Headache','Seizures'],expertise:['migraine'],conditions:['seizure']},
  {name:'Geoffrey',specialty:'Dermatology',subSpecialties:[],expertise:['eczema','skin cancer'],conditions:['rash']},
  {name:'GI',specialty:'Gastroenterology and Hepatology',subSpecialties:['Hepatology','Upper GI'],expertise:['acid reflux','liver disease'],conditions:['reflux']}
];

test('knee symptoms route to trauma & orthopaedics and knee',()=>{
  const r=routeSymptoms('Persistent knee pain, swelling and difficulty walking.',doctors);
  assert.equal(r.specialty,'Trauma & Orthopaedics');
  assert.equal(r.subSpecialty,'Knee');
});

test('palpitations route to cardiology',()=>{
  const r=routeSymptoms('Patient reports recurrent palpitations and a racing heart.',doctors);
  assert.equal(r.specialty,'Cardiology');
});

test('migraine and numbness route to neurology',()=>{
  const r=routeSymptoms('Recurring migraines with numbness.',doctors);
  assert.equal(r.specialty,'Neurology');
});

test('rash and itching route to dermatology',()=>{
  const r=routeSymptoms('Skin rash and severe itching.',doctors);
  assert.equal(r.specialty,'Dermatology');
});

test('acid reflux routes to gastroenterology',()=>{
  const r=routeSymptoms('Burning after meals with persistent acid reflux and heartburn.',doctors);
  assert.equal(r.specialty,'Gastroenterology');
  assert.equal(r.subSpecialty,'Upper GI');
});

test('diabetes routes to the current Diabetes specialty rather than Endocrinology',()=>{
  const liveDoctors=[...doctors,{name:'Diabetes Consultant',specialty:'Diabetes',specialties:['Diabetes','Endocrinology'],expertise:['type 2 diabetes','insulin pump']}];
  const r=routeSymptoms('Type 2 diabetes with poor blood sugar control and insulin treatment.',liveDoctors);
  assert.equal(r.specialty,'Diabetes');
});

test('thyroid symptoms route to Endocrinology',()=>{
  const liveDoctors=[...doctors,{name:'Endocrine Consultant',specialty:'Diabetes',specialties:['Diabetes','Endocrinology'],expertise:['thyroid disease']}];
  const r=routeSymptoms('Thyroid nodule with known hyperthyroidism.',liveDoctors);
  assert.equal(r.specialty,'Endocrinology');
});

test('frailty and recurrent falls in an older adult route to Geriatrics',()=>{
  const liveDoctors=[...doctors,{name:'Geriatrician',specialty:'Geriatrics',specialties:['Geriatrics'],expertise:['frailty','recurrent falls']}];
  const r=routeSymptoms('Older adult with frailty, recurrent falls and functional decline.',liveDoctors);
  assert.equal(r.specialty,'Geriatrics');
});

test('no chest pain alone does not route to cardiology',()=>{
  const r=routeSymptoms('No chest pain.',doctors);
  assert.equal(r.specialty,null);
  assert.equal(r.uncertain,true);
  assert.ok(r.negatedTerms.includes('chest pain'));
});

test('negated chest symptom does not override positive knee symptoms',()=>{
  const r=routeSymptoms('No chest pain. The main problem is persistent knee pain and swelling.',doctors);
  assert.equal(r.specialty,'Trauma & Orthopaedics');
  assert.ok(r.negatedTerms.includes('chest pain'));
});

test('denied cardiology list is ignored before a positive GI complaint',()=>{
  const r=routeSymptoms('Denies chest pain, palpitations or shortness of breath, but reports acid reflux and heartburn.',doctors);
  assert.equal(r.specialty,'Gastroenterology');
  assert.ok(r.negatedTerms.includes('palpitations'));
  assert.ok(r.negatedTerms.includes('shortness of breath'));
});

test('positive chest pain remains cardiology when palpitations are denied',()=>{
  const r=routeSymptoms('Chest pain on exertion but no palpitations.',doctors);
  assert.equal(r.specialty,'Cardiology');
  assert.ok(r.negatedTerms.includes('palpitations'));
});

test('no improvement in chest pain means chest pain is still present',()=>{
  const state=phraseAssertion('No improvement in chest pain despite rest.','chest pain');
  assert.equal(state.affirmed,true);
  const r=routeSymptoms('No improvement in chest pain despite rest.',doctors);
  assert.equal(r.specialty,'Cardiology');
});

test('not only is not treated as symptom negation',()=>{
  const r=routeSymptoms('Not only chest pain but also palpitations.',doctors);
  assert.equal(r.specialty,'Cardiology');
});

test('reported symptom after a comma resets a denial scope',()=>{
  const r=routeSymptoms('Denies chest pain, has a widespread itchy rash.',doctors);
  assert.equal(r.specialty,'Dermatology');
});


test('conjunction with a new positive report resets negation scope',()=>{
  const r=routeSymptoms('No chest pain and experiencing palpitations.',doctors);
  assert.equal(r.specialty,'Cardiology');
  assert.ok(r.negatedTerms.includes('chest pain'));
  assert.ok(r.matchedTerms.includes('palpitations'));
});

test('with can start a new positive symptom after a specific denied symptom',()=>{
  const r=routeSymptoms('No chest pain with palpitations.',doctors);
  assert.equal(r.specialty,'Cardiology');
  assert.ok(r.negatedTerms.includes('chest pain'));
  assert.ok(r.matchedTerms.includes('palpitations'));
});

test('with keeps contextual wording inside a denied symptom',()=>{
  const state=phraseAssertion('No pain with urination.','urination');
  assert.equal(state.negated,true);
  assert.equal(state.affirmed,false);
  const r=routeSymptoms('No pain with urination.',doctors);
  assert.notEqual(r.specialty,'Urology & Andrology');
});


test('shoulder body region beats generic sports-injury context for sub-specialty',()=>{
  const r=routeSymptoms('Shoulder pain after a gym injury.',doctors);
  assert.equal(r.specialty,'Trauma & Orthopaedics');
  assert.equal(r.subSpecialty,'Upper Limb');
});

test('changing mole routes to Dermatology Skin Cancer',()=>{
  const r=routeSymptoms('A suspicious changing mole.',doctors);
  assert.equal(r.specialty,'Dermatology');
  assert.equal(r.subSpecialty,'Skin Cancer');
});
test('explicit non-surgical aesthetic request routes to Aesthetics',()=>{
  const r=routeSymptoms('Interested in Botox and facial skin rejuvenation.',doctors);
  assert.equal(r.specialty,'Aesthetics');
});

test('impacted wisdom tooth routes to Maxillofacial Oral Surgery',()=>{
  const r=routeSymptoms('Pain from an impacted wisdom tooth.',doctors);
  assert.equal(r.specialty,'Maxillofacial');
  assert.equal(r.subSpecialty,'Oral Surgery');
});
test('negated urgent symptoms do not trigger urgent flag',()=>{
  const r=detectUrgency('No severe chest pain and no severe difficulty breathing.');
  assert.equal(r.urgent,false);
});

test('urgent detector flags severe chest pain and breathing difficulty',()=>{
  const r=detectUrgency('Severe chest pain and difficulty breathing.');
  assert.equal(r.urgent,true);
});

test('empty symptoms are detected',()=>{
  assert.equal(routeSymptoms('  ',doctors).empty,true);
});

test('generic pain does not force a specialty',()=>{
  const r=routeSymptoms('Pain and discomfort.',doctors);
  assert.equal(r.specialty,null);
  assert.equal(r.uncertain,true);
});

test('website specialty aliases still rank the right doctors',()=>{
  const r=rankDoctors([{name:'GI',specialty:'Gastroenterology and Hepatology',subSpecialties:['Hepatology']}],'Gastroenterology','Hepatology','liver problem');
  assert.equal(r.length,1);
  assert.equal(r[0].name,'GI');
});

test('a doctor can match through a verified secondary specialty',()=>{
  const r=rankDoctors([{
    name:'Dual specialist',
    specialty:'Diabetes',
    specialties:['Diabetes','Endocrinology'],
    expertise:['thyroid disease']
  }],'Endocrinology',null,'thyroid disease');
  assert.equal(r.length,1);
  assert.equal(r[0].name,'Dual specialist');
});

test('Arrythmia website spelling is equivalent to Arrhythmia',()=>{
  assert.equal(subSpecialtyEquivalent('Arrythmia','Arrhythmia'),true);
});

test('doctor ranking prefers exact sub-specialty over a LIPS clinic generalist',()=>{
  const r=rankDoctors([
    {name:'Exact non-LIPS',specialty:'Cardiology',subSpecialties:['Arrythmia'],expertise:['palpitations'],worksAtLipsHealthcare:false},
    {name:'General LIPS',specialty:'Cardiology',subSpecialties:['General Cardiology'],expertise:['palpitations'],worksAtLipsHealthcare:true}
  ],'Cardiology','Arrhythmia','palpitations');
  assert.equal(r[0].name,'Exact non-LIPS');
});

test('LIPS clinic doctor is prioritised among clinically equivalent doctors',()=>{
  const r=rankDoctors([
    {name:'Non-LIPS',specialty:'Cardiology',subSpecialties:['Arrythmia'],expertise:['palpitations'],worksAtLipsHealthcare:false},
    {name:'LIPS',specialty:'Cardiology',subSpecialties:['Arrhythmia'],expertise:['palpitations'],worksAtLipsHealthcare:true}
  ],'Cardiology','Arrhythmia','palpitations');
  assert.equal(r[0].name,'LIPS');
});

test('LIPS preference can be disabled with a safe runtime option',()=>{
  const r=rankDoctors([
    {name:'A non-LIPS',specialty:'Cardiology',subSpecialties:['Arrythmia'],expertise:['palpitations','racing'],worksAtLipsHealthcare:false},
    {name:'Z LIPS',specialty:'Cardiology',subSpecialties:['Arrhythmia'],expertise:['palpitations'],worksAtLipsHealthcare:true}
  ],'Cardiology','Arrhythmia','palpitations racing',{preferLipsHealthcare:false});
  assert.equal(r[0].name,'A non-LIPS');
});

test('missing doctor data does not break ranking',()=>{
  const r=rankDoctors([{name:'X',specialty:'Cardiology'}],'Cardiology',null,'palpitations');
  assert.equal(r[0].name,'X');
});

test('negated terms do not contribute profile evidence',()=>{
  const r=rankDoctors([
    {name:'A',specialty:'Cardiology',expertise:['chest pain']},
    {name:'B',specialty:'Cardiology',expertise:['palpitations']}
  ],'Cardiology',null,'No chest pain. Palpitations present.');
  assert.equal(r[0].name,'B');
  assert.match(r[0].matchReasons.join(' '),/palpitations/);
});

test('frontend View More uses a dedicated singleton container',()=>{
  const app = fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app, /id="more-container"/);
  assert.match(app, /moreContainer\.replaceChildren\(\)/);
  assert.doesNotMatch(app, /grid\.after\(more\)/);
});

test('frontend visually exposes ignored negated symptoms and LIPS priority',()=>{
  const app = fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app, /Ignored because they were denied\/absent/);
  assert.match(app, /LIPS clinic priority/);
  assert.match(app, /worksAtLipsHealthcare/);
});

test('frontend exposes secondary specialties from live LIPS profiles',()=>{
  const app = fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app, /secondarySpecialties/);
  assert.match(app, /Also listed under/);
});

test('production API can require a fully refreshed directory before routing',()=>{
  const server = fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(server, /REQUIRE_READY_DIRECTORY/);
  assert.match(server, /DIRECTORY_NOT_READY/);
});


test('a rejected refresh can keep the last verified directory routable',()=>{
  const server = fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  const scraper = fs.readFileSync(path.join(__dirname,'..','scraper','lipsScraper.js'),'utf8');
  assert.match(server, /Boolean\(metadata\?\.lastUpdated\)/);
  assert.match(scraper, /previousMetadata\?\.lastUpdated/);
  assert.match(scraper, /lastAttemptPassedCoverageGate/);
});

test('admin exposes live updater progress fields',()=>{
  const html = fs.readFileSync(path.join(__dirname,'..','public','admin.html'),'utf8');
  const js = fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');
  assert.match(html, /id="progress-bar"/);
  assert.match(html, /id="processed"/);
  assert.match(html, /id="retry-progress"/);
  assert.match(js, /updateProgress/);
});

test('low-memory deployment can disable server-side crawling',()=>{
  const server = fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  const render = fs.readFileSync(path.join(__dirname,'..','render.yaml'),'utf8');
  assert.match(server, /SERVER_SCRAPER_ENABLED/);
  assert.match(server, /SERVER_SCRAPER_DISABLED/);
  assert.match(render, /SERVER_SCRAPER_ENABLED/);
  assert.match(render, /value: 'false'/);
});

test('free Render blueprint avoids browser runtime and persistent disk',()=>{
  const render = fs.readFileSync(path.join(__dirname,'..','render.yaml'),'utf8');
  assert.match(render, /runtime: node/);
  assert.match(render, /plan: free/);
  assert.doesNotMatch(render, /runtime: docker/);
  assert.doesNotMatch(render, /disk:/);
  assert.doesNotMatch(render, /playwright install/);
});

test('directory refresh is delegated to a GitHub Actions workflow',()=>{
  const workflow = fs.readFileSync(path.join(__dirname,'..','.github','workflows','update-lips-directory.yml'),'utf8');
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /Verify coverage gate/);
  assert.match(workflow, /git push/);
});

test('family-history symptoms are not treated as the patient current complaint',()=>{
  const r=routeSymptoms('Mother had breast cancer. Patient has persistent knee pain.',doctors);
  assert.equal(r.specialty,'Trauma & Orthopaedics');
  assert.ok(r.contextSummary.family.includes('Breast cancer concern'));
});

test('historical chest pain does not override a current reflux complaint',()=>{
  const r=routeSymptoms('History of chest pain last year but currently has acid reflux and heartburn.',doctors);
  assert.equal(r.specialty,'Gastroenterology');
  assert.ok(r.contextSummary.historical.includes('Chest pain / pressure'));
});

test('resolved symptoms are ignored when a new current body area is described',()=>{
  const r=routeSymptoms('Back pain has resolved. Current shoulder pain and stiffness.',doctors);
  assert.equal(r.specialty,'Trauma & Orthopaedics');
  assert.equal(r.subSpecialty,'Upper Limb');
  assert.ok(r.contextSummary.resolved.includes('Back pain'));
});

test('uncertain wording is down-weighted and surfaced as uncertain',()=>{
  const live=[...doctors,{name:'Endo',specialty:'Endocrinology',subSpecialties:['Thyroid'],expertise:['thyroid']}];
  const r=routeSymptoms('Possible thyroid problem with a neck lump.',live);
  assert.equal(r.specialty,'Endocrinology');
  assert.equal(r.uncertain,true);
  assert.ok(r.contextSummary.uncertain.includes('Thyroid problem'));
});

test('common-language radicular back pain routes to a spine pathway',()=>{
  const live=[...doctors,{name:'Spine Neuro',specialty:'Neurosurgery',subSpecialties:['Spinal Surgery'],expertise:['back pain','sciatica']}];
  const r=routeSymptoms('Lower back pain shooting down the right leg with tingling.',live);
  assert.equal(r.specialty,'Neurosurgery');
  assert.equal(r.subSpecialty,'Spinal Surgery');
  assert.ok(r.contextSummary.present.includes('Sciatica / radicular pain'));
});

test('back pain with new bladder change triggers the cauda equina guardrail',()=>{
  const r=routeSymptoms('Severe low back pain radiating down the leg with new bladder problems.',doctors);
  assert.equal(r.urgency.urgent,true);
  assert.ok(r.urgency.rules.some(x=>x.id==='cauda-equina'));
});

test('generic back pain can ask one targeted clarification question',()=>{
  const r=routeSymptoms('Lower back ache for several weeks.',doctors);
  assert.ok(r.clarification);
  assert.match(r.clarification.question,/travel into a leg|numbness/i);
  assert.ok(r.clarification.options.length>=3);
});

test('live LIPS profile terms can route a condition that is not hard-coded',()=>{
  const live=[
    ...doctors,
    {name:'Vascular TOS',specialty:'Vascular Surgery',subSpecialties:['Vascular Surgery'],conditions:['thoracic outlet syndrome'],expertise:['thoracic outlet syndrome']}
  ];
  const r=routeSymptoms('Assessment for thoracic outlet syndrome.',live);
  assert.equal(r.specialty,'Vascular Surgery');
  assert.ok(r.directoryEvidence.some(x=>x.term==='thoracic outlet syndrome'));
});

test('concept synonyms can match canonical doctor-profile evidence',()=>{
  const { rankDoctorsForRouting } = require('../services/router');
  const live=[
    {name:'Spine A',specialty:'Neurosurgery',subSpecialties:['Spinal Surgery'],conditions:['Back pain'],expertise:['Sciatica']},
    {name:'General Neuro',specialty:'Neurosurgery',subSpecialties:[],conditions:['brain tumour'],expertise:['neuro-oncology']}
  ];
  const q='Lower back ache with pain shooting down the leg.';
  const r=routeSymptoms(q,live);
  const ranked=rankDoctorsForRouting(live,r,q,{preferLipsHealthcare:true});
  assert.equal(ranked[0].name,'Spine A');
  assert.ok(ranked[0].conceptEvidence.some(x=>x.id==='back_pain' || x.id==='sciatica'));
});

test('anatomically incompatible orthopaedic subspecialty is pushed behind a knee specialist',()=>{
  const { rankDoctorsForRouting } = require('../services/router');
  const live=[
    {name:'Shoulder Only',specialty:'Trauma & Orthopaedics',subSpecialties:['Shoulder','Elbow'],expertise:['shoulder']},
    {name:'Knee Expert',specialty:'Trauma & Orthopaedics',subSpecialties:['Knee'],expertise:['knee pain']}
  ];
  const q='Knee pain and locking.';
  const r=routeSymptoms(q,live);
  const ranked=rankDoctorsForRouting(live,r,q,{preferLipsHealthcare:true});
  assert.equal(ranked[0].name,'Knee Expert');
  assert.equal(ranked.at(-1).scopeMismatch,true);
});

test('voice dictation UI uses browser speech recognition with UK English and graceful fallback',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(html,/id="mic-btn"/);
  assert.match(js,/SpeechRecognition|webkitSpeechRecognition/);
  assert.match(js,/recognition\.lang = 'en-GB'/);
  assert.match(js,/Voice dictation is not supported by this browser/);
});

test('frontend exposes context categories and click-to-refine clarification options',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(js,/Past history — not treated as current/);
  assert.match(js,/Family \/ other person — ignored/);
  assert.match(js,/data-clarify-index/);
  assert.match(js,/option\.append/);
});

test('clinical ontology contains a broad external synonym layer',()=>{
  const knowledge=require('../clinical-knowledge/symptoms.json');
  assert.ok(knowledge.concepts.length>=100);
  const back=knowledge.concepts.find(x=>x.id==='back_pain');
  assert.ok(back.synonyms.includes('lower back ache'));
  assert.ok(back.sources.some(x=>/NICE/i.test(x)));
});

test('Vercel entry exports the Express app directly',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(server,/module\.exports = app/);
});

test('clinical knowledge base has unique valid concept ids and routing weights', () => {
  const knowledge = require('../clinical-knowledge/symptoms.json');
  const concepts = knowledge.concepts || [];
  const ids = concepts.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'concept ids must be unique');
  for (const concept of concepts) {
    assert.match(concept.id, /^[a-z0-9_]+$/);
    assert.ok(String(concept.label || '').trim().length >= 2);
    assert.ok(Array.isArray(concept.synonyms) && concept.synonyms.length >= 1);
    for (const [specialty, weight] of Object.entries(concept.specialtyWeights || {})) {
      assert.ok(String(specialty).trim());
      assert.ok(Number.isFinite(Number(weight)) && Number(weight) >= 0);
    }
  }
});

test('server allows microphone permission only for the same origin', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /Permissions-Policy/);
  assert.match(server, /microphone=\(self\)/);
});

test('laterality words do not break common symptom phrase recognition', () => {
  const knee = routeSymptoms('Right knee pain and swelling.', []);
  assert.equal(knee.specialty, 'Trauma & Orthopaedics');
  assert.equal(knee.subSpecialty, 'Knee');
  const ear = routeSymptoms('Buzzing in the left ear.', []);
  assert.equal(ear.specialty, 'ENT');
  assert.equal(ear.subSpecialty, 'Ear & Balance');
});

test('a clearly positive new complaint after a denied comma clause can reset negation', () => {
  const r = routeSymptoms('No palpitations, no breathlessness, knee locks after football.', []);
  assert.equal(r.specialty, 'Trauma & Orthopaedics');
  assert.equal(r.subSpecialty, 'Knee');
  assert.ok(r.contextSummary.negated.includes('Palpitations'));
});

test('positive severity wording after a denied comma clause is not swallowed by negation', () => {
  const r = routeSymptoms('No severe chest pain, mild reflux after meals.', []);
  assert.equal(r.specialty, 'Gastroenterology');
  assert.ok(r.contextSummary.negated.includes('Chest pain / pressure'));
  assert.ok(r.contextSummary.present.includes('Reflux / heartburn'));
});

test('resolved history before a comma does not contaminate a new current symptom', () => {
  const r = routeSymptoms('Previous migraine has resolved, now blurred vision.', []);
  assert.equal(r.specialty, 'Ophthalmology');
  assert.ok(r.contextSummary.resolved.includes('Migraine'));
  assert.ok(r.contextSummary.present.includes('Blurred / double vision'));
});

test('doctor evidence labels are deduplicated case-insensitively', () => {
  const doctors = [{
    name: 'Dr Rhythm', specialty: 'Cardiology', specialties: ['Cardiology'],
    subSpecialties: ['Arrhythmia'], expertise: ['Palpitations'], conditions: ['palpitations'], biography: '',
    profileUrl: 'https://lips.org.uk/our-specialists/dr-rhythm'
  }];
  const routing = routeSymptoms('Recurrent palpitations and heart racing.', doctors);
  const ranked = rankDoctorsForRouting(doctors, routing, 'Recurrent palpitations and heart racing.');
  const profileReason = ranked[0].matchReasons.find(x => x.startsWith('Profile evidence:')) || '';
  const tail = profileReason.replace('Profile evidence:', '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  assert.equal(new Set(tail).size, tail.length);
});

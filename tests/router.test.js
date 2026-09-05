const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  routeSymptoms,
  rankDoctors,
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

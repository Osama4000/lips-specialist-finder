const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalUrl,
  extractStructured,
  extractSpecialtiesFromLines,
  extractLocations,
  extractProfileUrls,
  extractProfileSlugs,
  mergeFreshWithPrevious,
  extractOntologyTerms
} = require('../scraper/lipsScraper');

test('canonical profile URL is normalized and rejects non-profile paths',()=>{
  assert.equal(canonicalUrl('https://lips.org.uk/our-specialists/barry-andrews/?x=1#bio'),'https://lips.org.uk/our-specialists/barry-andrews/');
  assert.equal(canonicalUrl('https://lips.org.uk/our-specialists'),null);
  assert.equal(canonicalUrl('https://lips.org.uk/our-specialists/emergency-clinic/'),null);
});

test('profile extraction identifies role and taxonomy without location contamination',()=>{
  const text=`Dr Barry Andrews\nMbChB, BMedSci\nConsultant Knee and Orthopaedic Trauma Surgeon\nTrauma & Orthopaedics\nTraumatic Injuries\nKnee\nSports Injury\n4.93/5\nReviews\nGMC: 4743831\nBiography\nBarry is a consultant orthopaedic surgeon specialising in knee and trauma surgery.\nLocations\nPrivate\nLIPS Healthcare, Battersea Power Station\nBattersea Power Station, Turbine Hall B, Level 1, London, SW11 8DD\nAvailability`;
  const p=extractStructured(text,'Dr Barry Andrews');
  assert.equal(p.role,'Consultant Knee and Orthopaedic Trauma Surgeon');
  assert.equal(p.specialty,'Trauma & Orthopaedics');
  assert.ok(p.subSpecialties.includes('Knee'));
  assert.equal(p.subSpecialties.some(x=>/Battersea|SW11/i.test(x)),false);
});

test('profile keyword extraction does not match ENT inside Preventive',()=>{
  const text=`Dr Test\nConsultant Cardiologist\nCardiology\nPreventive Cardiology\nBiography\nA consultant with a preventive cardiology practice.`;
  const p=extractStructured(text,'Dr Test');
  assert.equal(p.specialty,'Cardiology');
  assert.equal(p.expertise.includes('ent'),false);
});


test('degree credentials never become sub-specialties',()=>{
  const text=`Dr Example
MBBS, FRCP
Consultant Cardiologist
Cardiology
Echocardiography
Biography
Example biography text.`;
  const p=extractStructured(text,'Dr Example');
  assert.deepEqual(p.subSpecialties,['Echocardiography']);
  assert.equal(p.subSpecialties.includes('MBBS'),false);
  assert.equal(p.subSpecialties.includes('FRCP'),false);
});

test('consultant role can recover a missing explicit specialty line',()=>{
  const text=`Mr Example
MBBS, FRCS
Consultant General Surgeon
Biography
Example biography text.`;
  const p=extractStructured(text,'Mr Example');
  assert.equal(p.specialty,'General Surgery');
});

test('profile taxonomy preserves primary and secondary specialties in display order',()=>{
  const text=`Dr Example
MBBS, MRCP
Consultant in Diabetes and Endocrinology
Diabetes Endocrinology
Biography
Clinical work includes diabetes and thyroid disease.`;
  const p=extractStructured(text,'Dr Example');
  assert.equal(p.specialty,'Diabetes');
  assert.deepEqual(p.specialties.slice(0,2),['Diabetes','Endocrinology']);
  assert.equal(p.subSpecialties.includes('Endocrinology'),false);
});

test('specialty parser ignores role wording when explicit profile taxonomy exists',()=>{
  const specialties=extractSpecialtiesFromLines([
    'Consultant Endocrinology and Diabetes',
    'Diabetes Endocrinology'
  ]);
  assert.deepEqual(specialties.slice(0,2),['Diabetes','Endocrinology']);
});
test('location extractor marks LIPS only from clinician Locations section',()=>{
  const text=`Dr Test\nConsultant Cardiologist\nCardiology\nLocations\nSub-specialities\nPrimary\nNHS Hospital\n1 NHS Street, London\nPrivate\nLIPS Healthcare, Battersea Power Station\nBattersea Power Station, Turbine Hall B, Level 1, London, SW11 8DD\nappointments@lips.org.uk\n+44 20 7164 6114\nPrivate\nOther Clinic\n10 Harley Street, London\nAvailability\nOur Location\nLIPS Healthcare\n1st Floor, Turbine Hall B, Battersea`;
  const p=extractLocations(text);
  assert.equal(p.locationVerified,true);
  assert.equal(p.worksAtLipsHealthcare,true);
  assert.equal(p.locations.length,3);
  assert.equal(p.locations[1].name,'LIPS Healthcare, Battersea Power Station');
});

test('footer Our Location does not create a false LIPS clinician location',()=>{
  const text=`Dr Other\nConsultant ENT Surgeon\nENT\nLocations\nPrivate\nNorthway Clinic London\n13 Minnie Baldock St, London\nAvailability\nContact us\nOur Location\nLIPS Healthcare\n1st Floor, Turbine Hall B, Battersea`;
  const p=extractLocations(text);
  assert.equal(p.locationVerified,true);
  assert.equal(p.worksAtLipsHealthcare,false);
  assert.deepEqual(p.locations.map(x=>x.name),['Northway Clinic London']);
});

test('missing clinician Locations section stays unverified instead of false',()=>{
  const p=extractLocations('Dr Test\nOur Location\nLIPS Healthcare\nBattersea');
  assert.equal(p.locationVerified,false);
  assert.equal(p.worksAtLipsHealthcare,null);
});

test('verified location refresh can remove an old LIPS flag',()=>{
  const previous=[{name:'Dr X',profileUrl:'https://lips.org.uk/our-specialists/x/',specialty:'Cardiology',locations:[{name:'LIPS Healthcare, Battersea Power Station'}],locationVerified:true,worksAtLipsHealthcare:true}];
  const fresh=[{name:'Dr X',profileUrl:'https://lips.org.uk/our-specialists/x/',specialty:'Cardiology',locations:[{name:'Other Clinic'}],locationVerified:true,worksAtLipsHealthcare:false,scrapedAt:'2026-01-01T00:00:00.000Z'}];
  const merged=mergeFreshWithPrevious(fresh,previous);
  assert.equal(merged[0].worksAtLipsHealthcare,false);
  assert.deepEqual(merged[0].locations.map(x=>x.name),['Other Clinic']);
});

test('unverified location refresh preserves prior verified location data',()=>{
  const previous=[{name:'Dr X',profileUrl:'https://lips.org.uk/our-specialists/x/',specialty:'Cardiology',locations:[{name:'LIPS Healthcare, Battersea Power Station'}],locationVerified:true,worksAtLipsHealthcare:true}];
  const fresh=[{name:'Dr X',profileUrl:'https://lips.org.uk/our-specialists/x/',specialty:'Cardiology',locations:[],locationVerified:false,worksAtLipsHealthcare:null,scrapedAt:'2026-01-01T00:00:00.000Z'}];
  const merged=mergeFreshWithPrevious(fresh,previous);
  assert.equal(merged[0].worksAtLipsHealthcare,true);
  assert.equal(merged[0].locationVerified,true);
});

test('profile URL extractor deduplicates profile links',()=>{
  const r=extractProfileUrls('https://lips.org.uk/our-specialists/a/ https://lips.org.uk/our-specialists/a/?x=1 /our-specialists/b/');
  assert.equal(r.length,2);
});

test('profile URL extractor handles escaped JSON urls',()=>{
  const r=extractProfileUrls('{"profileUrl":"https:\\/\\/lips.org.uk\\/our-specialists\\/fadi-jouhra\\/"}');
  assert.deepEqual(r,['https://lips.org.uk/our-specialists/fadi-jouhra/']);
});

test('profile slug extractor handles specialist API payloads',()=>{
  const r=extractProfileSlugs('{"slug":"mark-specterman"}');
  assert.deepEqual(r,['https://lips.org.uk/our-specialists/mark-specterman/']);
});

test('worker pool respects configured concurrency and preserves result order', async()=>{
  const { runWorkerPool } = require('../scraper/lipsScraper');
  let active = 0;
  let peak = 0;
  const items = [1,2,3,4,5,6];
  const results = await runWorkerPool(items, 2, async value => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 8));
    active--;
    return value * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results.map(x=>x.value), [10,20,30,40,50,60]);
  assert.equal(results.every(x=>x.ok), true);
});

test('worker pool isolates a failed item without aborting the remaining profiles', async()=>{
  const { runWorkerPool } = require('../scraper/lipsScraper');
  const results = await runWorkerPool(['a','bad','c'], 3, async value => {
    if(value === 'bad') throw new Error('transient');
    return value.toUpperCase();
  });
  assert.equal(results[0].value, 'A');
  assert.equal(results[1].ok, false);
  assert.match(results[1].error.message, /transient/);
  assert.equal(results[2].value, 'C');
});

test('live profile biography is enriched with ontology symptoms such as back pain and sciatica',()=>{
  const terms=extractOntologyTerms('Consultant spine surgeon treating lower back pain, slipped discs and sciatica.');
  assert.ok(terms.includes('Back pain'));
  assert.ok(terms.includes('Sciatica / radicular pain'));
  assert.ok(terms.includes('Slipped / herniated disc'));
});

test('structured profile stores ontology terms from biography as conditions',()=>{
  const text=`Mr Spine\nConsultant Neurosurgeon\nNeurosurgery\nSpinal Surgery\nBiography\nThis surgeon treats lower back pain, sciatica and herniated disc problems using specialist spinal techniques.\nLocations\nPrivate\nLIPS Healthcare, Battersea Power Station\nAvailability`;
  const p=extractStructured(text,'Mr Spine');
  assert.ok(p.conditions.includes('Back pain'));
  assert.ok(p.conditions.includes('Sciatica / radicular pain'));
  assert.ok(p.conditions.includes('Slipped / herniated disc'));
});

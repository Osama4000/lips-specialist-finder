const clinical = require('./clinicalKnowledge');
const { phraseContext: contextualPhraseContext } = require('./context');
const SPECIALTY_ALIASES = [
  ['Trauma & Orthopaedics', ['trauma and orthopaedics', 'trauma & orthopaedics', 'orthopaedics', 'orthopedics', 'orthopaedic surgery', 'orthopedic surgery']],
  ['Cardiology', ['cardiology', 'cardiovascular medicine']],
  ['Neurology', ['neurology']],
  ['Dermatology', ['dermatology']],
  ['Gastroenterology', ['gastroenterology', 'gastroenterology and hepatology', 'gastroenterology & hepatology', 'hepatology']],
  ['Gynaecology & Obstetrics', ['gynaecology & obstetrics', 'gynaecology and obstetrics', 'gynaecology', 'gynecology', 'obstetrics', "women's health", 'womens health']],
  ['Respiratory Medicine', ['respiratory medicine', 'respiratory', 'pulmonology']],
  ['Ophthalmology', ['ophthalmology', 'eye surgery']],
  ['Rheumatology', ['rheumatology']],
  ['Urology & Andrology', ['urology & andrology', 'urology and andrology', 'urology', 'andrology']],
  ['Plastic Surgery', ['plastic surgery', 'reconstructive surgery']],
  ['Maxillofacial', ['maxillofacial', 'maxillofacial surgery', 'oral and maxillofacial surgery']],
  ['Neurosurgery', ['neurosurgery', 'neurological surgery']],
  ['Diabetes', ['diabetes', 'diabetes medicine', 'diabetology']],
  ['Endocrinology', ['endocrinology', 'endocrine medicine']],
  ['ENT', ['ent', 'ear nose and throat', 'ear, nose & throat', 'otolaryngology']],
  ['Psychiatry', ['psychiatry', 'mental health']],
  ['Paediatrics', ['paediatrics', 'pediatrics', 'paediatric medicine']],
  ['Geriatrics', ['geriatrics', 'geriatric medicine', 'elderly medicine']],
  ['General Practice', ['general practice', 'general practitioner', 'gp', 'private gp']],
  ['Sports & Exercise Medicine', ['sports & exercise medicine', 'sports and exercise medicine', 'sports medicine']],
  ['General Surgery', ['general surgery']],
  ['Haematology', ['haematology', 'hematology']],
  ['Anaesthetics', ['anaesthetics', 'anesthetics', 'anaesthesia', 'anesthesia']],
  ['Aesthetics', ['aesthetics', 'aesthetic medicine', 'skin health']],
  ['Dentistry', ['dentistry', 'dental']],
  ['Sexual Health', ['sexual health', 'sexual medicine', 'genitourinary medicine']],
  ['Pain Management', ['pain management', 'pain medicine']],
  ['Vascular Surgery', ['vascular surgery', 'vascular']],
  ['Breast Surgery', ['breast surgery']],
  ['Colorectal Surgery', ['colorectal surgery', 'colorectal']],
  ['Radiology', ['radiology', 'interventional radiology']],
  ['Physiotherapy', ['physiotherapy', 'physical therapy']],
  ['Dietetics', ['dietetics', 'dietitian', 'nutrition']],
  ['Oral Surgery', ['oral surgery']],
  ['Orthodontics', ['orthodontics']],
  ['Endodontics', ['endodontics']],
  ['Periodontology', ['periodontology', 'periodontics']],
  ['Urgent Care', ['urgent care', 'emergency medicine']]
];

const ROUTES = [
  {
    specialty: 'Trauma & Orthopaedics',
    reason: 'The description is mainly about a bone, joint, tendon, ligament or musculoskeletal problem.',
    terms: {
      knee: 7, 'knee pain': 10, 'swollen knee': 10, acl: 10, meniscus: 10, patella: 8,
      hip: 7, 'hip pain': 10, fracture: 9, broken: 8, sprain: 7, ligament: 8, tendon: 7,
      'joint pain': 7, 'joint swelling': 7, 'difficulty walking': 5, 'sports injury': 8,
      ankle: 7, shoulder: 7, elbow: 7, wrist: 7, spine: 5, 'orthopaedic': 10,},
    subRules: {
      Knee: ['knee', 'acl', 'meniscus', 'patella', 'kneecap',],
      Hip: ['hip', 'groin pain',],
      'Sports Injury': ['sports injury', 'running injury', 'athlete', 'football injury', 'gym injury'],
      'Upper Limb': ['shoulder', 'elbow', 'wrist', 'hand', 'arm',],
      'Foot & Ankle': ['foot', 'ankle', 'heel', 'achilles',],
      'Spinal Disorders': ['spine', 'back pain', 'neck pain', 'scoliosis'],
      'Traumatic Injuries': ['fracture', 'broken', 'trauma', 'accident',]
    },
    subPriorities: { Knee: 4, Hip: 4, 'Upper Limb': 4, 'Foot & Ankle': 4, 'Spinal Disorders': 4, 'Traumatic Injuries': 2, 'Sports Injury': 0 }
  },
  {
    specialty: 'Cardiology',
    reason: 'The description contains heart or circulation-related symptoms.',
    terms: {
      palpitation: 9, palpitations: 10, 'heart racing': 9, arrhythmia: 10, arythmia: 9, afib: 10,
      'atrial fibrillation': 10, 'chest discomfort': 8, 'chest pain': 8, breathlessness: 6,
      'shortness of breath': 7, hypertension: 8, 'high blood pressure': 8, angina: 9,
      murmur: 7, 'heart failure': 10, fainting: 6, blackout: 6, 'loss of consciousness': 7,},
    subRules: {
      Arrythmia: ['arrhythmia', 'arythmia', 'palpitations', 'afib', 'atrial fibrillation', 'heart racing',],
      'Cardiac Electrophysiology': ['electrophysiology', 'ablation', 'pacemaker', 'icd', 'heart rhythm'],
      'Heart Failure': ['heart failure', 'cardiomyopathy', 'swollen ankles', 'orthopnoea'],
      'Preventive Cardiology': ['high cholesterol', 'cholesterol', 'hypertension', 'high blood pressure', 'cardiac risk'],
      'Cardiac MRI': ['cardiac mri', 'heart mri'],
      Echocardiography: ['echocardiogram', 'echocardiography', 'echo', 'heart valve', 'murmur']
    }
  },
  {
    specialty: 'Neurology',
    reason: 'The description is focused on the brain, nerves, seizures, headache or neurological symptoms.',
    terms: {
      migraine: 10, migraines: 10, headache: 8, headaches: 8, numbness: 8, tingling: 7,
      seizure: 10, seizures: 10, epilepsy: 10, tremor: 8, dizziness: 5, weakness: 6,
      paralysis: 9, 'memory loss': 9, dementia: 10, parkinson: 10, 'facial droop': 10,
      stroke: 10,},
    subRules: {
      Headache: ['headache', 'migraine',],
      Seizures: ['seizure', 'epilepsy', 'fit',],
      Dementia: ['dementia', 'memory loss', 'cognitive decline',],
      'Movement Disorders': ['parkinson', 'tremor', 'involuntary movement']
    }
  },
  {
    specialty: 'Dermatology',
    reason: 'The description concerns the skin, hair or nails.',
    terms: {
      rash: 10, itching: 8, eczema: 10, psoriasis: 10, acne: 10, rosacea: 9, mole: 8,
      moles: 8, 'changing mole': 10, 'suspicious mole': 10, 'skin lesion': 8, 'skin cancer': 10, melanoma: 10, melasma: 9,
      pigmentation: 8, vitiligo: 9, 'hair loss': 9, alopecia: 9, nail: 5, warts: 8,},
    subRules: {
      'Skin Cancer': ['skin cancer', 'melanoma', 'suspicious mole', 'changing mole', 'mole check', 'bcc', 'scc'],
      Psychodermatology: ['psychodermatology', 'skin picking', 'stress related skin'],
      'General Dermatology': ['rash', 'eczema', 'psoriasis', 'acne', 'rosacea', 'melasma', 'vitiligo', 'hair loss', 'alopecia']
    }
  },
  {
    specialty: 'Gastroenterology',
    reason: 'The description is mainly related to the digestive system, stomach, bowel or liver.',
    terms: {
      'abdominal pain': 9, stomach: 6, reflux: 9, 'acid reflux': 10, heartburn: 8, ibs: 10,
      'irritable bowel': 10, diarrhoea: 8, diarrhea: 8, constipation: 8, bloating: 7,
      liver: 8, jaundice: 9, swallowing: 6, dysphagia: 8, crohn: 10, colitis: 10,},
    subRules: {
      Hepatology: ['liver', 'jaundice', 'hepatitis', 'fatty liver', 'cirrhosis'],
      'Inflammatory Bowel Disease': ['crohn', 'colitis', 'ibd'],
      'Upper GI': ['reflux', 'heartburn', 'swallowing', 'dysphagia', 'stomach'],
      'Lower GI': ['bowel', 'ibs', 'diarrhoea', 'diarrhea', 'constipation']
    }
  },
  {
    specialty: 'Gynaecology & Obstetrics',
    reason: 'The description is related to gynaecological, reproductive, fertility, menopause or pregnancy care.',
    terms: {
      pregnancy: 10, pregnant: 10, menopause: 10, fertility: 10, infertility: 10, period: 6,
      periods: 6, menstrual: 8, 'pelvic pain': 9, endometriosis: 10, ovarian: 8, ovary: 8,
      fibroid: 9, cervical: 7, 'heavy periods': 9, 'irregular periods': 8,},
    subRules: {
      Obstetrics: ['pregnancy', 'pregnant', 'antenatal', 'postnatal',],
      Fertility: ['fertility', 'infertility', 'ivf', 'trying to conceive',],
      Menopause: ['menopause', 'hot flushes', 'perimenopause',],
      'General Gynaecology': ['period', 'menstrual', 'pelvic pain', 'fibroid', 'endometriosis', 'ovarian']
    }
  },
  {
    specialty: 'Respiratory Medicine',
    reason: 'The description is predominantly respiratory or breathing-related.',
    terms: {
      cough: 7, wheeze: 9, wheezing: 9, asthma: 10, bronchitis: 9, copd: 10,
      'difficulty breathing': 9, breathlessness: 8, 'shortness of breath': 8,
      snoring: 5, 'sleep apnoea': 10, 'sleep apnea': 10,},
    subRules: {
      'Sleep Apnoea': ['sleep apnoea', 'sleep apnea', 'snoring', 'stops breathing at night'],
      'Respiratory Medicine': ['asthma', 'copd', 'cough', 'wheeze', 'breathlessness']
    }
  },
  {
    specialty: 'Ophthalmology',
    reason: 'The description concerns the eyes or vision.',
    terms: {
      eye: 5, eyes: 5, vision: 8, blurry: 7, blurred: 7, cataract: 10, glaucoma: 10,
      retina: 10, floaters: 9, 'eye pain': 9, 'vision loss': 10, 'double vision': 9,},
    subRules: {
      Cataract: ['cataract',],
      Retina: ['retina', 'floaters', 'macular', 'diabetic retinopathy'],
      'General Ophthalmology': ['eye pain', 'vision', 'glaucoma', 'double vision']
    }
  },
  {
    specialty: 'Rheumatology',
    reason: 'The description suggests an inflammatory joint, muscle or connective-tissue problem.',
    terms: {
      rheumatoid: 10, 'rheumatoid arthritis': 10, lupus: 10, autoimmune: 8, 'joint stiffness': 8,
      'morning stiffness': 9, gout: 9, vasculitis: 9, connective: 7,},
    subRules: {
      'Inflammatory Rheumatology': ['rheumatoid', 'lupus', 'vasculitis', 'gout', 'autoimmune', 'morning stiffness'],
      'Musculoskeletal Rheumatology': ['joint pain', 'joint stiffness', 'muscle pain']
    }
  },
  {
    specialty: 'Urology & Andrology',
    reason: 'The description is related to the urinary tract, kidneys, bladder, prostate or male urological health.',
    terms: {
      urine: 7, urinary: 8, urination: 8, 'burning urine': 9, 'painful urination': 9,
      bladder: 8, kidney: 7, 'kidney stone': 10, 'kidney stones': 10, prostate: 9,
      erectile: 8, 'blood in urine': 10, haematuria: 10, hematuria: 10,},
    subRules: {
      'Kidney Stones': ['kidney stone', 'renal stone', 'flank pain',],
      "Men's Health": ['erectile', 'male fertility', 'andrology', 'testicular', 'penis'],
      'General Urology': ['urinary', 'bladder', 'prostate', 'blood in urine', 'haematuria', 'hematuria']
    }
  },
  {
    specialty: 'ENT',
    reason: 'The description concerns the ear, nose, throat, hearing, balance, voice or sinuses.',
    terms: {
      ear: 6, tinnitus: 10, hearing: 9, vertigo: 8, sinus: 9, sinusitis: 10, nasal: 7,
      'blocked nose': 9, 'sore throat': 8, throat: 7, tonsils: 9, tonsillitis: 10,
      hoarse: 8, hoarseness: 8, snoring: 5,},
    subRules: {
      'Ear & Balance': ['ear', 'hearing', 'tinnitus', 'vertigo', 'balance',],
      'Nose & Sinus': ['nose', 'nasal', 'sinus', 'sinusitis', 'septum',],
      Throat: ['throat', 'tonsil', 'voice', 'hoarse', 'swallowing',],
      'Paediatric ENT': ['child', 'children', 'paediatric', 'pediatric', 'tonsils', 'adenoids']
    }
  },
  {
    specialty: 'Neurosurgery',
    reason: 'The description suggests a complex spinal or neurosurgical problem.',
    terms: {
      sciatica: 10, 'disc problem': 9, 'slipped disc': 10, 'spinal stenosis': 10,
      'spinal tumour': 10, 'spinal tumor': 10, 'brain tumour': 10, 'brain tumor': 10,
      neurosurgery: 10, 'cauda equina': 12,},
    subRules: {
      'Spinal Surgery': ['sciatica', 'slipped disc', 'spinal stenosis', 'cauda equina',],
      'Back Surgery': ['back surgery', 'lumbar surgery'],
      'Neurovascular Surgery': ['aneurysm', 'avm', 'neurovascular'],
      'Neuro-Oncology': ['brain tumour', 'brain tumor', 'spinal tumour', 'spinal tumor']
    }
  },
  {
    specialty: 'Diabetes',
    reason: 'The description is specifically about diabetes, glucose control or diabetes treatment.',
    terms: {
      diabetes: 11, diabetic: 10, 'type 1 diabetes': 12, 'type 2 diabetes': 12,
      'blood sugar': 10, glucose: 8, insulin: 9, 'insulin pump': 11, 'diabetic foot': 11,
      hypoglycaemia: 10, hypoglycemia: 10, hyperglycaemia: 10, hyperglycemia: 10,
      'continuous glucose monitor': 9, cgm: 8
    },
    subRules: {}
  },
  {
    specialty: 'Endocrinology',
    reason: 'The description is mainly endocrine, hormonal, thyroid, adrenal, pituitary or parathyroid-related.',
    terms: {
      thyroid: 11, hypothyroidism: 11, hyperthyroidism: 11, adrenal: 9, pituitary: 9,
      parathyroid: 9, endocrine: 10, endocrinology: 10, 'hormone disorder': 8,
      'hormonal disorder': 8, 'thyroid nodule': 11, goitre: 9, goiter: 9
    },
    subRules: {
      Thyroid: ['thyroid', 'hypothyroidism', 'hyperthyroidism', 'thyroid nodule', 'goitre', 'goiter'],
      Endocrinology: ['adrenal', 'pituitary', 'parathyroid', 'endocrine', 'hormone disorder', 'hormonal disorder']
    }
  },
  {
    specialty: 'Psychiatry',
    reason: 'The description is mainly related to mental health, mood, anxiety or behavioural concerns.',
    terms: {
      anxiety: 10, panic: 9, depression: 10, depressive: 9, 'low mood': 8, bipolar: 10,
      psychosis: 10, hallucination: 10, ocd: 10, adhd: 10, insomnia: 6,},
    subRules: {
      Anxiety: ['anxiety', 'panic',],
      'Mood Disorders': ['depression', 'low mood', 'bipolar',],
      'General Psychiatry': ['psychosis', 'hallucination', 'ocd', 'adhd', 'insomnia']
    }
  },
  {
    specialty: 'Paediatrics',
    reason: 'The description concerns a child and is appropriate for paediatric assessment.',
    terms: {
      child: 5, children: 5, baby: 6, infant: 7, toddler: 7, paediatric: 10, pediatric: 10,
      newborn: 8,},
    subRules: {
      'General Paediatrics': ['child', 'baby', 'infant', 'toddler', 'newborn',],
      'Paediatric Allergy': ['child allergy', 'food allergy', 'allergic child'],
      'Paediatric ENT': ['child ear', 'child tonsil', 'adenoid']
    }
  },
  {
    specialty: 'Geriatrics',
    reason: 'The description is focused on frailty, falls, multimorbidity or other health problems in an older adult.',
    terms: {
      geriatric: 11, geriatrics: 11, frailty: 11, frail: 9, 'recurrent falls': 11,
      'frequent falls': 10, 'elderly medicine': 11, 'older adult': 8, 'older person': 8,
      polypharmacy: 10, delirium: 9, multimorbidity: 10, 'complex medicine': 8,
      'mobility decline': 9, 'functional decline': 9
    },
    subRules: {
      'Elderly Medicine': ['geriatric', 'geriatrics', 'elderly medicine', 'older adult', 'frailty'],
      'Complex Medicine': ['multimorbidity', 'polypharmacy', 'complex medicine', 'recurrent falls', 'functional decline']
    }
  },
  {
    specialty: 'General Practice',
    reason: 'The symptoms are broad or non-specific and may be appropriate for a GP assessment before specialist routing.',
    terms: {
      'general health': 7, tiredness: 5, fatigue: 6, fever: 5, cold: 4, flu: 5,
      'general check': 8, checkup: 8, 'check-up': 8, 'not sure': 6,},
    subRules: { 'General Practice': ['general', 'checkup', 'check-up', 'fever', 'fatigue',] }
  },
  {
    specialty: 'Sports & Exercise Medicine',
    reason: 'The description is focused on exercise, sports-related injury, performance or non-surgical musculoskeletal care.',
    terms: {
      'sports injury': 10, running: 6, runner: 6, 'running injury': 9, athletic: 7,
      exercise: 6, overuse: 8, rehabilitation: 6, 'return to sport': 9,},
    subRules: {
      'Sports Injury': ['sports injury', 'running injury', 'return to sport',],
      'Musculoskeletal Medicine': ['musculoskeletal', 'overuse', 'tendon', 'exercise pain']
    }
  },
  {
    specialty: 'General Surgery',
    reason: 'The description may require a general surgical assessment.',
    terms: {
      hernia: 10, gallbladder: 9, appendicitis: 10, appendix: 9, 'abdominal mass': 9,
      'groin lump': 9,},
    subRules: {
      Hernia: ['hernia', 'groin lump',],
      'Upper GI': ['gallbladder', 'upper gi', 'stomach surgery'],
      'General Surgery': ['appendicitis', 'abdominal mass']
    }
  },
  {
    specialty: 'Haematology',
    reason: 'The description suggests a blood or haematological problem.',
    terms: {
      anaemia: 10, anemia: 10, 'bleeding disorder': 10, clotting: 9, thrombosis: 9,
      platelet: 9, lymphoma: 10, myeloma: 10, leukaemia: 10, leukemia: 10,},
    subRules: { 'General Haematology': ['anaemia', 'anemia', 'clotting', 'platelet', 'lymphoma', 'myeloma', 'leukaemia', 'leukemia'] }
  },
  {
    specialty: 'Plastic Surgery',
    reason: 'The description relates to reconstructive or cosmetic plastic surgery.',
    terms: {
      reconstructive: 9, scar: 8, scars: 8, cosmetic: 8, facelift: 10, rhinoplasty: 10,
      'breast augmentation': 9, 'breast reduction': 9, 'breast uplift': 9, burn: 8, liposuction: 9, abdominoplasty: 9, 'tummy tuck': 9,},
    subRules: {
      'Reconstructive Surgery': ['reconstructive', 'burn', 'scar', 'nerve reconstruction'],
      'Plastic Surgery': ['facelift', 'rhinoplasty', 'liposuction', 'abdominoplasty', 'tummy tuck']
    }
  },
  {
    specialty: 'Maxillofacial',
    reason: 'The description concerns the jaw, face, mouth or facial structures.',
    terms: {
      jaw: 9, jawline: 6, 'jaw fracture': 10, facial: 6, face: 4, maxillofacial: 10,
      'facial trauma': 9, 'wisdom tooth': 12, 'wisdom teeth': 12, 'wisdom tooth pain': 12, 'impacted wisdom tooth': 12, 'impacted tooth': 10,
      'oral surgery': 10, tmj: 9, 'temporomandibular joint': 10, 'facial pain': 8,},
    subRules: {
      'Maxillofacial Surgery': ['jaw', 'facial trauma', 'jaw fracture', 'maxillofacial', 'tmj', 'temporomandibular joint', 'facial pain'],
      'Oral Surgery': ['oral surgery', 'wisdom tooth', 'wisdom teeth', 'wisdom tooth pain', 'impacted wisdom tooth', 'impacted tooth']
    }
  },
  {
    specialty: 'Sexual Health',
    reason: 'The description is mainly about sexual health, STI screening or sexual function.',
    terms: {
      sti: 10, std: 10, 'sexual health': 10, herpes: 10, chlamydia: 10, gonorrhoea: 10,
      gonorrhea: 10, 'erectile dysfunction': 9, 'low libido': 8, vaginismus: 9,
      'pain during sex': 9, prep: 8,},
    subRules: {
      'Sexual Health': ['sti', 'std', 'herpes', 'chlamydia', 'gonorrhoea', 'gonorrhea', 'prep'],
      'Sexual Function': ['erectile dysfunction', 'low libido', 'vaginismus', 'pain during sex']
    }
  },
  {
    specialty: 'Pain Management',
    reason: 'The description suggests persistent or complex pain that may benefit from specialist pain assessment.',
    terms: {
      'chronic pain': 10, 'nerve pain': 9, neuropathic: 9, 'persistent pain': 8,
      'pain clinic': 10, fibromyalgia: 8,},
    subRules: { 'Pain Management': ['chronic pain', 'nerve pain', 'neuropathic', 'pain clinic', 'fibromyalgia'] }
  },
  {
    specialty: 'Vascular Surgery',
    reason: 'The description is related to arteries, veins or peripheral circulation.',
    terms: {
      'varicose veins': 10, varicose: 9, 'leg ulcer': 9, 'peripheral arterial': 10,
      aneurysm: 9, 'poor circulation': 8,},
    subRules: { 'Vascular Surgery': ['varicose', 'leg ulcer', 'peripheral arterial', 'aneurysm', 'poor circulation',] }
  },
  {
    specialty: 'Breast Surgery',
    reason: 'The description concerns a breast lump, breast symptoms or breast surgical assessment.',
    terms: {
      'breast lump': 10, 'breast pain': 8, nipple: 7, 'nipple discharge': 9, 'breast cancer': 10,},
    subRules: { 'Breast Surgery': ['breast lump', 'breast pain', 'nipple discharge', 'breast cancer'] }
  },
  {
    specialty: 'Colorectal Surgery',
    reason: 'The description concerns the colon, rectum, anus or colorectal surgical symptoms.',
    terms: {
      haemorrhoids: 10, hemorrhoids: 10, piles: 9, 'rectal bleeding': 10, fissure: 9,
      fistula: 9, 'bowel cancer': 10,},
    subRules: { 'Colorectal Surgery': ['haemorrhoids', 'hemorrhoids', 'piles', 'rectal bleeding', 'fissure', 'fistula', 'bowel cancer'] }
  },
  {
    specialty: 'Dentistry',
    reason: 'The description is primarily dental or tooth-related.',
    terms: {
      tooth: 8, teeth: 8, dental: 9, toothache: 10, 'tooth pain': 10, implant: 8,
      gum: 7, 'broken tooth': 9,},
    subRules: {
      Orthodontics: ['braces', 'orthodontic', 'crooked teeth'],
      Endodontics: ['root canal', 'endodontic', 'tooth nerve'],
      Periodontology: ['gum disease', 'periodontal', 'bleeding gums'],
      'Dental Implants': ['dental implant', 'implant']
    }
  },
  {
    specialty: 'Physiotherapy',
    reason: 'The description is appropriate for rehabilitation, mobility or physiotherapy support.',
    terms: {
      physiotherapy: 10, rehabilitation: 8, rehab: 8, 'post operative rehab': 9,
      mobility: 6, 'sports rehab': 9,},
    subRules: { Physiotherapy: ['physiotherapy', 'rehabilitation', 'rehab', 'mobility',] }
  },
  {
    specialty: 'Dietetics',
    reason: 'The description is mainly about nutrition, diet, weight management or dietetic support.',
    terms: {
      diet: 7, nutrition: 9, dietitian: 10, 'weight management': 9, 'nutritional deficiency': 9,
      'food intolerance': 8,},
    subRules: { Dietetics: ['diet', 'nutrition', 'weight management', 'food intolerance',] }
  },
  {
    specialty: 'Aesthetics',
    reason: 'The request is specifically about non-surgical aesthetic or skin-rejuvenation treatment.',
    terms: {
      botox: 10, 'anti wrinkle': 10, 'anti-wrinkle': 10, fillers: 10, filler: 9,
      profhilo: 10, microneedling: 9, 'skin booster': 9, 'skin boosters': 9,
      'skin rejuvenation': 9, 'facial rejuvenation': 9, 'cosmetic injectables': 10
    },
    subRules: {
      Aesthetics: ['botox', 'anti wrinkle', 'anti-wrinkle', 'fillers', 'filler', 'profhilo', 'microneedling', 'skin booster', 'skin boosters', 'skin rejuvenation', 'facial rejuvenation', 'cosmetic injectables']
    }
  },
  {
    specialty: 'Anaesthetics',
    reason: 'The request appears related to anaesthetic assessment or peri-operative care.',
    terms: {
      anaesthetic: 10, anesthesia: 10, anaesthesia: 10, preoperative: 8, 'pre-operative': 8,
      perioperative: 8,},
    subRules: { Anaesthetics: ['anaesthetic', 'anesthesia', 'anaesthesia', 'preoperative', 'perioperative',] }
  }
];

const URGENT = [
  ['severe chest pain', 14],
  ['chest pain and difficulty breathing', 16],
  ['severe difficulty breathing', 14],
  ['cannot breathe', 16],
  ['unconscious', 16],
  ['unresponsive', 16],
  ['sudden weakness', 12],
  ['sudden facial droop', 14],
  ['stroke symptoms', 14],
  ['severe bleeding', 14],
  ['heavy bleeding', 12],
  ['anaphylaxis', 16],
  ['severe allergic reaction', 16],
  ['overdose', 16],
  ['ongoing seizure', 16],
  ['seizure lasting', 16],
  ['suicidal thoughts', 14],
  ['suicide', 14],
  ['cauda equina', 14],
  ['loss of bladder control and numbness', 14]
];

const STOPWORDS = new Set([
  'patient','patients','reports','report','reporting','says','said','having','with','from','that','this','been','have','has','had',
  'about','symptom','symptoms','persistent','severe','mild','moderate','very','really','there','their','pain','ache','problem',
  'problems','issue','issues','and','the','for','are','was','were','but','into','over','under','today','yesterday','currently',
  'current','recent','recently','history','known','any','some','much','many','also','still','now','then','please','wants','needs',
  'denies','denied','deny','without','negative','absence','free','does','doesnt','did','didnt','not','no','never'
]);

const NEGATION_SINGLE_CUES = new Set(['no', 'denies', 'deny', 'denied', 'denying', 'without', 'never']);
const NEGATION_EXCEPTION_HEADS = new Set(['improvement', 'relief', 'response', 'change', 'benefit', 'effect']);
const HARD_BREAKS = new Set(['.', ';', '!', '?']);
const CONTRAST_BREAKS = new Set(['but', 'however', 'although', 'though', 'yet', 'except']);
const POSITIVE_RESETS_AFTER_COMMA = new Set([
  'reports','reporting','has','have','having','with','experiencing','experience','presents','presenting','complains','complaining',
  'positive','developed','develops','now'
]);

const SUB_SPECIALTY_ALIASES = [
  ['Arrhythmia', ['arrhythmia', 'arrythmia', 'arythmia', 'arrythmia', 'arrythmias', 'arrhythmias']],
  ['Electrophysiology', ['electrophysiology', 'cardiac electrophysiology']],
  ['General Cardiology', ['general cardiology', 'clinical cardiology']],
  ['Heart Failure', ['heart failure', 'heart muscle disease']],
  ['Knee', ['knee', 'knee surgery']],
  ['Hip', ['hip', 'hip surgery']],
  ['Foot & Ankle', ['foot and ankle', 'foot & ankle', 'foot', 'ankle']],
  ['Upper Limb', ['upper limb', 'shoulder', 'elbow', 'wrist', 'hand']],
  ['Nose & Sinus', ['nose and sinus', 'nose & sinus', 'sinus']],
  ['Ear & Balance', ['ear and balance', 'ear & balance', 'otology', 'neurotology']],
  ['Throat', ['throat', 'laryngology']],
  ['Hepatology', ['hepatology', 'liver']],
  ['Headache', ['headache', 'migraine']],
  ['Retina', ['retina', 'retinal']],
  ['Skin Cancer', ['skin cancer', 'melanoma']],
  ['Kidney Stones', ['kidney stones', 'kidney stone', 'stone disease']],
  ['General Gynaecology', ['general gynaecology', 'general gynecology']]
];

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
  if (["doesn't", "dont", "don't", "didn't", 'didnt'].includes(a) && ['have', 'report', 'experience', 'describe'].includes(b)) return 2;
  if (['is', 'are', 'was', 'were'].includes(a) && b === 'not' && ['experiencing', 'reporting', 'having'].includes(c)) return 3;
  if (a === 'not' && ['experiencing', 'reporting', 'having'].includes(b)) return 2;
  if (['has', 'have', 'had'].includes(a) && b === 'no') return 2;
  if (a === 'no' && NEGATION_EXCEPTION_HEADS.has(b)) return 0;
  if (a === 'not' && ['only', 'sure', 'certain'].includes(b)) return 0;
  if (NEGATION_SINGLE_CUES.has(a)) return 1;
  // e.g. "does not currently have"
  if (['does', 'do', 'did'].includes(a) && b === 'not' && ['currently', 'now'].includes(c) && d === 'have') return 4;
  return 0;
}

const WITH_NEGATION_CONTEXT = new Set([
  'activity', 'breathing', 'coughing', 'deep', 'eating', 'exercise', 'exertion', 'food',
  'meals', 'movement', 'motion', 'standing', 'swallowing', 'touch', 'urination', 'walking'
]);

function assertionTokens(text) {
  const raw = tokenizeRaw(text);
  const result = [];
  let negationRemaining = 0;
  let commaSinceCue = false;
  let negatedContentCount = 0;

  const clearNegation = () => {
    negationRemaining = 0;
    commaSinceCue = false;
    negatedContentCount = 0;
  };

  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];

    if (HARD_BREAKS.has(token) || CONTRAST_BREAKS.has(token)) {
      clearNegation();
      continue;
    }
    if (token === ',') {
      commaSinceCue = true;
      continue;
    }

    if (negationRemaining > 0 && commaSinceCue && POSITIVE_RESETS_AFTER_COMMA.has(token)) {
      clearNegation();
    }
    if (negationRemaining > 0 && token === 'and' && POSITIVE_RESETS_AFTER_COMMA.has(raw[i + 1] || '')) {
      clearNegation();
    }

    // In terse call-centre notes, "no chest pain with palpitations" normally means
    // chest pain is denied while palpitations are present. Do not blindly reset on
    // every "with": phrases such as "no pain with urination" describe the context
    // of the denied symptom and must remain negated.
    if (
      negationRemaining > 0 &&
      token === 'with' &&
      negatedContentCount >= 2 &&
      !WITH_NEGATION_CONTEXT.has(raw[i + 1] || '')
    ) {
      clearNegation();
    }

    const cueLen = cueLengthAt(raw, i);
    if (cueLen > 0) {
      // Cues themselves are never useful search tokens. Start scope after the complete cue.
      for (let j = 0; j < cueLen; j++) {
        const cueToken = raw[i + j];
        if (cueToken && !HARD_BREAKS.has(cueToken) && cueToken !== ',') {
          result.push({ token: cueToken, negated: false, cue: true });
        }
      }
      i += cueLen - 1;
      negationRemaining = 24;
      commaSinceCue = false;
      negatedContentCount = 0;
      continue;
    }

    const isNegated = negationRemaining > 0;
    result.push({ token, negated: isNegated, cue: false });
    if (negationRemaining > 0) {
      negationRemaining -= 1;
      if (!['and', 'or', 'with'].includes(token)) negatedContentCount += 1;
    }
  }
  return result;
}

function phraseTokens(term) {
  return tokenizeRaw(term).filter(t => !HARD_BREAKS.has(t) && t !== ',');
}

function phraseAssertion(text, term) {
  const words = assertionTokens(text).filter(x => !x.cue);
  const phrase = phraseTokens(term);
  if (!phrase.length || words.length < phrase.length) return { affirmed: false, negated: false };

  let affirmed = false;
  let negated = false;
  for (let i = 0; i <= words.length - phrase.length; i++) {
    let same = true;
    for (let j = 0; j < phrase.length; j++) {
      if (words[i + j].token !== phrase[j]) { same = false; break; }
    }
    if (!same) continue;
    const states = words.slice(i, i + phrase.length);
    if (states.some(x => x.negated)) negated = true;
    else affirmed = true;
  }
  return { affirmed, negated };
}

function phraseIn(text, term) {
  return phraseAssertion(text, term).affirmed;
}

function findAssertionMatches(text, terms) {
  const affirmed = [];
  const negated = [];
  const ignored = [];
  const seen = new Set();
  for (const [term, weight] of Object.entries(terms || {})) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm || seen.has(normalizedTerm)) continue;
    seen.add(normalizedTerm);
    const context = contextualPhraseContext(text, term);
    if (context.state === 'present') affirmed.push({ term, weight, state: 'present' });
    else if (context.state === 'uncertain') affirmed.push({ term, weight: Number(weight || 0) * 0.42, state: 'uncertain' });
    else if (context.state === 'negated') negated.push({ term, weight, state: 'negated' });
    else if (context.found) ignored.push({ term, weight, state: context.state });
  }
  return { affirmed, negated, ignored };
}

function findMatches(text, terms) {
  return findAssertionMatches(text, terms).affirmed;
}

function canonicalSpecialty(value) {
  const n = normalizeText(value);
  if (!n) return '';
  for (const [canonical, aliases] of SPECIALTY_ALIASES) {
    for (const alias of [canonical, ...aliases]) {
      if (n === normalizeText(alias)) return canonical;
    }
  }
  return String(value || '').trim();
}

function specialtyEquivalent(a, b) {
  return normalizeText(canonicalSpecialty(a)) === normalizeText(canonicalSpecialty(b));
}

function canonicalSubSpecialty(value) {
  const n = normalizeText(value);
  if (!n) return '';
  for (const [canonical, aliases] of SUB_SPECIALTY_ALIASES) {
    if ([canonical, ...aliases].some(alias => normalizeText(alias) === n)) return canonical;
  }
  return String(value || '').trim();
}

function subSpecialtyEquivalent(a, b) {
  return normalizeText(canonicalSubSpecialty(a)) === normalizeText(canonicalSubSpecialty(b));
}

function detectUrgency(text, conceptMatches = null) {
  const concepts = conceptMatches || clinical.extractClinicalConcepts(text);
  const detected = clinical.detectRedFlags(text, concepts);
  return {
    urgent: detected.urgent,
    matches: detected.matches.map(x => x.label),
    rules: detected.matches,
    ignoredNegated: detected.ignoredNegated,
    score: detected.urgent ? 16 : 0
  };
}

function queryTokens(text) {
  return clinical.activeQueryTokens(text);
}

function doctorSearchText(doctor, includeBiography = false) {
  return normalizeText([
    doctor.specialty,
    ...(doctor.specialties || []),
    ...(doctor.subSpecialties || []),
    ...(doctor.expertise || []),
    ...(doctor.conditions || []),
    doctor.role || '',
    includeBiography ? doctor.biography || '' : ''
  ].filter(Boolean).join(' '));
}

function dataDrivenSpecialtyScores(text, specialists) {
  const tokens = [...new Set(queryTokens(text))].filter(x => x.length >= 4).slice(0, 24);
  if (!tokens.length || !Array.isArray(specialists) || !specialists.length) return new Map();

  const scores = new Map();
  for (const doctor of specialists) {
    const doctorSpecialties = [...new Set([
      doctor.specialty,
      ...(Array.isArray(doctor.specialties) ? doctor.specialties : [])
    ].map(canonicalSpecialty).filter(Boolean))];
    if (!doctorSpecialties.length) continue;
    const searchable = doctorSearchText(doctor, false);
    let doctorScore = 0;
    for (const token of tokens) {
      if (phraseIn(searchable, token)) doctorScore += token.length >= 7 ? 1.6 : 1.0;
    }
    if (doctorScore > 0) {
      for (const specialty of doctorSpecialties) {
        scores.set(specialty, (scores.get(specialty) || 0) + Math.min(doctorScore, 4));
      }
    }
  }

  // Prevent specialties with more indexed doctors from winning because of directory size alone.
  for (const [specialty, score] of scores) scores.set(specialty, Math.min(score, 6));
  return scores;
}

function confidenceFromScores(scores) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0]?.score || 0;
  const second = sorted[1]?.score || 0;
  const gap = top - second;
  if (top >= 13 && gap >= 4) return 'High';
  if (top >= 7 && gap >= 2) return 'Medium';
  return 'Low';
}

function availableSubSpecialties(specialists, specialty) {
  const out = new Set();
  for (const d of specialists || []) {
    const doctorSpecialties = [d.specialty, ...(Array.isArray(d.specialties) ? d.specialties : [])];
    if (!doctorSpecialties.some(x => specialtyEquivalent(x, specialty))) continue;
    for (const sub of d.subSpecialties || []) if (sub) out.add(sub);
  }
  return [...out];
}

function bestSubSpecialty(text, route, specialists, knowledgeSubScores = new Map()) {
  const available = availableSubSpecialties(specialists, route.specialty);
  const candidates = new Map();

  for (const [name, terms] of Object.entries(route.subRules || {})) {
    let score = 0;
    for (const term of terms) if (phraseIn(text, term)) score += normalizeText(term).includes(' ') ? 3 : 2;
    if (score) candidates.set(name, score);
  }

  // Live LIPS labels participate directly, so newly-added sub-specialities can rank without a code release.
  const tokens = queryTokens(text);
  for (const sub of available) {
    const n = normalizeText(sub);
    let score = 0;
    if (phraseIn(text, sub)) score += 7;
    for (const token of tokens) if (phraseIn(n, token)) score += 2;
    if (score) candidates.set(sub, Math.max(candidates.get(sub) || 0, score));
  }

  for (const [name, score] of knowledgeSubScores || []) {
    if (Number(score || 0) <= 0) continue;
    const existing = candidates.get(name) || 0;
    candidates.set(name, Math.max(existing, Number(score)));
  }
  for (const [name, score] of [...candidates.entries()]) {
    candidates.set(name, score + Number(route.subPriorities?.[name] || 0));
  }

  const sorted = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] < 2) return null;
  const chosen = sorted[0][0];
  if (!available.length) return canonicalSubSpecialty(chosen);

  const exact = available.find(x => subSpecialtyEquivalent(x, chosen));
  if (exact) return exact;

  const chosenTokens = new Set(normalizeText(chosen).split(/\s+/).filter(t => t.length > 2 && !['and','general','surgery','medicine'].includes(t)));
  let best = null;
  let bestScore = 0;
  for (const sub of available) {
    const subTokens = normalizeText(sub).split(/\s+/).filter(Boolean);
    const overlap = subTokens.filter(t => chosenTokens.has(t)).length;
    if (overlap > bestScore) { best = sub; bestScore = overlap; }
  }
  return bestScore > 0 ? best : canonicalSubSpecialty(chosen);
}

function routeSymptoms(symptomText, specialists = []) {
  const rawText = String(symptomText || '').trim();
  if (!rawText) return { empty: true };
  const preparedInput = clinical.prepareClinicalInput(rawText);
  const text = preparedInput.text;
  const inputUnderstanding = {
    corrections: preparedInput.corrections || [],
    normalisations: preparedInput.normalisations || []
  };

  const availableCanonicals = new Set((specialists || []).flatMap(s => [
    s.specialty,
    ...(Array.isArray(s.specialties) ? s.specialties : [])
  ]).map(canonicalSpecialty).filter(Boolean));

  const clinicalConcepts = preparedInput.conceptMatches || clinical.extractClinicalConcepts(text);
  const conceptScoring = clinical.scoreConcepts(clinicalConcepts);
  const activeConceptIds = new Set(clinicalConcepts.filter(x => x.state === 'present').map(x => x.id));
  // Interaction rule: back/neck pain plus radicular sensory symptoms should stay on a spine pathway
  // rather than letting a generic tingling/numbness token pull the case to General Neurology.
  if (activeConceptIds.has('sciatica') || (activeConceptIds.has('back_pain') && activeConceptIds.has('numbness_tingling'))) {
    conceptScoring.specialtyScores.set('Neurosurgery', (conceptScoring.specialtyScores.get('Neurosurgery') || 0) + 12);
    conceptScoring.specialtyScores.set('Trauma & Orthopaedics', (conceptScoring.specialtyScores.get('Trauma & Orthopaedics') || 0) + 9);
    conceptScoring.specialtyScores.set('Neurology', Math.max(0, (conceptScoring.specialtyScores.get('Neurology') || 0) - 6));
    conceptScoring.subSpecialtyScores.set('Spinal Surgery', (conceptScoring.subSpecialtyScores.get('Spinal Surgery') || 0) + 10);
    conceptScoring.subSpecialtyScores.set('Spinal Disorders', (conceptScoring.subSpecialtyScores.get('Spinal Disorders') || 0) + 8);
  }
  const directoryKnowledge = clinical.directoryEvidenceScores(text, specialists);
  const dataScores = dataDrivenSpecialtyScores(text, specialists);
  const allNegatedTerms = new Set();
  const ignoredContextTerms = [];

  const scores = ROUTES.map(route => {
    const assertions = findAssertionMatches(text, route.terms);
    assertions.negated.forEach(x => allNegatedTerms.add(x.term));
    for (const x of assertions.ignored || []) ignoredContextTerms.push({ term: x.term, state: x.state });
    let score = assertions.affirmed.reduce((n, m) => n + Number(m.weight || 0), 0);
    score += conceptScoring.specialtyScores.get(route.specialty) || 0;
    score += directoryKnowledge.specialtyScores.get(route.specialty) || 0;
    score += dataScores.get(route.specialty) || 0;
    if (score > 0 && (availableCanonicals.size === 0 || availableCanonicals.has(route.specialty))) score += 1;
    return { route, score, matches: assertions.affirmed, negated: assertions.negated };
  });

  const liveSpecialties = new Set([
    ...conceptScoring.specialtyScores.keys(),
    ...directoryKnowledge.specialtyScores.keys(),
    ...dataScores.keys()
  ]);
  for (const specialtyRaw of liveSpecialties) {
    const specialty = canonicalSpecialty(specialtyRaw);
    if (!specialty || ROUTES.some(r => r.specialty === specialty)) continue;
    const score = (conceptScoring.specialtyScores.get(specialtyRaw) || 0) +
      (directoryKnowledge.specialtyScores.get(specialtyRaw) || 0) +
      (dataScores.get(specialtyRaw) || 0);
    if (score <= 0) continue;
    scores.push({
      route: { specialty, reason: 'The wording matches current LIPS directory expertise plus the routing knowledge base.', subRules: {} },
      score, matches: [], negated: []
    });
  }

  scores.sort((a, b) => b.score - a.score);
  const urgency = detectUrgency(text, clinicalConcepts);
  urgency.ignoredNegated.forEach(x => allNegatedTerms.add(x));
  const top = scores[0];
  const second = scores[1];
  const contextSummary = clinical.contextSummary(clinicalConcepts);
  const patientContext = clinical.inferPatientContext(text);

  const candidatePayload = scores.filter(x => x.score > 0).slice(0, 5).map(x => ({
    specialty: x.route.specialty,
    score: Math.round(x.score * 10) / 10
  }));

  if (!top || top.score < 5) {
    const recognisedButInactive = clinicalConcepts.some(x => ['negated','historical','resolved','family'].includes(x.state));
    const clarification = clinical.chooseClarification(clinicalConcepts, candidatePayload);
    return {
      uncertain: true,
      specialty: null,
      subSpecialty: null,
      confidence: 'Low',
      alternatives: [],
      candidates: candidatePayload,
      reason: recognisedButInactive
        ? 'Recognised symptoms were historical, resolved, family-history or explicitly denied, so they were not treated as the patient’s current complaint.'
        : 'The description is too broad to route safely to one specialist. Add the main current symptom, body area and relevant associated symptoms.',
      matchedTerms: [],
      negatedTerms: [...allNegatedTerms].slice(0, 12),
      ignoredContextTerms: ignoredContextTerms.slice(0, 12),
      clinicalConcepts,
      contextSummary,
      directoryEvidence: directoryKnowledge.evidence,
      inputUnderstanding,
      clarification,
      patientContext,
      urgency
    };
  }

  const confidence = confidenceFromScores(scores);
  const gap = second ? top.score - second.score : top.score;
  const hasOnlyUncertainClinicalConcepts = clinicalConcepts.some(x => x.state === 'uncertain') && !clinicalConcepts.some(x => x.state === 'present');
  const uncertain = confidence === 'Low' || Boolean(second && gap < 3) || hasOnlyUncertainClinicalConcepts;

  const mergedSubScores = new Map(conceptScoring.subSpecialtyScores);
  for (const [sub, score] of directoryKnowledge.subSpecialtyScores) {
    mergedSubScores.set(sub, Math.max(mergedSubScores.get(sub) || 0, score));
  }
  const subSpecialty = bestSubSpecialty(text, top.route, specialists, mergedSubScores);
  const alternatives = scores.slice(1, 4).filter(x => x.score >= 5 && top.score - x.score <= 7).map(x => x.route.specialty);
  const clarification = clinical.chooseClarification(clinicalConcepts, candidatePayload, { subSpecialtyMissing: !subSpecialty });

  const conceptTerms = clinicalConcepts
    .filter(x => x.state === 'present')
    .map(x => x.label);
  const routeTerms = top.matches.map(x => x.term);

  return {
    uncertain,
    specialty: top.route.specialty,
    subSpecialty,
    confidence,
    alternatives,
    candidates: candidatePayload,
    reason: top.route.reason,
    matchedTerms: [...new Set([...conceptTerms, ...routeTerms])].slice(0, 14),
    negatedTerms: [...new Set([...allNegatedTerms, ...contextSummary.negated])].slice(0, 12),
    ignoredContextTerms: ignoredContextTerms.slice(0, 12),
    clinicalConcepts,
    contextSummary,
    directoryEvidence: directoryKnowledge.evidence,
    inputUnderstanding,
    clarification,
    patientContext,
    urgency
  };
}

function relatedSubSpecialty(subs, target) {
  const targetTokens = new Set(normalizeText(canonicalSubSpecialty(target))
    .split(/\s+/)
    .filter(t => t.length > 2 && !['and','general','surgery','medicine'].includes(t)));
  if (!targetTokens.size) return null;
  let best = null;
  let bestOverlap = 0;
  for (const sub of subs || []) {
    const tokens = normalizeText(canonicalSubSpecialty(sub)).split(/\s+/).filter(Boolean);
    const overlap = tokens.filter(t => targetTokens.has(t)).length;
    if (overlap > bestOverlap) { best = sub; bestOverlap = overlap; }
  }
  return bestOverlap > 0 ? best : null;
}

const EXCLUSIVE_SUBSPECIALTY_GROUPS = [
  ['knee'],
  ['hip'],
  ['upper limb','shoulder','elbow','wrist','hand'],
  ['foot and ankle','foot & ankle','ankle','foot'],
  ['spinal disorders','spinal surgery','back surgery','spine'],
  ['ear and balance','ear & balance','otology'],
  ['nose and sinus','nose & sinus','sinus'],
  ['throat','laryngology'],
  ['upper gi'],
  ['lower gi','colorectal'],
  ['hepatology','liver']
];

function exclusiveScopeMismatch(subs, target) {
  if (!target || !Array.isArray(subs) || !subs.length) return false;
  const targetN = normalizeText(canonicalSubSpecialty(target));
  const targetGroup = EXCLUSIVE_SUBSPECIALTY_GROUPS.find(group => group.some(x => targetN.includes(normalizeText(x))));
  if (!targetGroup) return false;
  const doctorNorm = subs.map(x => normalizeText(canonicalSubSpecialty(x)));
  if (doctorNorm.some(s => targetGroup.some(x => s.includes(normalizeText(x)) || normalizeText(x).includes(s)))) return false;
  return EXCLUSIVE_SUBSPECIALTY_GROUPS
    .filter(group => group !== targetGroup)
    .some(group => doctorNorm.some(s => group.some(x => s.includes(normalizeText(x)))));
}

function rankDoctors(doctors, specialty, subSpecialty, queryText = '', options = {}) {
  const preferLipsHealthcare = options.preferLipsHealthcare !== false;
  const qTokens = [...new Set(queryTokens(queryText))].slice(0, 24);
  const canonicalTarget = canonicalSpecialty(specialty);

  return (doctors || []).map(doctor => {
    const doctorSpecialties = [...new Set([
      doctor.specialty,
      ...(Array.isArray(doctor.specialties) ? doctor.specialties : [])
    ].map(canonicalSpecialty).filter(Boolean))];
    if (canonicalTarget && !doctorSpecialties.includes(canonicalTarget)) return null;

    const reasons = [];
    const subs = Array.isArray(doctor.subSpecialties) ? doctor.subSpecialties : [];
    const scopeMismatch = exclusiveScopeMismatch(subs, subSpecialty);
    let clinicalTier = 1;
    let subMatch = null;

    if (subSpecialty) {
      const exactSub = subs.find(x => subSpecialtyEquivalent(x, subSpecialty));
      if (exactSub) {
        clinicalTier = 3;
        subMatch = exactSub;
        reasons.push(`Sub-specialty: ${exactSub}`);
      } else {
        const related = relatedSubSpecialty(subs, subSpecialty);
        if (related) {
          clinicalTier = 2;
          subMatch = related;
          reasons.push(`Related sub-specialty: ${related}`);
        }
      }
    }

    const conditionItems = Array.isArray(doctor.conditions) ? doctor.conditions.filter(Boolean) : [];
    const expertiseItems = Array.isArray(doctor.expertise) ? doctor.expertise.filter(Boolean) : [];
    const roleItems = [doctor.role || ''].filter(Boolean);
    const bio = normalizeText(doctor.biography || '');
    const activeConcepts = (options.routing?.clinicalConcepts || []).filter(x => ['present','uncertain'].includes(x.state));

    const matchItems = (items, baseWeight) => {
      const matches = [];
      let score = 0;
      for (const item of items) {
        const searchable = normalizeText(item);
        if (!searchable) continue;
        let hit = false;
        for (const token of qTokens) {
          if (phraseIn(searchable, token)) { hit = true; break; }
        }
        if (!hit) {
          for (const concept of activeConcepts) {
            const conceptDef = clinical.conceptById.get(concept.id);
            const phrases = [concept.label, ...(conceptDef?.synonyms || []), ...(concept.matchedPhrases || [])].filter(Boolean);
            if (phrases.some(phrase => phraseIn(searchable, phrase))) { hit = true; break; }
          }
        }
        if (hit) {
          matches.push(item);
          score += baseWeight;
        }
      }
      return { matches: [...new Set(matches)].slice(0, 4), score };
    };

    const conditionEvidence = matchItems(conditionItems, 6);
    const expertiseEvidence = matchItems(expertiseItems, 5);
    const roleEvidence = matchItems(roleItems, 2);
    let evidenceScore = conditionEvidence.score + expertiseEvidence.score + roleEvidence.score;

    const conceptEvidence = clinical.doctorConceptEvidence(doctor, activeConcepts);
    const conceptLabels = [...new Set(conceptEvidence.map(x => x.label).filter(Boolean))].slice(0, 5);
    evidenceScore += conceptEvidence.reduce((sum, item) => sum + (item.state === 'present' ? 5 : 2), 0);

    const biographyMatches = [];
    for (const token of qTokens) {
      if (bio && phraseIn(bio, token)) biographyMatches.push(token);
    }
    const uniqueBiographyMatches = [...new Set(biographyMatches)].slice(0, 3);
    evidenceScore += uniqueBiographyMatches.length * 0.5;

    const uniqueEvidence = [...new Set([
      ...conceptLabels,
      ...conditionEvidence.matches,
      ...expertiseEvidence.matches,
      ...uniqueBiographyMatches
    ].map(x => String(x || '').trim()).filter(Boolean))].slice(0, 7);
    if ((conditionEvidence.matches.length + expertiseEvidence.matches.length + conceptLabels.length) >= 2 && clinicalTier < 2) clinicalTier = 2;

    const routeReason = subMatch
      ? `${clinicalTier >= 3 ? 'Exact' : 'Related'} route: ${canonicalTarget} → ${subMatch}`
      : `Specialty route: ${canonicalTarget}`;
    reasons.push(routeReason);
    if (conditionEvidence.matches.length) reasons.push(`Treats: ${conditionEvidence.matches.join(', ')}`);
    if (expertiseEvidence.matches.length) reasons.push(`Expertise: ${expertiseEvidence.matches.join(', ')}`);
    if (conceptLabels.length && !conditionEvidence.matches.length) reasons.push(`Patient-note match: ${conceptLabels.join(', ')}`);
    if (uniqueBiographyMatches.length && reasons.length < 4) reasons.push(`Profile wording: ${uniqueBiographyMatches.join(', ')}`);

    const lipsPriority = preferLipsHealthcare && doctor.worksAtLipsHealthcare === true ? 1 : 0;
    const matchEvidence = {
      route: routeReason,
      subSpecialty: subMatch || null,
      exactSubSpecialty: Boolean(subMatch && clinicalTier >= 3),
      conditions: conditionEvidence.matches,
      expertise: expertiseEvidence.matches,
      concepts: conceptLabels,
      biography: uniqueBiographyMatches,
      lipsHealthcare: doctor.worksAtLipsHealthcare === true
    };
    const matchLevel = clinicalTier >= 3
      ? 'Exact sub-specialty match'
      : clinicalTier === 2
        ? 'Strong clinical match'
        : 'Specialty match';

    return {
      ...doctor,
      clinicalTier,
      matchLevel,
      scopeMismatch,
      conceptEvidence,
      matchEvidence,
      matchScore: Math.round((clinicalTier * 100 + lipsPriority * 10 + Math.min(evidenceScore, 24.9) - (scopeMismatch ? 80 : 0)) * 10) / 10,
      matchReasons: reasons
    };
  })
    .filter(Boolean)
    .sort((a, b) =>
      Number(a.scopeMismatch) - Number(b.scopeMismatch) ||
      b.clinicalTier - a.clinicalTier ||
      b.matchScore - a.matchScore ||
      Number(preferLipsHealthcare && b.worksAtLipsHealthcare === true) - Number(preferLipsHealthcare && a.worksAtLipsHealthcare === true) ||
      String(a.name).localeCompare(String(b.name))
    );
}

function rankDoctorsForRouting(doctors, routing, queryText = '', options = {}) {
  if (!routing?.specialty) return [];
  const candidates = Array.isArray(routing.candidates) ? routing.candidates : [];
  const topScore = candidates[0]?.score || 0;
  let specialties = [routing.specialty];
  if (routing.uncertain) {
    specialties = candidates
      .filter(x => x.score >= 5 && topScore - x.score <= 4.5)
      .slice(0, 3)
      .map(x => x.specialty);
    if (!specialties.includes(routing.specialty)) specialties.unshift(routing.specialty);
  }

  const candidateScore = new Map(candidates.map(x => [canonicalSpecialty(x.specialty), Number(x.score || 0)]));
  const merged = new Map();
  for (const specialty of [...new Set(specialties)]) {
    const ranked = rankDoctors(doctors, specialty, routing.subSpecialty, queryText, { ...options, routing });
    for (const doctor of ranked) {
      const key = normalizeText(doctor.profileUrl || doctor.name);
      const routeScore = candidateScore.get(canonicalSpecialty(specialty)) || 0;
      const row = { ...doctor, routeSpecialty: specialty, routeScore };
      const previous = merged.get(key);
      if (!previous || row.matchScore + routeScore > previous.matchScore + previous.routeScore) merged.set(key, row);
    }
  }

  return [...merged.values()].sort((a,b) =>
    Number(a.scopeMismatch) - Number(b.scopeMismatch) ||
    b.clinicalTier - a.clinicalTier ||
    (b.routeScore + b.matchScore / 50) - (a.routeScore + a.matchScore / 50) ||
    Number(options.preferLipsHealthcare !== false && b.worksAtLipsHealthcare === true) - Number(options.preferLipsHealthcare !== false && a.worksAtLipsHealthcare === true) ||
    String(a.name).localeCompare(String(b.name))
  );
}

module.exports = {
  ROUTES,
  SPECIALTY_ALIASES,
  routeSymptoms,
  rankDoctors,
  rankDoctorsForRouting,
  detectUrgency,
  normalizeText,
  canonicalSpecialty,
  specialtyEquivalent,
  canonicalSubSpecialty,
  subSpecialtyEquivalent,
  phraseAssertion,
  findAssertionMatches,
  assertionTokens,
  findMatches
};

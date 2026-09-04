import json
from openai import OpenAI

def analyze_symptoms(symptoms: str, api_key: str):
    client = OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=api_key
    )
    
    system_prompt = (
        "You are an expert medical triage assistant. Analyze the patient's symptoms "
        "and determine the most appropriate medical specialty (e.g. Cardiology, Orthopaedics, "
        "ENT, Dermatology, Gastroenterology, Aesthetics, Gynaecology & Obstetrics, "
        "General Practice, Physiotherapy, Rheumatology, Plastic Surgery, Geriatrics, Anaesthetics, Psychotherapy). "
        "Return ONLY a valid JSON object with two keys:\n"
        "1. 'recommended_specialty': string naming the primary specialty\n"
        "2. 'reasoning': string providing a 1-2 sentence explanation."
    )

    # Active Groq models list
    models_to_try = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "gemma2-9b-it"
    ]

    last_error = None
    for model_name in models_to_try:
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Patient Symptoms: {symptoms}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.2
            )
            content = response.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            last_error = e
            continue

    raise Exception(f"Groq API Error: {str(last_error)}")


def find_matching_doctors(recommendation: dict, doctors_db: list):
    spec = recommendation.get("recommended_specialty", "").lower()
    
    exact_matches = []
    partial_matches = []
    
    for doc in doctors_db:
        doc_spec = doc.get("specialty", "").lower()
        doc_subspecs = [s.lower() for s in doc.get("sub_specialties", [])]
        doc_bio = doc.get("biography", "").lower()
        
        if spec in doc_spec or doc_spec in spec:
            exact_matches.append(doc)
        elif any(spec in sub for sub in doc_subspecs) or spec in doc_bio:
            partial_matches.append(doc)
            
    matches = exact_matches + partial_matches
    return matches if matches else doctors_db[:5]
import json
import os
from openai import OpenAI

SYSTEM_PROMPT = """
You are a contact-center decision support assistant for LIPS Healthcare.
Your ONLY role is to analyze patient symptom descriptions and recommend the appropriate medical specialty and sub-specialty.

CRITICAL SAFETY DIRECTIVES:
1. DO NOT DIAGNOSE THE PATIENT. Never state what disease or condition they have.
2. RECOMMEND SPECIALTY ONLY (e.g., "Cardiology", "Trauma & Orthopaedics", "Neurology", "Gastroenterology", "Gynaecology & Obstetrics", "ENT", "Dermatology", "Urology").
3. EMERGENCY DETECTION: If symptoms suggest acute life-threatening emergencies (central chest pain, sudden slurred speech, sudden facial paralysis, severe shortness of breath), set "is_emergency": true.
4. AMBIGUITY: If symptoms are ambiguous, set confidence to "Medium" or "Low" and suggest up to 2 specialties.

Return ONLY a valid JSON object matching this schema:
{
  "is_emergency": false,
  "emergency_message": "",
  "recommended_specialty": "Specialty Name",
  "recommended_sub_specialty": "Sub-specialty Name",
  "alternative_specialty": "",
  "confidence": "High",
  "reason": "Short explanation."
}
"""

def analyze_symptoms(symptoms_text: str, groq_api_key: str) -> dict:
    client = OpenAI(
        api_key=groq_api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Patient Symptoms: {symptoms_text}"}
        ],
        temperature=0.1
    )
    
    return json.loads(response.choices[0].message.content)

def find_matching_doctors(specialty_info: dict, doctors_db: list) -> list:
    rec_spec = specialty_info.get("recommended_specialty", "").lower()
    rec_sub = specialty_info.get("recommended_sub_specialty", "").lower()
    alt_spec = specialty_info.get("alternative_specialty", "").lower()
    
    matched = []
    
    for doc in doctors_db:
        doc_spec = doc.get("specialty", "").lower()
        doc_subs = " ".join(doc.get("sub_specialties", [])).lower()
        doc_bio = doc.get("biography", "").lower()
        
        score = 0
        if rec_spec and (rec_spec in doc_spec or doc_spec in rec_spec):
            score += 10
        if alt_spec and (alt_spec in doc_spec or doc_spec in alt_spec):
            score += 5
        if rec_sub:
            sub_words = [w for w in rec_sub.split() if len(w) > 3]
            for word in sub_words:
                if word in doc_subs or word in doc_bio:
                    score += 3
                    
        if score > 0:
            matched.append((score, doc))
            
    matched.sort(key=lambda x: x[0], reverse=True)
    return [doc for score, doc in matched]
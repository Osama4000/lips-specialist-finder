import os
import json
import asyncio
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

from scraper import scrape_lips_doctors
from ai_matcher import analyze_symptoms, find_matching_doctors

app = FastAPI(title="LIPS Specialist Finder Cloud")

DATA_FILE = "doctors.json"
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
is_scraping = False

class SearchRequest(BaseModel):
    symptoms: str

def load_doctors():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

@app.get("/")
def get_ui():
    return FileResponse("index.html")

@app.post("/api/find-specialist")
def search_specialist(req: SearchRequest):
    if not GROQ_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY environment variable not set on server.")
    if not req.symptoms.strip():
        raise HTTPException(status_code=400, detail="Please enter patient symptoms.")
        
    doctors_db = load_doctors()
    if not doctors_db:
        raise HTTPException(status_code=400, detail="Doctor database empty. Click Update Doctors.")
        
    try:
        specialty_recommendation = analyze_symptoms(req.symptoms, GROQ_KEY)
        matching_doctors = find_matching_doctors(specialty_recommendation, doctors_db)
        
        return {
            "recommendation": specialty_recommendation,
            "doctors": matching_doctors[:10],
            "total_matches": len(matching_doctors)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def run_scraper_background():
    global is_scraping
    is_scraping = True
    try:
        await scrape_lips_doctors(DATA_FILE)
    finally:
        is_scraping = False

@app.post("/api/update-doctors")
def update_doctors(background_tasks: BackgroundTasks):
    global is_scraping
    if is_scraping:
        return {"status": "in_progress", "message": "Scraping in progress..."}
    
    background_tasks.add_task(run_scraper_background)
    return {"status": "started", "message": "Doctor database update started."}

@app.get("/api/db-status")
def db_status():
    docs = load_doctors()
    return {"count": len(docs), "is_scraping": is_scraping}
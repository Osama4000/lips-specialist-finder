import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from ai_matcher import analyze_symptoms, find_matching_doctors
from scraper import scrape_lips_doctors

app = FastAPI(title="LIPS Specialist Finder")

DOCTORS_FILE = "doctors.json"

def load_doctors():
    if os.path.exists(DOCTORS_FILE):
        try:
            with open(DOCTORS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@app.on_event("startup")
async def startup_event():
    if not os.path.exists(DOCTORS_FILE) or os.path.getsize(DOCTORS_FILE) == 0:
        print("doctors.json missing or empty. Scraping live data from LIPS website...")
        try:
            await scrape_lips_doctors(DOCTORS_FILE)
            print("Initial live scraping completed successfully.")
        except Exception as e:
            print(f"Error during startup scrape: {e}")

class SymptomRequest(BaseModel):
    symptoms: str

@app.get("/", response_class=HTMLResponse)
async def read_index():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return HTMLResponse("<h1>index.html not found</h1>", status_code=404)

@app.get("/api/db-status")
async def db_status():
    docs = load_doctors()
    return {"count": len(docs), "status": "ok"}

@app.post("/api/find-specialist")
async def find_specialist(req: SymptomRequest):
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY environment variable is not configured on server.")
    
    doctors_db = load_doctors()
    if not doctors_db:
        raise HTTPException(status_code=503, detail="Doctor database is empty. Please trigger re-scrape.")
    
    try:
        recommendation = analyze_symptoms(req.symptoms, groq_key)
        matched_docs = find_matching_doctors(recommendation, doctors_db)
        return {
            "recommendation": recommendation,
            "doctors": matched_docs[:5]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/refresh-doctors")
async def refresh_doctors():
    try:
        docs = await scrape_lips_doctors(DOCTORS_FILE)
        return {"status": "success", "count": len(docs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scrape: {str(e)}")
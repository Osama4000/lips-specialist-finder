import json
import asyncio
import re
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

LIPS_SPECIALISTS_URL = "https://lips.org.uk/our-specialists/"

async def scrape_lips_doctors(output_file="doctors.json"):
    doctors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(LIPS_SPECIALISTS_URL, wait_until="networkidle", timeout=60000)
        
        for _ in range(5):
            await page.mouse.wheel(0, 3000)
            await page.wait_for_timeout(1000)
            
        content = await page.content()
        soup = BeautifulSoup(content, "html.parser")
        
        profile_links = set()
        for a in soup.find_all("a", href=True):
            href = a['href']
            if "/our-specialists/" in href and href not in [LIPS_SPECIALISTS_URL, "https://lips.org.uk/our-specialists"]:
                if href.startswith("/"):
                    href = "https://lips.org.uk" + href
                clean_url = href.split('#')[0].split('?')[0]
                if clean_url.endswith("/"):
                    profile_links.add(clean_url)

        for url in profile_links:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                p_content = await page.content()
                p_soup = BeautifulSoup(p_content, "html.parser")
                
                h1 = p_soup.find("h1")
                name = h1.text.strip() if h1 else "Unknown Specialist"
                
                meta_desc = p_soup.find("meta", {"name": "description"})
                description = meta_desc["content"] if meta_desc else ""
                
                text_blocks = [p.text.strip() for p in p_soup.find_all(["p", "li"]) if len(p.text.strip()) > 20]
                full_text = " ".join(text_blocks[:15])
                
                specialties = []
                for tag in p_soup.find_all(["span", "div", "a"]):
                    txt = tag.text.strip()
                    if any(spec in txt for spec in [
                        "Orthopaedics", "Cardiology", "Gynaecology", "Neurology", 
                        "Gastroenterology", "Urology", "ENT", "Dermatology", 
                        "General Surgery", "Ophthalmology", "Rheumatology", "Aesthetics"
                    ]) and len(txt) < 50:
                        if txt not in specialties:
                            specialties.append(txt)

                specialty_primary = specialties[0] if specialties else "General Medicine"
                sub_specialties = specialties[1:] if len(specialties) > 1 else []

                doctors.append({
                    "id": re.sub(r'\W+', '-', name.lower()),
                    "name": name,
                    "profile_url": url,
                    "specialty": specialty_primary,
                    "sub_specialties": sub_specialties,
                    "biography": full_text[:1000]
                })
            except Exception:
                pass
                
        await browser.close()
        
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(doctors, f, indent=2, ensure_ascii=False)
        
    return doctors

if __name__ == "__main__":
    asyncio.run(scrape_lips_doctors())
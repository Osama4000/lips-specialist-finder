import json
import re
import requests
from bs4 import BeautifulSoup

LIPS_SPECIALISTS_URL = "https://www.lips.org.uk/our-specialists/"

def scrape_lips_doctors_live(output_file="doctors.json"):
    doctors = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(LIPS_SPECIALISTS_URL, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        
        profile_links = set()
        for a in soup.find_all("a", href=True):
            href = a['href']
            if "/our-specialists/" in href and href not in [
                LIPS_SPECIALISTS_URL, 
                "https://lips.org.uk/our-specialists", 
                "https://www.lips.org.uk/our-specialists"
            ]:
                if href.startswith("/"):
                    href = "https://www.lips.org.uk" + href
                clean_url = href.split('#')[0].split('?')[0]
                if clean_url.endswith("/"):
                    profile_links.add(clean_url)

        for url in profile_links:
            try:
                p_res = requests.get(url, headers=headers, timeout=10)
                if p_res.status_code != 200:
                    continue
                p_soup = BeautifulSoup(p_res.text, "html.parser")
                
                h1 = p_soup.find("h1")
                name = h1.text.strip() if h1 else "Unknown Specialist"
                
                meta_desc = p_soup.find("meta", {"name": "description"})
                description = meta_desc["content"] if meta_desc else ""
                
                text_blocks = [p.text.strip() for p in p_soup.find_all(["p", "li"]) if len(p.text.strip()) > 20]
                full_text = " ".join(text_blocks[:10]) if text_blocks else description
                
                specialties = []
                for tag in p_soup.find_all(["span", "div", "a"]):
                    txt = tag.text.strip()
                    if any(spec in txt for spec in [
                        "Orthopaedics", "Cardiology", "Gynaecology", "Neurology", 
                        "Gastroenterology", "Urology", "ENT", "Dermatology", 
                        "General Surgery", "Ophthalmology", "Rheumatology", "Aesthetics"
                    ]) and len(txt) < 40:
                        if txt not in specialties:
                            specialties.append(txt)

                primary_spec = specialties[0] if specialties else "General Medicine"
                sub_specs = specialties[1:] if len(specialties) > 1 else []

                doctors.append({
                    "id": re.sub(r'\W+', '-', name.lower()),
                    "name": name,
                    "profile_url": url,
                    "specialty": primary_spec,
                    "sub_specialties": sub_specs,
                    "biography": full_text[:800]
                })
            except Exception:
                continue

        if doctors:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(doctors, f, indent=2, ensure_ascii=False)
                
    except Exception as e:
        print(f"Live scrape error: {e}")

    return doctors
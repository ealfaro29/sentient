import os
import json
import time # Para el timestamp del caché
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from newspaper import Article

load_dotenv()
app = Flask(__name__, static_url_path='', static_folder='static')

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
OPENAI_CLIENT = None
if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ IA (OpenAI): Activa")
    except: print("⚠️ ERROR: Falta librería 'openai'.")

# Caché en memoria: {url: {'data': data, 'timestamp': time.time()}}
SCRAPE_CACHE = {}
CACHE_DURATION = 86400 # 24 horas

@app.route('/')
def home(): return app.send_static_file('index.html')

def get_pexels_images(query, count=3):
    if not PEXELS_API_KEY: return []
    try:
        h = {'Authorization': PEXELS_API_KEY}
        q = query.split(':')[0].split('|')[0][:50]
        r = requests.get(f'https://api.pexels.com/v1/search?query={q}&per_page={count}&orientation=portrait', headers=h, timeout=3)
        return [p['src']['large2x'] for p in r.json().get('photos', [])] if r.status_code == 200 else []
    except: return []

# Actualizado: Pide 1 caption común + 3 variantes de título/subtítulo
def get_ai_data(title, text, source):
    if not OPENAI_CLIENT: return None
    # ACTUALIZADO: Hardcoded a GPT-4o siempre
    print(f"🧠 IA pensando (GPT-4o) para: {title[:20]}...")

    try:
        # Prompt actualizado con Variante C más agresiva
        prompt = f"""
        ROLE: Elite Social Media Editor.
        SOURCE: "{title}" ({source}). SUMMARY: "{text[:2500]}"
        
        TASK 1: Create ONE in-depth, high-engagement Instagram caption (common for all posts).
        - NO LABELS/BRACKETS. NO EMOJIS.
        - STRUCTURE: Hook (1 shocking sentence) -> Detailed Body (2-3 comprehensive sentences with context) -> Impact Analysis (2 sentences on why it matters) -> Engagement Question -> "Source: {source}"

        TASK 2: Create 3 DISTINCT Title/Subtitle pairs matching these exact styles:
        - VARIANT A (News Style): Objective, factual, urgent, professional.
        - VARIANT B (Infotainment): Curious, clever, slightly casual, "did you know?" vibe.
        - VARIANT C (Clickbait/Controversial): HIGHLY POLARIZING, shocking, exaggerated, borderline sensationalist. Must trigger immediate curiosity or outrage.
        
        CONSTRAINTS: Titles max 8 words. Subtitles max 10 words.

        OUTPUT JSON: {{
            "common_caption": "Full caption text here...",
            "variants": {{
                "A": {{ "title": "NEWS TITLE", "subtitle": "Factual summary." }},
                "B": {{ "title": "INFOTAINMENT TITLE", "subtitle": "Curious hook." }},
                "C": {{ "title": "CLICKBAIT TITLE", "subtitle": "Shocking statement!" }}
            }}
        }}
        """
        r = OPENAI_CLIENT.chat.completions.create(
             model="gpt-4o", # Hardcoded
             response_format={"type": "json_object"},
             messages=[{"role": "system", "content": "JSON only."}, {"role": "user", "content": prompt}], temperature=0.7
        )
        return json.loads(r.choices[0].message.content)
    except Exception as e: print(f"❌ AI Error: {e}"); return None

@app.route('/api/scrape', methods=['POST'])
def scrape():
    url = request.json.get('url')
    # Ya no necesitamos model_pref
    if not url: return jsonify({"error": "URL missing"}), 400

    now = time.time()
    # Revisa el caché
    if url in SCRAPE_CACHE and now - SCRAPE_CACHE[url]['timestamp'] < CACHE_DURATION:
        print(f"⚡ Sirviendo desde caché: {url[:30]}...")
        return jsonify(SCRAPE_CACHE[url]['data'])

    try:
        a = Article(url); a.download(); a.parse()
        src = a.source_url.replace("https://","").replace("www.","").split("/")[0].split(".")[0].upper()
        imgs = get_pexels_images(a.title) or ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080"]
        while len(imgs)<3: imgs.append(imgs[0])

        # Obtiene el nuevo objeto de contenido de la IA
        ai_content_data = get_ai_data(a.title, a.text, src)

        data = {
            "source": src, "images": {"a": a.top_image or imgs[0], "b": imgs[0], "c": imgs[1]},
            "ai_content": ai_content_data, # Objeto único con 'common_caption' y 'variants'
            "original": {"title": a.title[:50].upper(), "subtitle": a.text[:100]+"..."}
        }
        # Guarda en caché
        SCRAPE_CACHE[url] = {'data': data, 'timestamp': now}
        return jsonify(data)
    except Exception as e: return jsonify({"error": str(e)}), 400

if __name__ == '__main__': app.run(host='0.0.0.0', port=5000, debug=True)
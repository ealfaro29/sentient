import os
import json
import base64
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from dotenv import load_dotenv
from newspaper import Article
import requests

# --- CONFIGURACIÓN ---
load_dotenv()
OPENAI_CLIENT = None
api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    try:
        from openai import OpenAI
        OPENAI_CLIENT = OpenAI(api_key=api_key)
        print("✅ IA (OpenAI): Activa")
    except:
        print("⚠️ ERROR: Falta librería 'openai'")

PEXELS_KEY = os.getenv("PEXELS_API_KEY")
if PEXELS_KEY:
    print("✅ IMÁGENES (Pexels): Activo")
else:
    print("⚠️ AVISO: Falta PEXELS_API_KEY en .env")

app = Flask(__name__, static_url_path='', static_folder='static')

@app.errorhandler(Exception)
def handle_error(e):
    return jsonify({"error": str(e)}), 500

@app.route('/')
def home():
    return app.send_static_file('index.html')

def get_pexels_images(query, count=3):
    if not PEXELS_KEY: return []
    try:
        clean_query = query.split(':')[0].split('|')[0][:50]
        print(f"🔎 Pexels buscando [{count}]: '{clean_query}'...")
        headers = {'Authorization': PEXELS_KEY}
        r = requests.get(
            f'https://api.pexels.com/v1/search?query={clean_query}&per_page={count}&orientation=portrait',
            headers=headers, timeout=5
        )
        if r.status_code == 200:
            data = r.json()
            if data.get('photos'):
                return [p['src']['large2x'] for p in data['photos']]
    except Exception as e:
        print(f"⚠️ Pexels Error: {e}")
    return []

def get_ai_data(title, text):
    if not OPENAI_CLIENT: return None
    try:
        prompt = f"""
        ACT AS AN INSTAGRAM EXPERT.
        SOURCE: "{title}"
        SUMMARY: "{text[:600]}"
        
        TASK: Create 3 IG post variants (A, B, C) with CAPTIONS.
        CONSTRAINTS: 
        - Titles: MAX 6 WORDS. Punchy.
        - Subtitles: MAX 12 WORDS. Engaging summary.
        - Captions: Ready-to-post text with emojis and 5-10 relevant hashtags.

        STYLES:
        - A (News): Informative, direct caption.
        - B (Feature): Storytelling caption, engaging question.
        - C (Viral): Short, provocative caption, viral hashtags.

        OUTPUT RAW JSON:
        {{
            "variant_a": {{ "title": "...", "subtitle": "...", "caption": "Full caption A here..." }},
            "variant_b": {{ "title": "...", "subtitle": "...", "caption": "Full caption B here..." }},
            "variant_c": {{ "title": "...", "subtitle": "...", "caption": "Full caption C here..." }}
        }}
        """
        resp = OPENAI_CLIENT.chat.completions.create(
            model="gpt-3.5-turbo-1106",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.85
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        print(f"AI Error: {e}")
        return None

@app.route('/api/scrape', methods=['POST'])
def scrape():
    url = request.json.get('url')
    if not url: return jsonify({"error": "URL missing"}), 400
    
    print(f"📰 Procesando: {url}")
    try:
        article = Article(url, request_timeout=15)
        article.download(); article.parse()
    except: return jsonify({"error": "Failed to download"}), 400

    if not article.title: return jsonify({"error": "Failed to parse"}), 400

    bg_article = None
    if article.top_image:
        try:
            r = requests.get(article.top_image, timeout=4)
            if r.status_code == 200:
                bg_article = f"data:{r.headers.get('Content-Type','image/jpeg')};base64," + base64.b64encode(r.content).decode('utf-8')
            else: bg_article = article.top_image
        except: bg_article = article.top_image

    pex = get_pexels_images(article.title, count=3)
    ph = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080"
    img_a = bg_article or (pex[0] if len(pex)>0 else ph)
    img_b = pex[0] if len(pex)>0 and pex[0]!=img_a else (pex[1] if len(pex)>1 else img_a)
    img_c = pex[1] if len(pex)>1 and pex[1]!=img_b else (pex[2] if len(pex)>2 else img_b)

    ai = get_ai_data(article.title, article.text)

    return jsonify({
        "source": article.source_url.replace("https://","").replace("www.","").split("/")[0].split(".")[0].upper(),
        "images": { "a": img_a, "b": img_b, "c": img_c },
        "ai_variants": ai,
        "original": {"title": article.title[:50], "subtitle": article.text[:100]}
    })

if __name__ == '__main__':
    print("🚀 SERVIDOR V15 LISTO: http://localhost:5000")
    app.run(debug=True, port=5000)
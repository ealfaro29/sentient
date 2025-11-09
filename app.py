import os
import json
from flask import Flask, request, jsonify
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

def clean_caption(raw_caption):
    """Limpia el caption crudo de la IA para eliminar instrucciones y formatear."""
    clean_lines = []
    try:
        for line in raw_caption.strip().split('\n'):
            line = line.strip()
            if not line: continue
            # Detectar líneas de instrucción entre corchetes
            if line.startswith('[') and ']' in line:
                # Solo queremos conservar la fuente
                if line.lower().startswith('[source'):
                    clean_lines.append(line.strip('[]'))
                # Ignoramos [HOOK], [IMPACT], etc.
                continue
            clean_lines.append(line)
        return "\n\n".join(clean_lines)
    except:
        return raw_caption

def get_ai_data(title, text, source_name):
    if not OPENAI_CLIENT: return None
    try:
        print(f"🧠 IA Generando V17 para: {title[:20]}...")
        prompt = f"""
        ACT AS AN EXPERT SOCIAL MEDIA EDITOR.
        SOURCE ARTICLE: "{title}"
        SUMMARY: "{text[:1500]}"
        SOURCE NAME: "{source_name}"

        TASK: Create 3 distinct post variants (A, B, C).
        For EACH variant, generate:
        1. "title": MAX 6 WORDS. Punchy.
        2. "subtitle": MAX 12 WORDS. Engaging.
        3. "caption": STRICTLY follow this format with brackets:
           [HOOK - curiosity driven, under 8 words]
           [SET THE SCENE - factual, 2-3 sentences]
           [ADD DEPTH - context/why it matters, 2-3 sentences]
           [IMPACT - 1 sentence on why it matters to users]
           [QUESTION - engaging question]
           [Source: {source_name}]

        STYLE RULES: Clear language, active voice, address reader as "you", NO hashtags in main text, NO clichés (innovative, disruptive).

        OUTPUT RAW JSON ONLY:
        {{
            "variant_a": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_b": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_c": {{ "title": "...", "subtitle": "...", "caption": "..." }}
        }}
        """
        resp = OPENAI_CLIENT.chat.completions.create(
            model="gpt-3.5-turbo-1106",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        raw_data = json.loads(resp.choices[0].message.content)
        
        # Limpiar captions antes de enviarlos
        for v in ['variant_a', 'variant_b', 'variant_c']:
            if v in raw_data and 'caption' in raw_data[v]:
                raw_data[v]['caption'] = clean_caption(raw_data[v]['caption'])
                
        return raw_data
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

    # Imágenes
    bg_article = article.top_image
    pex = get_pexels_images(article.title, count=3)
    
    # Fallbacks
    ph = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080"
    img_a = bg_article or (pex[0] if len(pex)>0 else ph)
    img_b = pex[0] if len(pex)>0 and pex[0]!=img_a else (pex[1] if len(pex)>1 else img_a)
    img_c = pex[1] if len(pex)>1 and pex[1]!=img_b else (pex[2] if len(pex)>2 else img_b)

    # Fuente e IA
    try: source_name = article.source_url.replace("https://","").replace("www.","").split("/")[0]
    except: source_name = "Unknown"
    
    ai = get_ai_data(article.title, article.text, source_name)

    return jsonify({
        "source": source_name.split(".")[0].upper(),
        "images": { "a": img_a, "b": img_b, "c": img_c },
        "ai_variants": ai,
        "original": {"title": article.title[:50], "subtitle": article.text[:100]}
    })

if __name__ == '__main__':
    print("🚀 SERVIDOR V17 LISTO: http://localhost:5000")
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
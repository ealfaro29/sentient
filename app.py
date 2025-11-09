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
        # Limpiamos la query para tener mejores resultados
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

def get_ai_data(title, text, source_name):
    """
    Función de IA actualizada con el prompt V16 (formato estricto de caption).
    """
    if not OPENAI_CLIENT: return None
    try:
        print(f"🧠 IA Generando con prompt V16 para: {title[:20]}...")

        # --- INICIO DEL PROMPT PERSONALIZADO V16 ---
        prompt = f"""
        ACT AS AN EXPERT SOCIAL MEDIA EDITOR following EXTREMELY STRICT rules.
        SOURCE ARTICLE TITLE: "{title}"
        SOURCE ARTICLE TEXT: "{text[:1500]}"
        SOURCE NAME: "{source_name}"

        TASK: Create 3 distinct post variants (A, B, C).
        
        For EACH of the 3 variants, you MUST generate:
        1. "title": MAX 6 WORDS. Punchy and optimized for the visual card.
        2. "subtitle": MAX 12 WORDS. Engaging summary for the visual card.
        3. "caption": A full caption that STRICTLY follows the format and rules below.

        --- CAPTION FORMAT AND RULES (MANDATORY) ---
        The caption MUST be in this exact multi-line format, including the brackets:
        [HOOK – short, bold, curiosity-driven, under 8 words.]
        [SET THE SCENE – explain what happened in 2–3 short sentences using plain, factual language. Answer: who did what, what was launched, or what changed.]
        [ADD DEPTH – 2–3 sentences that explain how it works, why it matters, or what’s new or different about it. Include numbers, examples, or context if possible. Avoid hype and adjectives.]
        [IMPACT – 1 short sentence explaining why this update matters to everyday users or the tech world.]
        [QUESTION – 1 engaging question that invites readers to think or comment.]
        [Source: {source_name}]

        Style Rules (MANDATORY):
        - Use clear, direct language and an active voice.
        - Vary sentence rhythm between short and medium.
        - Address the reader with "you" or "your."
        - Use commas and periods only (NO semicolons, NO em dashes).
        - NEVER use hashtags or markdown in the caption text itself (except if you want to add a block at the very end, but the prompt didn't specify it).
        - Avoid filler, vague claims, or clichés.
        - BAN these words: innovative, disruptive, cutting-edge, holistic, optimize, empower, seamless, paradigm shift, scalable, next-generation, robust, and similar.
        - NO "group of three" phrases (e.g., “faster, smarter, better”).
        - The caption MUST end with one question and the "Source:" line.
        ---

        OUTPUT RAW JSON ONLY:
        {{
            "variant_a": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_b": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_c": {{ "title": "...", "subtitle": "...", "caption": "..." }}
        }}
        """
        # --- FIN DEL PROMPT PERSONALIZADO ---

        resp = OPENAI_CLIENT.chat.completions.create(
            model="gpt-3.5-turbo-1106",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7 # Temperatura más baja para que siga las reglas estrictas
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

    # 1. Intentar obtener imagen original
    bg_article = None
    if article.top_image:
        try:
            # Intentamos descargarla nosotros para evitar bloqueos CORS en el navegador
            r = requests.get(article.top_image, timeout=4)
            if r.status_code == 200:
                bg_article = f"data:{r.headers.get('Content-Type','image/jpeg')};base64," + base64.b64encode(r.content).decode('utf-8')
            else:
                bg_article = article.top_image
        except:
            bg_article = article.top_image

    # 2. Obtener imágenes de Pexels
    pex = get_pexels_images(article.title, count=3)
    
    # 3. Asignar imágenes a variantes (con fallback inteligente)
    # Placeholder por si todo falla
    ph = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080"
    
    img_a = bg_article or (pex[0] if len(pex)>0 else ph)
    img_b = pex[0] if len(pex)>0 and pex[0]!=img_a else (pex[1] if len(pex)>1 else img_a)
    # Si tenemos suficientes de Pexels, usamos una diferente para C, sino repetimos B o A
    img_c = pex[1] if len(pex)>1 and pex[1]!=img_b else (pex[2] if len(pex)>2 else img_b)

    # 4. Obtener nombre de la fuente para el caption
    try:
        source_name = article.source_url.replace("https://","").replace("http://","").replace("www.","").split("/")[0]
    except:
        source_name = "Unknown Source"

    # 5. Llamar a la IA con el prompt V16
    ai = get_ai_data(article.title, article.text, source_name)

    return jsonify({
        "source": source_name.split(".")[0].upper(),
        "images": { "a": img_a, "b": img_b, "c": img_c },
        "ai_variants": ai,
        "original": {"title": article.title[:50], "subtitle": article.text[:100]}
    })

if __name__ == '__main__':
    print("🚀 SERVIDOR V16 LISTO: http://localhost:5000")
    # '0.0.0.0' es necesario para que Render exponga el puerto correctamente
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
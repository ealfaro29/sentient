import os
import json
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

def get_ai_data(title, text, source):
    if not OPENAI_CLIENT: return None
    try:
        print(f"🧠 IA pensando (versión larga) para: {title[:20]}...")
        # PROMPT ACTUALIZADO: PIDIENDO MÁS LONGITUD Y DETALLE
        prompt = f"""
        ROLE: Elite Social Media Editor. TASK: 3 in-depth, high-engagement Instagram captions.
        SOURCE: "{title}" ({source}). SUMMARY: "{text[:2500]}"
        
        RULES: 
        - NO LABELS/BRACKETS (e.g., no [Hook]). 
        - NO EMOJIS.
        - MAKE IT LONG: Use multiple sentences per section to add depth.
        - END WITH "Source: {source}"

        REQUIRED STRUCTURE (Invisible, just follow the flow):
        1. Hook (1 powerful, shocking sentence)
        2. Detailed Body (2-3 comprehensive sentences explaining EXACTLY what happened with context)
        3. Impact Analysis (2 sentences on why this matters heavily right now)
        4. Engagement (1 thought-provoking question)
        5. Source Attribution

        OUTPUT JSON: {{
            "variant_a": {{ 
                "title": "MAX 5 WORDS", 
                "subtitle": "MAX 12 WORDS", 
                "caption": "Start with a compelling hook that grabs attention immediately.\nFollow up with a detailed summary of the event, ensuring you cover the who, what, and where in at least two or three solid sentences to provide full context.\nExplain the deeper significance of this news and its potential future impact on the industry or society. This analysis should be thoughtful and add value beyond just facts.\nAsk a specific, open-ended question that will encourage followers to debate in the comments?\nSource: {source}" 
            }},
            "variant_b": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_c": {{ "title": "...", "subtitle": "...", "caption": "..." }}
        }}
        """
        r = OPENAI_CLIENT.chat.completions.create(
             model="gpt-3.5-turbo-1106", response_format={"type": "json_object"},
             messages=[{"role": "system", "content": "JSON only. Write lengthy, detailed captions."}, {"role": "user", "content": prompt}], temperature=0.7
        )
        return json.loads(r.choices[0].message.content)
    except Exception as e: print(f"❌ AI Error: {e}"); return None

@app.route('/api/scrape', methods=['POST'])
def scrape():
    url = request.json.get('url')
    if not url: return jsonify({"error": "URL missing"}), 400
    try:
        a = Article(url); a.download(); a.parse()
        src = a.source_url.replace("https://","").replace("www.","").split("/")[0].split(".")[0].upper()
        imgs = get_pexels_images(a.title) or ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080"]
        while len(imgs)<3: imgs.append(imgs[0])
        return jsonify({
            "source": src, "images": {"a": a.top_image or imgs[0], "b": imgs[0], "c": imgs[1]},
            "ai_variants": get_ai_data(a.title, a.text, src),
            "original": {"title": a.title[:50].upper(), "subtitle": a.text[:100]+"..."}
        })
    except Exception as e: return jsonify({"error": str(e)}), 400

if __name__ == '__main__': app.run(host='0.0.0.0', port=5000, debug=True)
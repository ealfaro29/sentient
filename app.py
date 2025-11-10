import os
import json
import time
import requests
from flask import Flask, request, jsonify, Response, stream_with_context
from dotenv import load_dotenv
from newspaper import Article, Config
from newspaper.article import ArticleDownloadState

# Cargar variables de entorno
load_dotenv()
app = Flask(__name__, static_url_path='', static_folder='static')

# Configuración de claves API
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

OPENAI_CLIENT = None
if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ IA (OpenAI): Cliente activo")
    except Exception as e:
        print(f"⚠️ ERROR: No se pudo iniciar el cliente OpenAI: {e}")

SCRAPE_CACHE = {}
CACHE_DURATION = 86400

@app.route('/')
def home(): return app.send_static_file('index.html')

def get_pexels_images(query, count=3):
    if not PEXELS_API_KEY: return []
    try:
        headers = {'Authorization': PEXELS_API_KEY}
        clean_query = query.replace(":", "").replace("|", "").strip()[:100]
        url = f'https://api.pexels.com/v1/search?query={clean_query}&per_page={count}&orientation=portrait'
        r = requests.get(url, headers=headers, timeout=5)
        return [p['src']['large2x'] for p in r.json().get('photos', [])] if r.status_code == 200 else []
    except: return []

def get_ai_data(title, text, source):
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        print("❌ Error: Faltan credenciales OpenAI")
        return None
    print(f"🧠 IA pensando para: {title[:30]}...")
    try:
        run = OPENAI_CLIENT.beta.threads.create_and_run_poll(
            assistant_id=OPENAI_ASSISTANT_ID,
            thread={"messages": [{"role": "user", "content": f"TITLE: {title}\nSOURCE: {source}\nTEXT: {text[:3000]}"}]}
        )
        if run.status == 'completed':
            msgs = OPENAI_CLIENT.beta.threads.messages.list(thread_id=run.thread_id)
            return json.loads(msgs.data[0].content[0].text.value)
    except Exception as e:
        print(f"❌ Error IA: {e}")
        return None

@app.route('/api/proxy_image')
def proxy_image():
    """Proxy para evitar problemas de Hotlink Protection (CORS/403 en imágenes)"""
    url = request.args.get('url')
    if not url: return "URL missing", 400
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.google.com/'
        }
        req = requests.get(url, headers=headers, stream=True, timeout=10, verify=False)
        return Response(stream_with_context(req.iter_content(chunk_size=1024)), 
                        content_type=req.headers.get('content-type', 'image/jpeg'))
    except Exception as e:
        print(f"⚠️ Error proxy imagen: {e}")
        return "Image blocked", 404

@app.route('/api/scrape', methods=['POST'])
def scrape():
    url = request.json.get('url')
    if not url: return jsonify({"error": "URL missing"}), 400

    now = time.time()
    if url in SCRAPE_CACHE and now - SCRAPE_CACHE[url]['timestamp'] < CACHE_DURATION:
        print(f"⚡ Caché: {url[:30]}...")
        return jsonify(SCRAPE_CACHE[url]['data'])

    try:
        print(f"📥 Descargando (Modo Nuclear): {url[:50]}...")
        # 1. Descarga manual robusta
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://www.google.com/'
        }
        response = requests.get(url, headers=headers, timeout=15, verify=True)
        if response.status_code != 200: raise Exception(f"Error HTTP {response.status_code}")

        # 2. Inyección forzada en Newspaper
        article = Article(url)
        article.set_html(response.text)
        article.download_state = ArticleDownloadState.SUCCESS # FIX CRÍTICO
        article.parse()

        src = article.source_url.replace("https://","").replace("http://","").replace("www.","").split("/")[0].split(".")[0].upper()
        ai_data = get_ai_data(article.title, article.text, src)
        
        img_q = ai_data.get('image_keywords', article.title) if ai_data else article.title
        imgs = get_pexels_images(img_q) or ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080"]
        while len(imgs)<3: imgs.append(imgs[0])

        data = {
            "source": src,
            "images": {"a": article.top_image or imgs[0], "b": imgs[0], "c": imgs[1]},
            "ai_content": ai_data,
            "original": {"title": article.title[:50].upper(), "subtitle": article.text[:100]+"..."}
        }
        SCRAPE_CACHE[url] = {'data': data, 'timestamp': now}
        return jsonify(data)
    except Exception as e:
        print(f"🔥 Error Scrape: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__': app.run(host='0.0.0.0', port=5000, debug=True)
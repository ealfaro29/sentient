import os
import json
import time
import re
import requests
from urllib.parse import urlparse, quote_plus, parse_qs
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, Response, stream_with_context
from dotenv import load_dotenv
from newspaper import Article
from newspaper.article import ArticleDownloadState

# Cargar variables de entorno
load_dotenv()
app = Flask(__name__, static_url_path='', static_folder='static')

# Configuración de claves API
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
# >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
# Asegúrate de que estas claves existan en tu archivo .env
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_CX = os.getenv("GOOGLE_SEARCH_CX")
# <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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
        return None, "Faltan credenciales OpenAI"
    print(f"🧠 IA pensando para: {title[:30]}...")
    try:
        run = OPENAI_CLIENT.beta.threads.create_and_run_poll(
            assistant_id=OPENAI_ASSISTANT_ID,
            thread={"messages": [{"role": "user", "content": f"TITLE: {title}\nSOURCE: {source}\nTEXT: {text[:3000]}"}]},
            poll_interval_ms=2000,
            timeout=40 
        )
        if run.status == 'completed':
            msgs = OPENAI_CLIENT.beta.threads.messages.list(thread_id=run.thread_id)
            return json.loads(msgs.data[0].content[0].text.value), None
        else:
            return None, f"Estado IA no completado: {run.status}"
    except Exception as e:
        print(f"❌ Error IA: {e}")
        return None, str(e)

def infer_search_info(url):
    """
    Extrae dominio y palabras clave probables de una URL.
    """
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.replace('www.', '').split('.')[0]
        path = parsed.path

        year_match = re.search(r'/(\d{4})/', path)
        year = year_match.group(1) if year_match else ""

        segments = [s for s in path.split('/') if s and not s.isdigit() and len(s) > 2]
        
        slug = ""
        if segments:
            last_segment = segments[-1].split('.')[0]
            
            if len(last_segment) < 5 and len(segments) > 1:
                slug = segments[-2].split('.')[0]
            else:
                slug = last_segment
            
            keywords = slug.replace('-', ' ').replace('_', ' ').replace('+', ' ')
        else:
            keywords = ""

        refined_keywords = " ".join(keywords.split()[:6]) 
        refined_keywords = " ".join([word for word in refined_keywords.split() if not word.isdigit()])

        return domain, year, refined_keywords
    except:
        return "", "", ""

def perform_google_search(query, max_results=5):
    """Realiza la búsqueda utilizando la Google Custom Search API."""
    if not GOOGLE_SEARCH_API_KEY or not GOOGLE_SEARCH_CX:
        print("⚠️ ERROR: Faltan claves de Google Search. Usando DuckDuckGo de emergencia.")
        # Fallback a DuckDuckGo si faltan claves de Google
        return perform_ddg_search_fallback(query, max_results)

    try:
        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            'key': GOOGLE_SEARCH_API_KEY,
            'cx': GOOGLE_SEARCH_CX,
            'q': query,
            'num': max_results,
            'fields': 'items(title,link,snippet)'
        }
        
        r = requests.get(url, params=params, timeout=8)
        data = r.json()

        results = []
        if 'items' in data:
            for item in data['items']:
                results.append({
                    'title': item.get('title', 'No Title'),
                    'url': item.get('link', '#'),
                    'snippet': item.get('snippet', 'No snippet available.')
                })
        
        return results
    except Exception as e:
        print(f"⚠️ Google Search API Error: {e}")
        # En caso de error de la API de Google, se puede intentar DuckDuckGo como último recurso
        return perform_ddg_search_fallback(query, max_results)

def perform_ddg_search_fallback(query, max_results=5):
    """Helper para realizar la búsqueda en DuckDuckGo HTML (Usado como fallback de emergencia)."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Referer': 'https://html.duckduckgo.com/'
        }
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        res = requests.get(url, headers=headers, timeout=8)
        if res.status_code != 200: return []

        soup = BeautifulSoup(res.text, 'html.parser')
        results = []
        for result in soup.select('.result'):
            link_tag = result.select_one('.result__a')
            snippet_tag = result.select_one('.result__snippet')
            if link_tag and link_tag.get('href'):
                url_res = link_tag['href']
                if url_res.startswith('/l/?'):
                     try: url_res = parse_qs(urlparse(url_res).query)['uddg'][0]
                     except: pass
                
                if url_res.startswith('http'):
                    results.append({
                        'title': link_tag.get_text(strip=True),
                        'url': url_res,
                        'snippet': snippet_tag.get_text(strip=True) if snippet_tag else ""
                    })
                    if len(results) >= max_results: break
        return results
    except Exception as e:
        print(f"⚠️ DDG Search Error: {e}")
        return []


@app.route('/api/search_alternatives', methods=['POST'])
def search_alternatives():
    failed_url = request.json.get('url')
    if not failed_url: return jsonify({"error": "No URL provided"}), 400

    domain, year, keywords = infer_search_info(failed_url)
    
    # 1. Fallback/Búsqueda Genérica si las keywords son débiles
    if len(keywords.split()) < 3:
        query = f"{domain} news"
        print(f"🔍 Consulta Genérica: '{query}'")
        # Usamos Google Search aquí
        return jsonify({'query': query, 'results': perform_google_search(query)})

    # 2. Intento Temático (Keywords + Año) - Consulta más amplia
    query1 = f"{keywords} {year}".strip()
    print(f"🔍 Intento 1 (Temático): '{query1}'")
    # Usamos Google Search aquí
    results = perform_google_search(query1, max_results=6)

    # 3. Si tenemos pocos resultados, reintentamos con Dominio + Keywords (más específica)
    if len(results) < 3:
        query2 = f"{domain} {keywords} {year}".strip()
        print(f"🔄 Intento 2 (Específico): '{query2}'")
        # Usamos Google Search aquí
        results2 = perform_google_search(query2, max_results=6)
        
        # Combinar resultados sin duplicados
        existing_urls = set(r['url'] for r in results)
        for r in results2:
            if r['url'] not in existing_urls:
                results.append(r)
        
        final_query = query1
    else:
        final_query = query1

    return jsonify({'query': final_query, 'results': results[:8]}) 

@app.route('/api/proxy_image')
def proxy_image():
    url = request.args.get('url')
    if not url: return "URL missing", 400
    try:
        headers = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com/'}
        req = requests.get(url, headers=headers, stream=True, timeout=10, verify=False)
        return Response(stream_with_context(req.iter_content(chunk_size=1024)), 
                        content_type=req.headers.get('content-type', 'image/jpeg'))
    except: return "Image blocked", 404

@app.route('/api/scrape', methods=['POST'])
def scrape():
    url = request.json.get('url')
    if not url: return jsonify({"error": "URL missing"}), 400

    now = time.time()
    if url in SCRAPE_CACHE and now - SCRAPE_CACHE[url]['timestamp'] < CACHE_DURATION:
        print(f"⚡ Caché: {url[:30]}...")
        return jsonify(SCRAPE_CACHE[url]['data'])

    try:
        print(f"📥 Descargando: {url[:50]}...")
        nuclear_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1'
        }
        response = requests.get(url, headers=nuclear_headers, timeout=15, verify=True)
        if response.status_code != 200: raise Exception(f"HTTP {response.status_code}")

        article = Article(url)
        article.set_html(response.text)
        article.download_state = ArticleDownloadState.SUCCESS
        article.parse()

        src = article.source_url.replace("https://","").replace("http://","").replace("www.","").split("/")[0].split(".")[0].upper()
        ai_data, ai_error = get_ai_data(article.title, article.text, src)
        
        img_q = ai_data.get('image_keywords', article.title) if ai_data else article.title
        imgs = get_pexels_images(img_q) or ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080"]
        while len(imgs)<3: imgs.append(imgs[0])

        data = {
            "source": src,
            "images": {"a": article.top_image or imgs[0], "b": imgs[0], "c": imgs[1]},
            "ai_content": ai_data,
            "ai_error": ai_error,
            "original": {"title": article.title[:50].upper(), "subtitle": article.text[:100]+"..."}
        }
        SCRAPE_CACHE[url] = {'data': data, 'timestamp': now}
        return jsonify(data)
    except Exception as e:
        print(f"🔥 Error Scrape: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__': app.run(host='0.0.0.0', port=5000, debug=True)
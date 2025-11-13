import os
import json
import re
import time
from urllib.parse import urlparse, quote_plus, parse_qs

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response

# --- IA / OpenAI ---
OPENAI_CLIENT = None
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

# --- Scraping principal ---
from newspaper import Article
from newspaper.article import ArticleDownloadState

# --------------------------------------------------------------------
# Configuración base
# --------------------------------------------------------------------
load_dotenv()

app = Flask(__name__, static_url_path='', static_folder='static')

# Claves
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_CX = os.getenv("GOOGLE_SEARCH_CX")

if OPENAI_API_KEY and OpenAI is not None:
    try:
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ IA (OpenAI): Cliente activo")
    except Exception as e:
        print(f"⚠️ ERROR: No se pudo iniciar el cliente OpenAI: {e}")

# Caché simple en memoria para resultados de scrape
SCRAPE_CACHE = {}
CACHE_DURATION = 60 * 60 * 24  # 24 horas


# --------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------
def clean_pexels_query(query: str) -> str:
    stop_words = set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'by', 'of', 'in',
        'on', 'at', 'for', 'with', 'and', 'but', 'or', 'so', 'if', 'it',
        'to', 'from', 'about', 'as', 'that', 'this', 'told', 'says'
    ])
    clean_query = re.sub(r'[^\w\s]', '', query or '').lower()
    words = [w for w in clean_query.split() if w not in stop_words]
    return " ".join(words[:5])


def get_pexels_images(query: str, count: int = 3):
    if not PEXELS_API_KEY:
        return []
    search_query = clean_pexels_query(query)
    if not search_query:
        return []
    try:
        headers = {'Authorization': PEXELS_API_KEY}
        url = f'https://api.pexels.com/v1/search?query={quote_plus(search_query)}&per_page={count}&orientation=portrait'
        r = requests.get(url, headers=headers, timeout=8)
        if r.status_code == 200 and r.headers.get('content-type', '').startswith('application/json'):
            data = r.json()
            return [p['src']['large2x'] for p in data.get('photos', [])]
        return []
    except Exception:
        return []


def get_ai_data(title: str, text: str, source: str):
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        return None, "Faltan credenciales OpenAI"
    try:
        run = OPENAI_CLIENT.beta.threads.create_and_run_poll(
            assistant_id=OPENAI_ASSISTANT_ID,
            thread={
                "messages": [
                    {
                        "role": "user",
                        "content": f"TITLE: {title}\nSOURCE: {source}\nTEXT: {text[:3000]}"
                    }
                ]
            },
            poll_interval_ms=2000,
            timeout=40
        )
        if run.status == 'completed':
            msgs = OPENAI_CLIENT.beta.threads.messages.list(thread_id=run.thread_id)
            # Se espera que el asistente devuelva JSON válido en el primer mensaje
            try:
                payload = json.loads(msgs.data[0].content[0].text.value)
                return payload, None
            except Exception as e:
                return None, f"AI JSON parse error: {e}"
        else:
            return None, f"Estado IA no completado: {run.status}"
    except Exception as e:
        return None, str(e)


def infer_search_info(url: str):
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
        refined_keywords = " ".join([w for w in refined_keywords.split() if not w.isdigit()])
        return domain, year, refined_keywords
    except Exception:
        return "", "", ""


def perform_google_search(query: str, max_results: int = 5):
    if not GOOGLE_SEARCH_API_KEY or not GOOGLE_SEARCH_CX:
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
        if r.headers.get('Content-Type', '').startswith('application/json'):
            data = r.json()
        else:
            return perform_ddg_search_fallback(query, max_results)

        results = []
        for item in data.get('items', []):
            results.append({
                'title': item.get('title', 'No Title'),
                'url': item.get('link', '#'),
                'snippet': item.get('snippet', '')
            })
        return results
    except Exception:
        return perform_ddg_search_fallback(query, max_results)


def perform_ddg_search_fallback(query: str, max_results: int = 5):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://html.duckduckgo.com/'
        }
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        res = requests.get(url, headers=headers, timeout=8)
        if res.status_code != 200:
            return []
        soup = BeautifulSoup(res.text, 'html.parser')
        results = []
        for result in soup.select('.result'):
            link_tag = result.select_one('.result__a')
            snippet_tag = result.select_one('.result__snippet')
            if link_tag and link_tag.get('href'):
                url_res = link_tag['href']
                if url_res.startswith('/l/?'):
                    try:
                        url_res = parse_qs(urlparse(url_res).query)['uddg'][0]
                    except Exception:
                        pass
                if url_res.startswith('http'):
                    results.append({
                        'title': link_tag.get_text(strip=True),
                        'url': url_res,
                        'snippet': snippet_tag.get_text(strip=True) if snippet_tag else ""
                    })
                    if len(results) >= max_results:
                        break
        return results
    except Exception:
        return []


def domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc.replace('www.', '')
    except Exception:
        return ""


# --------------------------------------------------------------------
# Rutas
# --------------------------------------------------------------------
@app.route('/')
def home():
    return app.send_static_file('index.html')


@app.route('/api/initial_images', methods=['GET'])
def initial_images():
    # Consulta base
    images = get_pexels_images('technology AI', count=5)

    # Fallbacks por si Pexels falla
    fallback_imgs = [
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080",
        "https://images.unsplash.com/photo-1555212697-c20e29b10636?q=80&w=1080",
        "https://images.unsplash.com/photo-1511376770913-2d2f1f510793?q=80&w=1080"
    ]

    unique = []
    seen = set()
    for img in images:
        if img not in seen:
            unique.append(img)
            seen.add(img)
    for img in fallback_imgs:
        if len(unique) >= 3:
            break
        if img not in seen:
            unique.append(img)
            seen.add(img)

    default_img = "https://images.unsplash.com/photo-1517430488-b4c480a45719?w=1080"
    img_a = unique[0] if len(unique) >= 1 else default_img
    img_b = unique[1] if len(unique) >= 2 else default_img
    img_c = unique[2] if len(unique) >= 3 else default_img

    return jsonify({"A": img_a, "B": img_b, "C": img_c})


@app.route('/api/search_alternatives', methods=['POST'])
def search_alternatives():
    payload = request.get_json(silent=True) or {}
    failed_url = payload.get('url')
    if not failed_url:
        return jsonify({"error": "No URL provided"}), 400

    domain, year, keywords = infer_search_info(failed_url)

    if len(keywords.split()) < 3:
        query = f"{domain} news".strip()
        return jsonify({'query': query, 'results': perform_google_search(query)})

    query1 = f"{keywords} {year}".strip()
    results = perform_google_search(query1, max_results=6)

    if not results:
        query2 = f"{domain} {keywords}".strip()
        results = perform_google_search(query2, max_results=6)
        return jsonify({'query': query2, 'results': results})

    return jsonify({'query': query1, 'results': results})


@app.route('/api/scrape', methods=['POST'])
def scrape():
    payload = request.get_json(silent=True) or {}
    url = payload.get('url', '').strip()
    if not url:
        return jsonify({'error': 'Missing url'}), 400

    # Caché
    now = time.time()
    if url in SCRAPE_CACHE:
        cached = SCRAPE_CACHE[url]
        if now - cached['ts'] < CACHE_DURATION:
            return jsonify(cached['data'])

    # Newspaper3k
    try:
        art = Article(url)
        art.download()
        if art.download_state != ArticleDownloadState.SUCCESS:
            raise RuntimeError("download failed")
        art.parse()
        try:
            art.nlp()
        except Exception:
            # NLP puede fallar a veces, no es crítico
            pass

        title = art.title or ''
        text = art.text or ''
        source = domain_of(url) or 'UNKNOWN'
        original = {
            "title": title.strip() or 'UNTITLED',
            "subtitle": (text[:200] + '...') if text else ''
        }

        # Imágenes relacionadas
        # preferimos keywords del título, si no, el dominio
        keys = title if title else source
        imgs = get_pexels_images(keys, count=3)
        # fallback si Pexels no dio 3
        while len(imgs) < 3:
            imgs.append("https://images.unsplash.com/photo-1517430488-b4c480a45719?w=1080")

        images = {"a": imgs[0], "b": imgs[1], "c": imgs[2]}

        # IA para variantes y caption común
        ai_payload, ai_err = get_ai_data(title=original["title"], text=text, source=source)
        result = {
            "source": source.upper() if source else "UNKNOWN",
            "original": original,
            "images": images,
            "ai_content": ai_payload if ai_payload else {
                "variants": {
                    "A": {"title": original["title"], "subtitle": original["subtitle"]},
                    "B": {"title": original["title"], "subtitle": original["subtitle"]},
                    "C": {"title": original["title"], "subtitle": original["subtitle"]},
                },
                "common_caption": original["subtitle"],
                "image_keywords": clean_pexels_query(keys)
            },
            "ai_error": ai_err
        }

        SCRAPE_CACHE[url] = {"ts": now, "data": result}
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': f'scrape failed: {str(e)}'}), 500


@app.route('/api/proxy_image', methods=['GET'])
def proxy_image():
    img_url = request.args.get('url', '').strip()
    if not img_url:
        return jsonify({'error': 'Missing url'}), 400
    try:
        r = requests.get(img_url, timeout=10, stream=True)
        r.raise_for_status()
        content_type = r.headers.get('Content-Type', 'image/jpeg')
        headers = {
            'Content-Type': content_type,
            'Cache-Control': 'public, max-age=300',
        }
        # Stream del cuerpo en chunks para no cargar todo en memoria
        def generate():
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        return Response(generate(), headers=headers)
    except Exception as e:
        return jsonify({'error': f'proxy failed: {str(e)}'}), 502


# --------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------
if __name__ == '__main__':
    # Para desarrollo local; en producción usa gunicorn
    port = int(os.getenv("PORT", "5000"))
    app.run(host='0.0.0.0', port=port, debug=True)

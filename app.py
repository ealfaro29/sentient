import os
import json
import re
import time
from urllib.parse import urlparse, quote_plus, parse_qs

import requests  # Importación clave
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response
from flask_cors import CORS # <-- IMPORTACIÓN NUEVA

# --- IA / OpenAI ---
OPENAI_CLIENT = None
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

# --- Scraping principal ---
from newspaper import Article
# 'ArticleDownloadState' ya no es necesario porque usamos requests
# from newspaper.article import ArticleDownloadState

# --------------------------------------------------------------------
# Configuración base
# --------------------------------------------------------------------
load_dotenv()

app = Flask(__name__, static_url_path='', static_folder='static')
CORS(app) # <-- INICIALIZACIÓN DE CORS (ARREGLA 'Failed to fetch')

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

# --- Headers de Navegador (El "Disfraz") ---
# Usaremos esto tanto para el Scrape como para el Proxy de Imágenes
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
}

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


def get_pexels_images(query: str, count: int = 4): # <-- Solicitamos 4 (como fallback)
    if not PEXELS_API_KEY:
        return []
    search_query = clean_pexels_query(query)
    if not search_query:
        return []
    try:
        # Pexels no necesita 'User-Agent' si se usa API key, pero es buena práctica
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
        # Prompt actualizado para pedir keywords
        prompt_content = f"""
        Article data:
        TITLE: {title}
        SOURCE: {source}
        TEXT: {text[:3000]}
        
        Task:
        Return a JSON object with three keys:
        1. "variants": An object with 3 variations (A, B, C) for social media posts.
        2. "common_caption": A general, engaging caption for the post.
        3. "image_keywords": A JSON list of 3-5 specific, relevant keywords from the text for searching stock photos (e.g., ["solar storm", "aurora", "sun"]).
        """

        run = OPENAI_CLIENT.beta.threads.create_and_run_poll(
            assistant_id=OPENAI_ASSISTANT_ID,
            thread={
                "messages": [
                    {
                        "role": "user",
                        "content": prompt_content
                    }
                ]
            },
            poll_interval_ms=2000,
            timeout=40
        )
        if run.status == 'completed':
            msgs = OPENAI_CLIENT.beta.threads.messages.list(thread_id=run.thread_id)
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
    # Consulta base (pedimos 4 imágenes)
    images = get_pexels_images('technology AI', count=4)

    # Fallbacks por si Pexels falla
    fallback_imgs = [
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080",
        "https://images.unsplash.com/photo-1555212697-c20e29b10636?q=80&w=1080",
        "https://images.unsplash.com/photo-1511376770913-2d2f1f510793?q=80&w=1080",
        "https://images.unsplash.com/photo-1550745165-9bc0b252726c?w=1080"
    ]

    unique = []
    seen = set()
    for img in images:
        if img not in seen:
            unique.append(img)
            seen.add(img)
    for img in fallback_imgs:
        if len(unique) >= 4:
            break
        if img not in seen:
            unique.append(img)
            seen.add(img)

    default_img = "https://images.unsplash.com/photo-1517430488-b4c480a45719?w=1080"
    img_a = unique[0] if len(unique) >= 1 else default_img
    img_b = unique[1] if len(unique) >= 2 else default_img
    img_c = unique[2] if len(unique) >= 3 else default_img
    img_d = unique[3] if len(unique) >= 4 else default_img 

    return jsonify({"A": img_a, "B": img_b, "C": img_c, "D": img_d}) # <-- Enviar 4 imágenes


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

    try:
        # ===== INICIO DEL SCRAPE ROBUSTO (ARREGLA EL "SINSENTIDO") =====
        
        # 1. Usar 'requests' para descargar el HTML con headers de navegador
        response = requests.get(url, headers=BROWSER_HEADERS, timeout=10)
        response.raise_for_status() # Lanza error si es 4xx o 5xx
        html_content = response.text
        
        if not html_content:
            raise RuntimeError("Downloaded HTML is empty")

        # 2. Inicializar Article y pasarle el HTML
        art = Article(url)
        art.set_html(html_content)
        art.parse()

        # 3. Correr NLP para obtener el resumen (summary)
        summary = ""
        try:
            art.nlp()
            summary = art.summary or '' # Capturamos el resumen
        except Exception:
            pass
        
        # 4. CAPTURAR IMAGEN PRINCIPAL (PARA CARD A)
        top_image = art.top_image or None
        
        # ===== FIN DEL SCRAPE ROBUSTO =====

        title = art.title or ''
        text = art.text or ''
        source = domain_of(url) or 'UNKNOWN'
        
        # --- LÓGICA DE FALLBACK (SIMPLIFICADA) ---
        original_title = title.strip() or 'UNTITLED'
        original_subtitle = (text[:200] + '...') if text else ''
        fallback_variant = {"title": original_title, "subtitle": original_subtitle}

        # --- LÓGICA DE LA CARD D "NERD" (GARANTIZADA) ---
        nerd_title = original_title 
        nerd_subtitle = summary if summary else "A detailed breakdown of the key facts and implications."
        nerd_variant = {"title": nerd_title, "subtitle": nerd_subtitle}

        # --- IA PARA VARIANTES Y KEYWORDS DE IMÁGENES ---
        ai_payload, ai_err = get_ai_data(title=original_title, text=text, source=source)
        
        # --- LÓGICA DE KEYWORDS DE IMAGEN (NUEVO) ---
        search_query = ""
        if ai_payload and 'image_keywords' in ai_payload:
            keywords = ai_payload.get('image_keywords', [])
            if isinstance(keywords, list) and len(keywords) > 0:
                search_query = " ".join(keywords)
        
        if not search_query:
            search_query = clean_pexels_query(original_title)

        # --- LÓGICA DE IMÁGENES (NUEVO) ---
        
        num_pexels_needed = 3 if top_image else 4
        imgs = get_pexels_images(search_query, count=num_pexels_needed)
        
        default_img = "https://images.unsplash.com/photo-1517430488-b4c480a45719?w=1080"
        while len(imgs) < num_pexels_needed:
            imgs.append(default_img)

        images = {}
        if top_image:
            images["a"] = top_image
            images["b"] = imgs[0]
            images["c"] = imgs[1]
            images["d"] = imgs[2]
        else:
            images["a"] = imgs[0]
            images["b"] = imgs[1]
            images["c"] = imgs[2]
            images["d"] = imgs[3]
        
        # --- LÓGICA DE PAYLOAD FINAL (ROBUSTA) ---
        
        if ai_payload and 'variants' in ai_payload:
            variants = ai_payload.get('variants', {})
            common_caption = ai_payload.get('common_caption', original_subtitle)
            
            final_variants = {
                'A': variants.get('A', fallback_variant),
                'B': variants.get('B', fallback_variant),
                'C': variants.get('C', fallback_variant),
                'D': nerd_variant 
            }
            
            final_payload = {
                "variants": final_variants,
                "common_caption": common_caption,
                "image_keywords": search_query.split() 
            }
            
        else:
            # AI falló. Construimos todo desde cero.
            final_payload = {
                "variants": {
                    "A": fallback_variant,
                    "B": fallback_variant,
                    "C": fallback_variant,
                    "D": nerd_variant, 
                },
                "common_caption": original_subtitle,
                "image_keywords": search_query.split()
            }
        
        result = {
            "source": source.upper() if source else "UNKNOWN",
            "original": {"title": original_title, "subtitle": original_subtitle},
            "images": images,
            "ai_content": final_payload, 
            "ai_error": ai_err
        }

        SCRAPE_CACHE[url] = {"ts": now, "data": result}
        return jsonify(result)

    except requests.exceptions.RequestException as e:
        # Captura errores de 'requests' (timeout, 403, 404, etc.)
        return jsonify({'error': f'Scrape failed (Request Error): {str(e)}'}), 500
    except Exception as e:
        # Captura errores de newspaper3k (parse, nlp) u otros
        return jsonify({'error': f'Scrape failed (Parse Error): {str(e)}'}), 500


@app.route('/api/proxy_image', methods=['GET'])
def proxy_image():
    img_url = request.args.get('url', '').strip()
    if not img_url:
        return jsonify({'error': 'Missing url'}), 400
    try:
        # ===== INICIO DE LA CORRECCIÓN DEL PROXY (ERROR 502) =====
        # Usamos los mismos headers de navegador para el proxy
        r = requests.get(img_url, headers=BROWSER_HEADERS, timeout=10, stream=True)
        r.raise_for_status()
        # ===== FIN DE LA CORRECCIÓN DEL PROXY =====

        content_type = r.headers.get('Content-Type', 'image/jpeg')
        headers = {
            'Content-Type': content_type,
            'Cache-Control': 'public, max-age=300',
        }
        
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
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
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleAuthRequest
OPENAI_CLIENT = None
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

# --- Scraping principal ---
from newspaper import Article
# ArticleDownloadState ya no es necesario al usar scrape.do

# --------------------------------------------------------------------
# Configuración base
# --------------------------------------------------------------------
load_dotenv()

app = Flask(__name__, static_url_path='', static_folder='static')

# Claves
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY") # Clave de Pexels (NECESARIA)
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_CX = os.getenv("GOOGLE_SEARCH_CX")
SCRAPE_DO_KEY = os.getenv("SCRAPE_DO_KEY")  # Clave de Scrape.do

# --- CONFIGURACIÓN DE GOOGLE LIMPIA ---
SERVICE_ACCOUNT_FILE = 'service-account-key.json' 

if OPENAI_API_KEY and OpenAI is not None:
    try:
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ IA (OpenAI): Cliente activo")
    except Exception as e:
        print(f"⚠️ ERROR: No se pudo iniciar el cliente OpenAI: {e}")

# Caché simple en memoria para resultados de scrape
SCRAPE_CACHE = {}
CACHE_DURATION = 60 * 60 * 24  # 24 horas

# Headers para simular navegador (Usado en proxy de imágenes)
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Referer': 'https://www.google.com/',
    'Accept-Language': 'en-US,en;q=0.9',
}

# --------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------

# --- FUNCIONES DE PEXELS (RESTAURADAS) ---
def clean_pexels_query(query: str) -> str:
    stop_words = set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'by', 'of', 'in',
        'on', 'at', 'for', 'with', 'and', 'but', 'or', 'so', 'if', 'it',
        'to', 'from', 'about', 'as', 'that', 'this', 'told', 'says'
    ])
    clean_query = re.sub(r'[^\w\s]', '', query or '').lower()
    words = [w for w in clean_query.split() if w not in stop_words]
    return " ".join(words[:5])


def get_pexels_images(query: str, count: int = 4):
    if not PEXELS_API_KEY:
        return []
    search_query = clean_pexels_query(query)
    if not search_query:
        return []
    try:
        headers = {'Authorization': PEXELS_API_KEY}
        # Uso de la API de Pexels
        url = f'https://api.pexels.com/v1/search?query={quote_plus(search_query)}&per_page={count}&orientation=portrait'
        r = requests.get(url, headers=headers, timeout=8)
        if r.status_code == 200 and r.headers.get('content-type', '').startswith('application/json'):
            data = r.json()
            # Extraemos la URL 'large2x' de Pexels
            return [p['src']['large2x'] for p in data.get('photos', [])]
        return []
    except Exception:
        return []

# Funciones generate_detailed_image_prompt y generate_gemini_image han sido ELIMINADAS.

def get_ai_data(title: str = None, text: str = None, source: str = None, keywords: str = None):
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        return None, "Faltan credenciales OpenAI"
    
    try:
        if keywords:
            # --- NUEVO PROMPT DE FALLBACK (BASADO EN KEYWORDS) ---
            prompt_content = f"""
            Context: The original article scrape failed.
            Keywords from URL: {keywords}
            SOURCE: {source or 'Unknown'}
            
            Task:
            Generate content based *only* on the keywords.
            Return a JSON object with three keys:
            1. "variants": An object with 4 variations (A, B, C, D) for social media posts.
               - A: Standard News
               - B: Storytelling
               - C: Breaking News
               - D: Nerd / Technical / Deep Dive
            2. "common_caption": A general, engaging caption for the post.
            3. "image_keywords": A JSON list of 3-5 specific, relevant keywords from the context (e.g., ["solar storm", "aurora", "sun"]).
            """
        else:
            # --- PROMPT ORIGINAL (BASADO EN ARTÍCULO) ---
            prompt_content = f"""
            Article data:
            TITLE: {title}
            SOURCE: {source}
            TEXT: {text[:3000]}
            
            Task:
            Return a JSON object with three keys:
            1. "variants": An object with 4 variations (A, B, C, D) for social media posts.
               - A: Standard News
               - B: Storytelling
               - C: Breaking News
               - D: Nerd / Technical / Deep Dive (Focus on specs, numbers, analysis)
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
                # Limpiar el JSON de posibles bloques de código
                text_response = msgs.data[0].content[0].text.value
                json_match = re.search(r'```json\s*([\s\S]+?)\s*```', text_response)
                if json_match:
                    payload_str = json_match.group(1)
                else:
                    payload_str = text_response
                
                payload = json.loads(payload_str)
                return payload, None
            except Exception as e:
                return None, f"AI JSON parse error: {e} | Response was: {msgs.data[0].content[0].text.value[:200]}"
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
        # Fallback de DDG eliminado
        return []
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
        if not r.headers.get('Content-Type', '').startswith('application/json'):
             return []

        data = r.json()
        results = []
        for item in data.get('items', []):
            results.append({
                'title': item.get('title', 'No Title'),
                'url': item.get('link', '#'),
                'snippet': item.get('snippet', '')
            })
        return results
    except Exception:
         return []

# --- perform_ddg_search_fallback ELIMINADO ---


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


# --- /api/initial_images ELIMINADO ---


# --- /api/search_image (RESTAURADO) ---
@app.route('/api/search_image', methods=['POST'])
def search_image():
    """Endpoint para buscar una imagen en Pexels y devolver una lista de URLs."""
    payload = request.get_json(silent=True) or {}
    query = payload.get('query', '').strip()
    count = payload.get('count', 1) # Permitir al cliente especificar el conteo
    if not query:
        return jsonify({'error': 'Missing query'}), 400

    # Obtenemos el número de imágenes solicitado
    images = get_pexels_images(query, count=count)
    
    # Devolvemos la lista de URLs
    return jsonify({'imageUrls': images}), 200


# --- RUTAS DE GENERACIÓN DE IMAGEN Y PROMPT ELIMINADAS: /api/generate_prompt y /api/generate_image ---


# --- /api/search_alternatives ELIMINADO ---


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
        #   if now - cached['ts'] < CACHE_DURATION:
        print("✅ [MODO TEST] Devolviendo resultado desde caché.")
        return jsonify(cached['data'])

    try:
        # ===== INTEGRACIÓN SCRAPE.DO (ÚNICA OPCIÓN) =====
        if not SCRAPE_DO_KEY:
             raise RuntimeError("Scrape.do API key (SCRAPE_DO_KEY) is not configured.")

        target_url_encoded = quote_plus(url)
        scrape_do_url = f"http://api.scrape.do/?token={SCRAPE_DO_KEY}&url={target_url_encoded}"
        
        response = requests.get(scrape_do_url, timeout=60)
        
        if not response.ok:
            raise RuntimeError(f"Scrape.do failed: {response.status_code} - {response.text[:200]}")
        
        html_content = response.text

        if not html_content:
            raise RuntimeError("Downloaded HTML is empty")

        # Pasamos el HTML limpio a newspaper3k
        art = Article(url)
        art.set_html(html_content)
        art.parse()

        # NLP para resumen
        try:
            art.nlp()
        except Exception:
            pass

        title = art.title or ''
        text = art.text or ''
        source = domain_of(url) or 'UNKNOWN'
        # Imagen principal del artículo
        top_image = art.top_image 

        # Datos originales base
        original = {
            "title": title.strip() or 'UNTITLED',
            "subtitle": (text[:200] + '...') if text else ''
        }
        
        # Resumen para Card D (Nerd) en caso de fallback
        summary = art.summary if art.summary else original["subtitle"]

        # --- IA CALL ---
        ai_payload, ai_err = get_ai_data(title=original["title"], text=text, source=source)
        
        # --- KEYWORDS DE IMAGEN ---
        search_query = ""
        if ai_payload and 'image_keywords' in ai_payload:
            keywords = ai_payload.get('image_keywords', [])
            if isinstance(keywords, list) and len(keywords) > 0:
                search_query = " ".join(keywords)
        
        if not search_query and original["title"] != 'UNTITLED':
            # Si la IA falla en keywords, usamos el título (limpieza simple)
            search_query = re.sub(r'[^\w\s]', '', original["title"] or '').lower()


        # --- OBTENCIÓN DE IMÁGENES ---
        images = {}
        if top_image:
            images["a"] = top_image
        
        # --- CONSTRUCCIÓN DEL CONTENIDO FINAL ---
        fallback_variant_d = {
            "title": f"[Analysis] {original['title']}", 
            "subtitle": summary
        }
        fallback_variant_std = {
            "title": original["title"], 
            "subtitle": original["subtitle"]
        }

        final_variants = {}
        common_caption = original["subtitle"]

        if ai_payload and 'variants' in ai_payload:
            ai_vars = ai_payload.get('variants', {})
            final_variants['A'] = ai_vars.get('A', fallback_variant_std)
            final_variants['B'] = ai_vars.get('B', fallback_variant_std)
            final_variants['C'] = ai_vars.get('C', fallback_variant_std)
            final_variants['D'] = ai_vars.get('D', fallback_variant_d)
            common_caption = ai_payload.get('common_caption', common_caption)
        else:
            # Fallback total si falla IA
            final_variants = {
                'A': fallback_variant_std,
                'B': fallback_variant_std,
                'C': fallback_variant_std,
                'D': fallback_variant_d
            }

        # Estructura final de respuesta
        result = {
            "source": source.upper() if source else "UNKNOWN",
            "original": original,
            "images": images, # Solo contiene 'a' si se encontró top_image
            "ai_content": {
                "variants": final_variants,
                "common_caption": common_caption,
                "image_keywords": ai_payload.get('image_keywords', search_query.split()) if ai_payload else search_query.split()
            },
            "ai_error": ai_err
        }

        SCRAPE_CACHE[url] = {"ts": now, "data": result}
        return jsonify(result)

    except Exception as e:
        # --- ¡NUEVO FLUJO DE FALLBACK! ---
        print(f'Scrape failed: {str(e)}')
        
        domain, year, keywords = infer_search_info(url)
        fallback_query = f"{domain} {keywords} {year}".strip()
        source = domain_of(url) or 'UNKNOWN'

        # Llamar a IA solo con keywords
        ai_payload, ai_err = get_ai_data(source=source, keywords=fallback_query)

        if not ai_payload:
            # Si la IA también falla, devolver un error definitivo
            return jsonify({'error': f'Scrape failed and AI fallback failed: {ai_err}'}), 500

        # Construir una respuesta de fallback
        fallback_title = " ".join(keywords.split()[:5])
        fallback_subtitle = ai_payload.get('common_caption', 'Could not scrape article.')

        result = {
            "source": source.upper(),
            "original": { "title": fallback_title, "subtitle": fallback_subtitle },
            "images": {"a": ""}, # Sin top_image
            "ai_content": {
                "variants": ai_payload.get('variants', {}),
                "common_caption": ai_payload.get('common_caption', fallback_subtitle),
                "image_keywords": ai_payload.get('image_keywords', fallback_query.split())
            },
            "ai_error": ai_err # Podría ser None si la IA funcionó
        }
        # No guardar en caché los fallos
        return jsonify(result)


@app.route('/api/proxy_image', methods=['GET'])
def proxy_image():
    # Esta ruta se usa para cargar imágenes de forma confiable.
    img_url = request.args.get('url', '').strip()
    if not img_url:
        return jsonify({'error': 'Missing url'}), 400
    try:
        # Usamos headers de navegador para evitar bloqueos en imágenes (403/502)
        r = requests.get(img_url, headers=BROWSER_HEADERS, timeout=15, stream=True)
        r.raise_for_status()
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
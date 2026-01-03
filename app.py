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

# --- Caché Persistente ---
CACHE_FILE = 'scrape_cache.json'
try:
    with open(CACHE_FILE, 'r') as f:
        SCRAPE_CACHE = json.load(f)
    print(f"✅ Caché persistente cargada desde {CACHE_FILE}")
except (FileNotFoundError, json.JSONDecodeError):
    SCRAPE_CACHE = {}
    print("⚠️ No se encontró caché persistente, iniciando vacía.")

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
        url = f'https://api.pexels.com/v1/search?query={quote_plus(search_query)}&per_page={count}&orientation=portrait'
        r = requests.get(url, headers=headers, timeout=8)
        if r.status_code == 200 and r.headers.get('content-type', '').startswith('application/json'):
            data = r.json()
            return [p['src']['large2x'] for p in data.get('photos', [])]
        return []
    except Exception:
        return []


def get_ai_data(title: str = None, text: str = None, source: str = None, keywords: str = None):
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        return None, "Faltan credenciales OpenAI"
    
    try:
        if keywords:
            # --- PROMPT DE FALLBACK (BASADO EN KEYWORDS) ---
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


def get_carousel_data(title: str, text: str, source: str):
    """
    Generate carousel content with multiple options: 2, 3, 4, and 5 slides.
    AI recommends the best option based on article content.
    Each slide has a short title, a sentence, and image keywords.
    Plus a longer caption for the text card.
    """
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        return None, "Faltan credenciales OpenAI"
    
    try:
        prompt_content = f"""
        Article data:
        TITLE: {title}
        SOURCE: {source}
        TEXT: {text[:4000]}
        
        Task:
        Analyze this article and extract the 5 most important and interesting main ideas.
        For each idea, create a carousel slide with:
        1. A short, punchy TITLE (3-8 words max, attention-grabbing)
        2. A SENTENCE that expands on the title (10-20 words, clear and engaging)
        3. IMAGE_KEYWORDS: 2-4 specific keywords for finding a relevant stock photo on Pexels
        
        Also:
        - Create a CAPTION: A longer, engaging caption (100-200 characters) for an Instagram post.
        - RECOMMEND the ideal number of slides (2, 3, 4, or 5) based on:
          * Article complexity and depth
          * Number of distinct key points
          * Audience engagement potential
          * Content richness
        
        Return a JSON object with this structure:
        {{
            "recommended_slides": 3,  // Your recommendation: 2, 3, 4, or 5
            "recommendation_reason": "Brief reason for your choice",
            "slides": [
                {{
                    "title": "Short Punchy Title",
                    "sentence": "Engaging sentence that expands the title.",
                    "image_keywords": ["keyword1", "keyword2", "keyword3"]
                }},
                ... (always provide exactly 5 slides, frontend will use subset based on selection)
            ],
            "caption": "Longer engaging caption for the post..."
        }}
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
            timeout=50
        )
        
        if run.status == 'completed':
            msgs = OPENAI_CLIENT.beta.threads.messages.list(thread_id=run.thread_id)
            try:
                text_response = msgs.data[0].content[0].text.value
                json_match = re.search(r'```json\s*([\s\S]+?)\s*```', text_response)
                if json_match:
                    payload_str = json_match.group(1)
                else:
                    payload_str = text_response
                
                payload = json.loads(payload_str)
                
                # Ensure recommended_slides has a default
                if 'recommended_slides' not in payload:
                    payload['recommended_slides'] = min(len(payload.get('slides', [])), 5)
                if 'recommendation_reason' not in payload:
                    payload['recommendation_reason'] = 'Based on article content analysis'
                    
                return payload, None
            except Exception as e:
                return None, f"Carousel AI JSON parse error: {e} | Response was: {text_response[:200]}"
        else:
            return None, f"Carousel AI no completado: {run.status}"
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


@app.route('/api/search_image', methods=['POST'])
def search_image():
    payload = request.get_json(silent=True) or {}
    query = payload.get('query', '').strip()
    count = payload.get('count', 1) 
    if not query:
        return jsonify({'error': 'Missing query'}), 400

    images = get_pexels_images(query, count=count)
    return jsonify({'imageUrls': images}), 200


@app.route('/api/generate_carousel', methods=['POST'])
def generate_carousel():
    """
    Generate carousel slides from article content.
    Expects: { "title": "...", "text": "...", "source": "..." }
    Returns: { "slides": [...], "caption": "...", "error": null }
    """
    payload = request.get_json(silent=True) or {}
    title = payload.get('title', '').strip()
    text = payload.get('text', '').strip()
    source = payload.get('source', '').strip()
    
    if not title or not text:
        return jsonify({'error': 'Missing title or text'}), 400
    
    # Generate carousel data via AI
    carousel_data, carousel_err = get_carousel_data(title, text, source)
    
    if carousel_err or not carousel_data:
        return jsonify({'error': carousel_err or 'Failed to generate carousel'}), 500
    
    # Get slides from carousel data
    slides = carousel_data.get('slides', [])
    caption = carousel_data.get('caption', '')
    
    # Fetch images for each slide using Pexels
    for slide in slides:
        keywords = slide.get('image_keywords', [])
        if keywords:
            query = ' '.join(keywords)
            images = get_pexels_images(query, count=1)
            slide['image'] = images[0] if images else ''
        else:
            slide['image'] = ''
    
    return jsonify({
        'slides': slides,
        'caption': caption,
        'error': None
    }), 200


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
        # (Modo Test: Comentar la línea 'if' para forzar el caché)
        if now - cached['ts'] < CACHE_DURATION: 
            print("✅ Devolviendo resultado desde caché.")
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

        art = Article(url)
        art.set_html(html_content)
        art.parse()

        try:
            art.nlp()
        except Exception:
            pass

        title = art.title or ''
        text = art.text or ''
        source = domain_of(url) or 'UNKNOWN'
        top_image = art.top_image 

        original = {
            "title": title.strip() or 'UNTITLED',
            "subtitle": (text[:200] + '...') if text else ''
        }
        
        summary = art.summary if art.summary else original["subtitle"]

        ai_payload, ai_err = get_ai_data(title=original["title"], text=text, source=source)
        
        search_query = ""
        if ai_payload and 'image_keywords' in ai_payload:
            keywords = ai_payload.get('image_keywords', [])
            if isinstance(keywords, list) and len(keywords) > 0:
                search_query = " ".join(keywords)
        
        if not search_query and original["title"] != 'UNTITLED':
            search_query = re.sub(r'[^\w\s]', '', original["title"] or '').lower()

        images = {}
        if top_image:
            images["a"] = top_image
        
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
            final_variants = {
                'A': fallback_variant_std,
                'B': fallback_variant_std,
                'C': fallback_variant_std,
                'D': fallback_variant_d
            }

        # Generate carousel data upfront
        carousel_data = None
        carousel_slides = []
        carousel_caption = common_caption
        
        if text and title:
            print("🎨 Generating carousel data...")
            carousel_payload, carousel_err = get_carousel_data(title, text, source)
            
            if carousel_payload and not carousel_err:
                carousel_data = carousel_payload
                carousel_slides = carousel_payload.get('slides', [])
                carousel_caption = carousel_payload.get('caption', common_caption)
                
                # Fetch images for each carousel slide
                for slide in carousel_slides:
                    keywords = slide.get('image_keywords', [])
                    if keywords:
                        query = ' '.join(keywords)
                        images_result = get_pexels_images(query, count=1)
                        slide['image'] = images_result[0] if images_result else ''
                    else:
                        slide['image'] = ''
                
                print(f"✅ Generated {len(carousel_slides)} carousel slides")
            else:
                print(f"⚠️ Carousel generation failed: {carousel_err}")
        
        result = {
            "source": source.upper() if source else "UNKNOWN",
            "original": original,
            "full_text": text,  # Include full text for carousel generation
            "images": images, 
            "ai_content": {
                "variants": final_variants,
                "common_caption": carousel_caption,  # Use carousel caption if available
                "image_keywords": ai_payload.get('image_keywords', search_query.split()) if ai_payload else search_query.split()
            },
            "carousel": {
                "slides": carousel_slides,
                "caption": carousel_caption
            },
            "ai_error": ai_err
        }

        SCRAPE_CACHE[url] = {"ts": now, "data": result}
        
        # Guardar en caché persistente
        try:
            with open(CACHE_FILE, 'w') as f:
                json.dump(SCRAPE_CACHE, f, indent=2)
            print(f"✅ Caché persistente guardada en {CACHE_FILE}")
        except Exception as e:
            print(f"⚠️ Error al guardar caché en disco: {e}")
            
        return jsonify(result)

    except Exception as e:
        # --- FLUJO DE FALLBACK (IA con Keywords) ---
        print(f'Scrape failed: {str(e)}')
        
        domain, year, keywords = infer_search_info(url)
        fallback_query = f"{domain} {keywords} {year}".strip()
        source = domain_of(url) or 'UNKNOWN'

        ai_payload, ai_err = get_ai_data(source=source, keywords=fallback_query)

        if not ai_payload:
            return jsonify({'error': f'Scrape failed and AI fallback failed: {ai_err}'}), 500

        fallback_title = " ".join(keywords.split()[:5])
        fallback_subtitle = ai_payload.get('common_caption', 'Could not scrape article.')

        result = {
            "source": source.upper(),
            "original": { "title": fallback_title, "subtitle": fallback_subtitle },
            "images": {"a": ""}, 
            "ai_content": {
                "variants": ai_payload.get('variants', {}),
                "common_caption": ai_payload.get('common_caption', fallback_subtitle),
                "image_keywords": ai_payload.get('image_keywords', fallback_query.split())
            },
            "ai_error": ai_err 
        }
        return jsonify(result)


@app.route('/api/proxy_image', methods=['GET'])
def proxy_image():
    img_url = request.args.get('url', '').strip()
    if not img_url:
        return jsonify({'error': 'Missing url'}), 400
    try:
        r = requests.get(img_url, headers=BROWSER_HEADERS, timeout=15, stream=True)
        r.raise_for_status()
        content_type = r.headers.get('Content-Type', 'image/jpeg')
        
        # === INICIO DE LA MODIFICACIÓN ===
        headers = {
            'Content-Type': content_type,
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*'  # Permite el acceso de origen cruzado
        }
        # === FIN DE LA MODIFICACIÓN ===
        
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
    port = int(os.getenv("PORT", "5000"))
    app.run(host='0.0.0.0', port=port, debug=True)
import os
import json
import re
import time
from urllib.parse import urlparse, quote_plus, parse_qs

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response

# --- NUEVAS IMPORTACIONES DE AUTENTICACIÓN DE GOOGLE ---
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleAuthRequest

# --- IA / OpenAI ---
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
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY") 
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_CX = os.getenv("GOOGLE_SEARCH_CX")
SCRAPE_DO_KEY = os.getenv("SCRAPE_DO_KEY")  # Clave de Scrape.do
# GEMINI_API_KEY ya no se usa para la generación de imágenes con Vertex AI

# --- CONFIGURACIÓN DE LA CUENTA DE SERVICIO ---
SERVICE_ACCOUNT_FILE = 'service-account-key.json'
VERTEX_AI_SCOPES = ['https://www.googleapis.com/auth/cloud-platform']
VERTEX_CREDENTIALS = None

if os.path.exists(SERVICE_ACCOUNT_FILE):
    try:
        VERTEX_CREDENTIALS = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=VERTEX_AI_SCOPES)
        print("✅ Autenticación (Vertex AI): Credenciales de Cuenta de Servicio cargadas.")
    except Exception as e:
        print(f"⚠️ ERROR: No se pudo cargar la Cuenta de Servicio (service-account-key.json): {e}")
else:
    print(f"❌ ERROR: El archivo '{SERVICE_ACCOUNT_FILE}' no se encontró. La generación de imágenes de Google fallará.")


if OPENAI_API_KEY and OpenAI is not None:
    try:
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ IA (OpenAI): Cliente activo")
    except Exception as e:
        print(f"⚠️ ERROR: No se pudo iniciar el cliente OpenAI: {e}")

# ... (El resto de las configuraciones de Caché y Headers permanecen igual) ...
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Referer': 'https://www.google.com/',
    'Accept-Language': 'en-US,en;q=0.9',
}
SCRAPE_CACHE = {}
CACHE_DURATION = 60 * 60 * 24

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

# NUEVA FUNCIÓN: Generación de prompt detallado con ChatGPT
def generate_detailed_image_prompt(title: str, subtitle: str):
    if not OPENAI_CLIENT:
        print("⚠️ LOG: OPENAI_CLIENT no activo para generar prompt, usando fallback.")
        return f"A highly detailed, cinematic, photorealistic image of {title}, symbolizing {subtitle}. Digital art, 4k."
    
    prompt_content = f"""
    TASK: You are an expert image prompt generator. Your goal is to create a single, highly detailed, cinematic, photorealistic prompt for an AI image generator (like Imagen or DALL-E) based on the provided technical summary. 
    The image should be a dramatic, visual representation of the deep dive/nerd content.
    
    TECHNICAL SUMMARY: {title}. {subtitle}
    
    STYLE: Cinematic, 4K, high detail, volumetric lighting, photorealistic, metaphoric. Aspect ratio 4:5.
    
    OUTPUT: Return only the finalized prompt string, nothing else.
    """
    
    try:
        print(f"🚀 LOG: Solicitando prompt detallado a OpenAI para Title: {title[:30]}...")
        # Usando un modelo de chat para refinamiento de prompt
        response = OPENAI_CLIENT.chat.completions.create(
            model="gpt-3.5-turbo", # Modelo rápido
            messages=[
                {"role": "user", "content": prompt_content}
            ],
            max_tokens=200,
            temperature=0.7
        )
        final_prompt = response.choices[0].message.content.strip()
        print(f"✅ LOG: Prompt generado exitosamente: {final_prompt[:80]}...")
        return final_prompt
    except Exception as e:
        print(f"❌ ERROR: Falló la generación de prompt con OpenAI: {e}")
        # Fallback a un prompt simple si falla la IA
        return f"A highly detailed, cinematic, photorealistic image of {title}, symbolizing {subtitle}. Digital art, 4k."


# FUNCIÓN CORREGIDA: Generación de imágenes con Vertex AI (Gemini/Imagen)
def generate_gemini_image(prompt: str):
    if not VERTEX_CREDENTIALS:
        print("❌ ERROR: CREDENCIALES DE VERTEX AI (service-account-key.json) no están cargadas.")
        return None

    # Usamos el Project ID de tus logs
    PROJECT_ID = "gen-lang-client-0218669781" 
    MODEL_ID = "imagen-3.0-generate-002" 
    
    # CORRECCIÓN FINAL: El método de Vertex AI es ':predict', no ':generateImages'
    API_ENDPOINT = f"https://us-central1-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/us-central1/publishers/google/models/{MODEL_ID}:predict"
    
    print(f"\n🚀 LOG: Llamando a Vertex AI en URL: {API_ENDPOINT[:80]}...")
    print(f"⚙️ LOG: Prompt usado para Vertex AI: {prompt[:80]}...")
    
    # --- LÓGICA DE AUTENTICACIÓN OAUTH ---
    try:
        # Refrescar el token de acceso
        VERTEX_CREDENTIALS.refresh(GoogleAuthRequest())
        ACCESS_TOKEN = VERTEX_CREDENTIALS.token
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ACCESS_TOKEN}" # Usamos el Token, no la Clave API
        }
        
        # El payload de Vertex AI usa 'instances' y 'parameters'
        payload = {
            "instances": [
                {
                    "prompt": prompt 
                }
            ],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": "4:5"
            }
        }
    
        r = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=45)
        
        print(f"ℹ️ LOG: Respuesta de Vertex AI - Status Code: {r.status_code}")
        
        r.raise_for_status() # Lanza error si status >= 400
        
        data = r.json()
        
        print(f"📜 LOG: Respuesta JSON parcial de Vertex AI: {json.dumps(data, indent=2)[:200]}...")
        
        # La respuesta de Vertex AI (método predict) es diferente:
        # Busca 'base64Image' o 'url' dentro de 'predictions'
        
        if data and data.get("predictions") and len(data["predictions"]) > 0:
            prediction = data["predictions"][0]
            
            # NOTA: Vertex AI devuelve la imagen como Base64.
            # NO PODEMOS usarla directamente en el frontend.
            # Debemos guardarla o hacer un proxy de datos Base64.
            # Por ahora, asumiremos que devuelve una URL (aunque esto puede fallar si no es así).
            
            if prediction.get("url"): # Ideal si devuelve una URL temporal
                 image_url = prediction.get("url")
                 print(f"✅ LOG: URL de imagen de Vertex AI obtenida: {image_url}")
                 return image_url
            elif prediction.get("base64Image"):
                # Si devuelve Base64, necesitamos un proxy o guardado.
                # ESTO FALLARÁ si el frontend no sabe manejar Base64.
                print("✅ LOG: Vertex AI devolvió imagen Base64 (falta manejo de proxy).")
                # Devolvemos un identificador o la data URI (aunque puede ser muy grande)
                # Por simplicidad de la guía, devolvemos None, forzando el fallback a Pexels
                # hasta que el proxy de Base64 esté implementado.
                print("❌ ERROR: El servidor recibió Base64 pero no está configurado para servirla. Usando fallback.")
                return None

        print("❌ ERROR: Vertex AI devolvió 200, pero no se encontró 'predictions' o 'imageUri'/'base64Image'.")
        return None
        
    except requests.exceptions.RequestException as e:
        print(f"❌ ERROR: Fallo de HTTP/conexión con Vertex AI: {e}")
        if hasattr(e.response, 'text'):
             print(f"❌ ERROR DETALLE: Respuesta de Vertex AI: {e.response.text[:200]}")
        return None
    except Exception as e:
        print(f"❌ ERROR inesperado en generate_gemini_image: {e}")
        return None


def get_ai_data(title: str, text: str, source: str):
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        return None, "Faltan credenciales OpenAI"
    try:
        # Prompt actualizado para pedir 4 variantes incluyendo la Nerd
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
    # Consulta base para 4 imágenes de Pexels
    images = get_pexels_images('technology AI', count=4)

    # Solo usamos imágenes de Pexels. Si no hay suficientes, devolvemos cadenas vacías.
    img_a = images[0] if len(images) >= 1 else ''
    img_b = images[1] if len(images) >= 2 else ''
    img_c = images[2] if len(images) >= 3 else ''
    img_d = images[3] if len(images) >= 4 else ''

    # Devolvemos A, B, C y D
    return jsonify({"A": img_a, "B": img_b, "C": img_c, "D": img_d})


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


# RUTA NUEVA: Generar el prompt para la Card D usando ChatGPT
@app.route('/api/generate_prompt', methods=['POST'])
def generate_prompt():
    payload = request.get_json(silent=True) or {}
    title = payload.get('title', '').strip()
    subtitle = payload.get('subtitle', '').strip()

    if not title:
        return jsonify({'error': 'Missing title'}), 400

    detailed_prompt = generate_detailed_image_prompt(title, subtitle)
    
    return jsonify({'prompt': detailed_prompt}), 200


# RUTA EXISTENTE: Generar la imagen final para la Card D
@app.route('/api/generate_image', methods=['POST'])
def generate_image():
    payload = request.get_json(silent=True) or {}
    prompt = payload.get('prompt', '').strip()
    if not prompt:
        return jsonify({'error': 'Missing prompt'}), 400

    image_url = generate_gemini_image(prompt)
    
    if image_url:
        return jsonify({'imageUrl': image_url}), 200
    else:
        # Devuelve una URL vacía o una de fallback genérica si la generación falla.
        return jsonify({'imageUrl': ''}), 200


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
        # ===== INTEGRACIÓN SCRAPE.DO =====
        if SCRAPE_DO_KEY:
            target_url_encoded = quote_plus(url)
            scrape_do_url = f"http://api.scrape.do/?token={SCRAPE_DO_KEY}&url={target_url_encoded}"
            
            response = requests.get(scrape_do_url, timeout=60)
            
            if not response.ok:
                raise RuntimeError(f"Scrape.do failed: {response.status_code} - {response.text[:200]}")
            
            html_content = response.text
        else:
            response = requests.get(url, headers=BROWSER_HEADERS, timeout=15)
            response.raise_for_status()
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
        # Esta llamada ya devuelve 'image_keywords', que se usarán en el frontend para Pexels.
        ai_payload, ai_err = get_ai_data(title=original["title"], text=text, source=source)
        
        # --- KEYWORDS DE IMAGEN ---
        search_query = ""
        if ai_payload and 'image_keywords' in ai_payload:
            keywords = ai_payload.get('image_keywords', [])
            if isinstance(keywords, list) and len(keywords) > 0:
                search_query = " ".join(keywords)
        
        if not search_query:
            search_query = clean_pexels_query(original["title"])

        # --- OBTENCIÓN DE IMÁGENES ---
        # Solo devolvemos la imagen del artículo, el cliente gestiona los respaldos de Pexels.
        images = {}
        if top_image:
            images["a"] = top_image
        
        # --- CONSTRUCCIÓN DEL CONTENIDO FINAL ---
        # Definimos variantes por defecto (fallback)
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
            "images": images,
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
        return jsonify({'error': f'scrape failed: {str(e)}'}), 500


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
import os
import json
import time
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from newspaper import Article

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

# Caché simple en memoria
SCRAPE_CACHE = {}
CACHE_DURATION = 86400 # 24 horas

@app.route('/')
def home():
    return app.send_static_file('index.html')

def get_pexels_images(query, count=3):
    """Busca imágenes en Pexels basadas en un query."""
    if not PEXELS_API_KEY: return []
    try:
        headers = {'Authorization': PEXELS_API_KEY}
        # Limpieza básica del query para URL
        clean_query = query.replace(":", "").replace("|", "").strip()[:100]
        print(f"🔎 Buscando en Pexels: '{clean_query}'")
        
        url = f'https://api.pexels.com/v1/search?query={clean_query}&per_page={count}&orientation=portrait'
        response = requests.get(url, headers=headers, timeout=5)
        
        if response.status_code == 200:
            photos = response.json().get('photos', [])
            return [p['src']['large2x'] for p in photos]
        else:
            print(f"⚠️ Pexels Error {response.status_code}: {response.text}")
            return []
    except Exception as e:
        print(f"⚠️ Pexels Exception: {e}")
        return []

def get_ai_data(title, text, source):
    """
    Interactúa con el OpenAI Assistant pre-configurado para generar los textos.
    """
    if not OPENAI_CLIENT or not OPENAI_ASSISTANT_ID:
        print("❌ Error: Faltan credenciales de OpenAI (KEY o ASSISTANT_ID)")
        return None

    print(f"🧠 IA pensando (Assistant) para: {title[:30]}...")
    start_time = time.time()

    try:
        # 1. Crear un Hilo (Thread) y añadir el mensaje del usuario directamente
        # Usamos el sdk helper 'create_and_poll' para simplificar el proceso de espera
        run = OPENAI_CLIENT.beta.threads.create_and_run_poll(
            assistant_id=OPENAI_ASSISTANT_ID,
            thread={
                "messages": [
                    {
                        "role": "user",
                        "content": f"TITLE: {title}\nSOURCE: {source}\nTEXT: {text[:3000]}"
                    }
                ]
            }
        )

        # 2. Verificar si la ejecución terminó correctamente
        if run.status == 'completed':
            # 3. Obtener los mensajes del hilo
            messages = OPENAI_CLIENT.beta.threads.messages.list(
                thread_id=run.thread_id
            )
            
            # El último mensaje suele ser el primero en la lista (orden inverso cronológico)
            last_message = messages.data[0]
            if last_message.role == 'assistant':
                response_text = last_message.content[0].text.value
                print(f"✅ IA terminó en {time.time() - start_time:.2f}s")
                return json.loads(response_text)
        else:
            print(f"❌ La ejecución del Assistant falló. Estado: {run.status}")
            # Si falló, intentar ver por qué (opcional, útil para debug)
            if run.last_error:
                print(f"   Error details: {run.last_error}")
            return None

    except Exception as e:
        print(f"❌ Error crítico en get_ai_data: {e}")
        return None

@app.route('/api/scrape', methods=['POST'])
def scrape():
    data = request.get_json()
    url = data.get('url')
    if not url:
        return jsonify({"error": "URL is required"}), 400

    # Verificar caché
    now = time.time()
    if url in SCRAPE_CACHE and now - SCRAPE_CACHE[url]['timestamp'] < CACHE_DURATION:
        print(f"⚡ Sirviendo desde caché: {url[:30]}...")
        return jsonify(SCRAPE_CACHE[url]['data'])

    try:
        print(f"📥 Descargando artículo: {url[:50]}...")
        article = Article(url)
        article.download()
        article.parse()

        # Extraer fuente limpia
        source_name = article.source_url.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
        source_name = source_name.split(".")[0].upper()

        # 1. Obtener datos de la IA (Assistant)
        ai_content = get_ai_data(article.title, article.text, source_name)

        # 2. Determinar qué query usar para Pexels
        image_query = article.title # Fallback inicial
        if ai_content and ai_content.get('image_keywords'):
            # Usar las keywords que generó el Assistant
            image_query = ai_content['image_keywords']
        
        # 3. Buscar imágenes
        images = get_pexels_images(image_query)
        # Fallback si Pexels falla o no devuelve nada
        fallback_image = article.top_image or "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080"
        if not images:
            images = [fallback_image, fallback_image, fallback_image]
        # Asegurar que siempre haya al menos 3 imágenes
        while len(images) < 3:
            images.append(images[0])

        # Construir respuesta final
        response_data = {
            "source": source_name,
            "images": {
                "a": article.top_image or images[0], # Preferir imagen original del artículo para variante A si existe
                "b": images[0],
                "c": images[1] if len(images) > 1 else images[0]
            },
            "ai_content": ai_content,
            "original": {
                "title": article.title[:60].upper(),
                "subtitle": article.text[:100] + "..."
            }
        }

        # Guardar en caché
        SCRAPE_CACHE[url] = {'data': response_data, 'timestamp': now}
        return jsonify(response_data)

    except Exception as e:
        print(f"🔥 Error procesando URL: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Escuchar en 0.0.0.0 para acceso externo si es necesario
    app.run(host='0.0.0.0', port=5000, debug=True)
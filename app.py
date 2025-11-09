import os
import json
import base64
import requests
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from dotenv import load_dotenv
from newspaper import Article
from generator import ThumbnailGenerator

# --- CONFIGURACIÓN ---
load_dotenv()
app = Flask(__name__, static_url_path='', static_folder='static')

# Configuración de claves API
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

OPENAI_CLIENT = None
if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ IA (OpenAI): Activa")
    except ImportError:
        print("⚠️ ERROR: Falta librería 'openai'. Instala con: pip install openai")
    except Exception as e:
        print(f"⚠️ ERROR OpenAI: {e}")
else:
    print("⚠️ AVISO: Falta OPENAI_API_KEY en .env")

if PEXELS_API_KEY:
    print("✅ IMÁGENES (Pexels): Activo")
else:
    print("⚠️ AVISO: Falta PEXELS_API_KEY en .env")

@app.errorhandler(Exception)
def handle_error(e):
    print(f"🔥 ERROR NO CONTROLADO: {e}")
    return jsonify({"error": str(e)}), 500

@app.route('/')
def home():
    return app.send_static_file('index.html')

# --- FUNCIONES AUXILIARES ---

def get_pexels_images(query, count=3):
    if not PEXELS_API_KEY: return []
    try:
        clean_query = query.split(':')[0].split('|')[0][:50]
        print(f"🔎 Pexels buscando [{count}]: '{clean_query}'...")
        headers = {'Authorization': PEXELS_API_KEY}
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
    if not OPENAI_CLIENT:
        print("❌ OpenAI no está configurado, saltando generación de textos.")
        return None
    try:
        print(f"🧠 IA Generando variantes para: {title[:30]}...")
        # Prompt mejorado para forzar estructura y formato
        prompt = f"""
        ROLE: Expert Social Media Editor.
        TASK: Create 3 Instagram caption variants (A=News, B=Feature, C=Viral) based on the article below.
        
        SOURCE: "{title}"
        SOURCE NAME: "{source_name}"
        CONTENT SUMMARY: "{text[:2000]}"

        REQUIREMENTS FOR EACH VARIANT:
        1. title: MAX 5 powerful words.
        2. subtitle: MAX 10 engaging words.
        3. caption: MUST use EXACTLY this bracket format with no extra text:
           [HOOK - 1 short shocking sentence]
           [SET THE SCENE - 2 factual sentences]
           [WHY IT MATTERS - 1 powerful sentence]
           [ENGAGE - 1 question for comments]
           [Source: {source_name}]

        OUTPUT FORMAT: Pure JSON only, no markdown, no conversational text.
        {{
            "variant_a": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_b": {{ "title": "...", "subtitle": "...", "caption": "..." }},
            "variant_c": {{ "title": "...", "subtitle": "...", "caption": "..." }}
        }}
        """
        
        resp = OPENAI_CLIENT.chat.completions.create(
            model="gpt-3.5-turbo-1106", # Usa gpt-4-turbo si tienes acceso para mejores resultados
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a JSON-only output machine. Never output standard text."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )
        
        content = resp.choices[0].message.content
        # Debug: Imprimir primeros caracteres para ver si llega JSON
        print(f"📡 Respuesta OpenAI recibida ({len(content)} chars)")
        
        try:
            data = json.loads(content)
            # Verificación básica de estructura
            if all(k in data for k in ['variant_a', 'variant_b', 'variant_c']):
                return data
            else:
                print("⚠️ IA devolvió JSON incompleto.")
                return None
        except json.JSONDecodeError:
            print("⚠️ ERROR: La IA no devolvió un JSON válido.")
            print(f"Contenido recibido: {content[:200]}...")
            return None

    except Exception as e:
        print(f"❌ AI Error Crítico: {e}")
        return None

# --- RUTAS API ---

@app.route('/api/scrape', methods=['POST'])
def scrape():
    url = request.json.get('url')
    if not url: return jsonify({"error": "URL missing"}), 400
    
    print(f"📰 Procesando URL: {url}")
    try:
        article = Article(url, request_timeout=15)
        article.download()
        article.parse()
    except Exception as e:
        print(f"Error descargando artículo: {e}")
        return jsonify({"error": "Failed to download article"}), 400

    if not article.title: return jsonify({"error": "Failed to parse article"}), 400

    # Obtener imágenes
    pex = get_pexels_images(article.title, count=3)
    fallback = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080"
    
    # Lógica de asignación de imágenes (evita duplicados si es posible)
    img_a = article.top_image if article.top_image else (pex[0] if len(pex) > 0 else fallback)
    img_b = pex[0] if len(pex) > 0 and pex[0] != img_a else (pex[1] if len(pex) > 1 else fallback)
    img_c = pex[1] if len(pex) > 1 and pex[1] != img_b else (pex[2] if len(pex) > 2 else fallback)

    # Determinar fuente
    try: 
        source_name = article.source_url.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
    except: 
        source_name = "NEWS"
    
    # Generar textos con IA
    ai_data = get_ai_data(article.title, article.text, source_name)

    return jsonify({
        "source": source_name.split(".")[0].upper(),
        "images": { "a": img_a, "b": img_b, "c": img_c },
        "ai_variants": ai_data,
        "original": {
            "title": article.title[:50].upper(),
            "subtitle": article.text[:100] + "..."
        }
    })

@app.route('/api/render', methods=['POST'])
def render_hd():
    """Genera la imagen en alta definición en el servidor"""
    try:
        data = request.json
        print(f"🎨 Renderizando layout: {data.get('layout')} | Tag: {data.get('tag')}")
        
        gen = ThumbnailGenerator()
        
        # 1. Manejar imagen de fondo
        bg_url = data.get('bg_url', '')
        bg_stream = None
        
        if bg_url.startswith('data:image'):
            # Es una imagen subida localmente (Base64)
            try:
                header, encoded = bg_url.split(",", 1)
                bg_data = base64.b64decode(encoded)
                bg_stream = BytesIO(bg_data)
            except Exception as e:
                print(f"Error decodificando base64: {e}")
        elif bg_url.startswith('http'):
            # Es una URL remota
            try:
                resp = requests.get(bg_url, timeout=10)
                if resp.status_code == 200:
                    bg_stream = BytesIO(resp.content)
            except Exception as e:
                print(f"Error descargando URL de fondo: {e}")
        
        # Dibujar fondo (con overlay negro por defecto para legibilidad)
        gen.draw_background(image_source=bg_stream, overlay_mode='black')
        
        # 2. Renderizar textos según layout
        gen.render_layout(
            title=data.get('title', ''),
            subtitle=data.get('subtitle', ''),
            tag_text=data.get('tag', ''),
            layout=data.get('layout', 'layout-standard')
        )
        
        # 3. Exportar a memoria
        img_io = BytesIO()
        gen.img.save(img_io, 'PNG', quality=95)
        img_io.seek(0)
        
        return send_file(
            img_io, 
            mimetype='image/png',
            as_attachment=True,
            download_name=f"sentient_render_{data.get('tag', 'HD')}.png"
        )

    except Exception as e:
        print(f"🔥 Error en Render: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 SERVIDOR SENTIENT V17 LISTO: http://localhost:5000")
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
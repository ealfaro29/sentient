import streamlit as st
import os
import json
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont, ImageOps
import requests
from newspaper import Article
from dotenv import load_dotenv

# --- CONFIGURACIÓN Y CARGA DE CLAVES ---
load_dotenv()
OPENAI_CLIENT = None
PEXELS_KEY = os.getenv("PEXELS_API_KEY")

api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    try:
        from openai import OpenAI
        OPENAI_CLIENT = OpenAI(api_key=api_key)
        print("✅ IA (OpenAI): Activa")
    except:
        st.error("Librería 'openai' no encontrada. Instala con: pip install openai")
else:
    print("⚠️ AVISO: Falta OPENAI_API_KEY en .env")

# --- DEFINICIÓN DE TEMAS Y LAYOUTS (Migrado de V12) ---
THEMES = {
    "default": {
        "name": "Sentient (Default)",
        "colors": { "brand": "#CCFF00", "bg": "#09090b", "txt": "#e4e4e7", "sub": "#a1a1aa", "pill_bg": "#CCFF00", "pill_txt": "#000000" },
        "font": "static/Inter-Black.ttf",
        "font_sub": "static/Inter-Medium.ttf",
        "pill_font": "static/Inter-Bold.ttf"
    },
    "theme-cyber": {
        "name": "Cyberpunk 2077",
        "colors": { "brand": "#00fff9", "bg": "#0a0015", "txt": "#e0ccff", "sub": "#ff00ff", "pill_bg": "#000000", "pill_txt": "#00fff9" },
        "font": "static/Courier New Bold.ttf",
        "font_sub": "static/Courier New.ttf",
        "pill_font": "static/Courier New Bold.ttf"
    },
    "theme-elegant": {
        "name": "Elegant Editorial",
        "colors": { "brand": "#e8d5c4", "bg": "#1c1b1b", "txt": "#d4d4d4", "sub": "#e8d5c4", "pill_bg": "#ffffff", "pill_txt": "#000000" },
        "font": "static/Times New Roman Bold.ttf",
        "font_sub": "static/Times New Roman.ttf",
        "pill_font": "static/Times New Roman.ttf"
    }
}
LAYOUTS = {
    "standard": {"name": "Standard (Bottom Left)", "justify": "end", "align": "start", "text-align": "left"},
    "centered": {"name": "Centered (Middle)", "justify": "center", "align": "center", "text-align": "center"},
    "bold": {"name": "Bold Top (Top Left)", "justify": "start", "align": "start", "text-align": "left", "offset_y": -200}
}
# Fallback de fuente si no se encuentra
DEFAULT_FONT = "static/Inter-Black.ttf"


# --- MOTOR DE RENDERIZADO DE IMAGEN (Adaptado de generator.py) ---
class ThumbnailGenerator:
    def __init__(self, theme, layout):
        self.theme = THEMES.get(theme, THEMES["default"])
        self.layout = LAYOUTS.get(layout, LAYOUTS["standard"])
        self.colors = self.theme["colors"]
        self.img = Image.new('RGB', (1080, 1350), self.colors["bg"])
        self.draw = ImageDraw.Draw(self.img)

    def load_font(self, font_key, size):
        try:
            return ImageFont.truetype(self.theme[font_key], size)
        except:
            print(f"Warning: Font {self.theme.get(font_key)} not found. Using default.")
            try:
                return ImageFont.truetype(DEFAULT_FONT, size)
            except:
                return ImageFont.load_default()

    def draw_background(self, image_url):
        try:
            r = requests.get(image_url, timeout=5, stream=True)
            if r.status_code == 200:
                bg = Image.open(BytesIO(r.content)).convert('RGB')
                bg = ImageOps.fit(bg, (1080, 1350), method=Image.Resampling.LANCZOS)
                self.img.paste(bg, (0, 0))
        except Exception as e:
            print(f"Error cargando imagen de fondo: {e}")
    
    def draw_overlay(self):
        overlay = Image.new('RGBA', (1080, 1350), (0, 0, 0, int(255 * 0.5)))
        self.img.paste(overlay, (0, 0), mask=overlay)

    def fit_text(self, text, font, max_w, max_h):
        words = text.split()
        lines = []
        if not words: return lines, (0,0)
        
        curr_line = words[0]
        for word in words[1:]:
            if font.getlength(curr_line + " " + word) <= max_w:
                curr_line += " " + word
            else:
                lines.append(curr_line)
                curr_line = word
        lines.append(curr_line)

        # Medir altura total
        bbox = font.getbbox(lines[0])
        line_height = (bbox[3] - bbox[1]) * 1.2 # 1.2 line spacing
        total_h = len(lines) * line_height
        
        return lines, (max_w, total_h)

    def draw_text(self, title, subtitle, tag):
        padding = 70
        canvas_w, canvas_h = 1080, 1350
        max_w = canvas_w - (padding * 2)
        max_h = canvas_h - (padding * 2)

        # 1. Título
        font_title = self.load_font("font", 110)
        title_lines, title_size = self.fit_text(title, font_title, max_w, max_h * 0.4)
        
        # 2. Subtítulo
        font_sub = self.load_font("font_sub", 50)
        sub_lines, sub_size = self.fit_text(subtitle, font_sub, max_w, max_h * 0.3)
        
        # 3. Tag
        font_tag = self.load_font("pill_font", 32)
        tag_bbox = font_tag.getbbox(tag)
        tag_w = (tag_bbox[2] - tag_bbox[0]) + 80
        tag_h = (tag_bbox[3] - tag_bbox[1]) + 30
        
        # 4. Cálculo de Posición (Layout)
        content_h = title_size[1] + sub_size[1] + tag_h + 80 # 40px gaps
        
        # Justify (Vertical)
        if self.layout["justify"] == "start":
            y = padding + self.layout.get("offset_y", 0)
        elif self.layout["justify"] == "center":
            y = (canvas_h - content_h) / 2
        else: # "end"
            y = canvas_h - padding - content_h
            
        # Align (Horizontal)
        def get_x(bbox_w):
            if self.layout["align"] == "start": return padding
            if self.layout["align"] == "center": return (canvas_w - bbox_w) / 2
            if self.layout["align"] == "end": return canvas_w - padding - bbox_w
            return padding

        # 5. Dibujar
        # Tag
        self.draw.rounded_rectangle((get_x(tag_w), y, get_x(tag_w) + tag_w, y + tag_h), fill=self.colors["pill_bg"], radius=tag_h/2)
        self.draw.text((get_x(tag_w) + 40, y + 15), tag, font=font_tag, fill=self.colors["pill_txt"], anchor="lt")
        y += tag_h + 40

        # Título
        for line in title_lines:
            bbox = self.draw.textbbox((0, 0), line, font=font_title)
            self.draw.text((get_x(bbox[2]-bbox[0]), y), line, font=font_title, fill=self.colors["brand"], align=self.layout["text-align"])
            y += (bbox[3]-bbox[1]) * 1.2
        y += 40

        # Subtítulo
        for line in sub_lines:
            bbox = self.draw.textbbox((0, 0), line, font=font_sub)
            self.draw.text((get_x(bbox[2]-bbox[0]), y), line, font=font_sub, fill=self.colors["sub"], align=self.layout["text-align"])
            y += (bbox[3]-bbox[1]) * 1.2

    def save(self):
        # Devuelve la imagen como bytes para Streamlit
        bio = BytesIO()
        self.img.save(bio, format='PNG')
        return bio.getvalue()

# --- FUNCIONES DE API (Migradas de app.py) ---

@st.cache_data(ttl=3600)
def get_pexels_images(query, count=3):
    if not PEXELS_KEY: return []
    try:
        clean_query = query.split(':')[0].split('|')[0][:50]
        headers = {'Authorization': PEXELS_KEY}
        r = requests.get(f'https://api.pexels.com/v1/search?query={clean_query}&per_page={count}&orientation=portrait', headers=headers, timeout=5)
        if r.status_code == 200:
            data = r.json()
            if data.get('photos'): return [p['src']['large2x'] for p in data['photos']]
    except: pass
    return []

@st.cache_data(ttl=3600)
def get_ai_data(title, text):
    if not OPENAI_CLIENT: return None
    try:
        prompt = f"""
        ACT AS AN INSTAGRAM EXPERT.
        SOURCE: "{title}", SUMMARY: "{text[:600]}"
        TASK: Create 3 IG post variants (A, B, C).
        CONSTRAINTS: Titles MAX 6 words. Subtitles MAX 12 words.
        STYLES: A: Punchy/News. B: Engaging/Feature. C: VIRAL CLICKBAIT.
        OUTPUT RAW JSON:
        {{
            "variant_a": {{ "title": "...", "subtitle": "..." }},
            "variant_b": {{ "title": "...", "subtitle": "..." }},
            "variant_c": {{ "title": "...", "subtitle": "..." }}
        }}
        """
        resp = OPENAI_CLIENT.chat.completions.create(
            model="gpt-3.5-turbo-1106", response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.9
        )
        return json.loads(resp.choices[0].message.content)
    except: return None

@st.cache_data(ttl=3600)
def scrape_article(url):
    article = Article(url, request_timeout=15); article.download(); article.parse()
    if not article.title: return None
    bg_article = article.top_image # Devolvemos la URL, Pillow la manejará
    return {
        "title": article.title, "text": article.text,
        "source": article.source_url.replace("https://","").replace("www.","").split("/")[0].split(".")[0].upper(),
        "bg_article": bg_article
    }

# --- INTERFAZ DE STREAMLIT ---

st.set_page_config(page_title="Sentient Studio", layout="wide")

# Inicializar st.session_state
if 'variants' not in st.session_state:
    st.session_state.variants = {}

# --- BARRA LATERAL (Controles) ---
with st.sidebar:
    st.title("🚀 Sentient V14")
    url = st.text_input("Pega la URL de una noticia:", key="url_input")
    
    theme_key = st.selectbox(
        "Elige un Tema:", 
        options=THEMES.keys(), 
        format_func=lambda k: THEMES[k]["name"],
        key="theme_select"
    )
    
    generate_btn = st.button("✨ Generar Variantes")

# --- LÓGICA PRINCIPAL ---
if generate_btn and url:
    with st.spinner("Procesando noticia y generando con IA..."):
        article_data = scrape_article(url)
        if not article_data:
            st.error("No se pudo procesar la URL. Intenta con otra.")
        else:
            ai_data = get_ai_data(article_data["title"], article_data["text"])
            pex_imgs = get_pexels_images(article_data["title"], count=3)
            
            # Fallbacks de imagen
            ph = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080"
            img_a = article_data.get("bg_article") or (pex_imgs[0] if len(pex_imgs) > 0 else ph)
            img_b = pex_imgs[0] if len(pex_imgs) > 0 else (article_data.get("bg_article") or ph)
            img_c = pex_imgs[1] if len(pex_imgs) > 1 else (pex_imgs[0] if len(pex_imgs) > 0 else ph)

            # Guardar en el estado de la sesión
            st.session_state.variants = {
                'A': {
                    "tag": article_data["source"],
                    "title": ai_data["variant_a"]["title"] if ai_data else article_data["title"][:40],
                    "subtitle": ai_data["variant_a"]["subtitle"] if ai_data else article_data["text"][:80],
                    "img": img_a, "layout": "standard"
                },
                'B': {
                    "tag": "FEATURE",
                    "title": ai_data["variant_b"]["title"] if ai_data else article_data["title"][:40],
                    "subtitle": ai_data["variant_b"]["subtitle"] if ai_data else article_data["text"][:80],
                    "img": img_b, "layout": "centered"
                },
                'C': {
                    "tag": "VIRAL",
                    "title": ai_data["variant_c"]["title"] if ai_data else article_data["title"][:40],
                    "subtitle": ai_data["variant_c"]["subtitle"] if ai_data else article_data["text"][:80],
                    "img": img_c, "layout": "bold"
                }
            }
            st.rerun() # Forzar refresco para mostrar resultados

# --- MOSTRAR RESULTADOS (Si existen en el estado) ---
if st.session_state.variants:
    col1, col2, col3 = st.columns(3)
    
    # Iterar y crear cada columna
    for v in ['A', 'B', 'C']:
        data = st.session_state.variants[v]
        col = col1 if v == 'A' else (col2 if v == 'B' else col3)
        
        with col:
            st.header(f"Variante {v} ({data['tag']})")
            
            # Controles de edición (actualizan el estado en vivo)
            data["layout"] = st.selectbox(
                f"Layout {v}", options=LAYOUTS.keys(), 
                format_func=lambda k: LAYOUTS[k]["name"], 
                key=f"layout_{v}", index=list(LAYOUTS.keys()).index(data["layout"])
            )
            data["title"] = st.text_input(f"Título {v}", value=data["title"], key=f"title_{v}")
            data["subtitle"] = st.text_area(f"Subtítulo {v}", value=data["subtitle"], key=f"sub_{v}", height=100)
            data["img"] = st.text_input(f"URL Imagen {v}", value=data["img"], key=f"img_{v}")

            # Generar la imagen con Pillow
            try:
                gen = ThumbnailGenerator(theme=theme_key, layout=data["layout"])
                gen.draw_background(data["img"])
                gen.draw_overlay()
                gen.draw_text(data["title"], data["subtitle"], data["tag"])
                image_bytes = gen.save()
                
                # Mostrar imagen
                st.image(image_bytes, use_column_width=True)
                
                # Botón de descarga
                st.download_button(
                    label=f"Descargar Variante {v}",
                    data=image_bytes,
                    file_name=f"Sentient_V14_{v}.png",
                    mime="image/png"
                )
            except Exception as e:
                st.error(f"Error al renderizar imagen: {e}")

else:
    st.info("Ingresa una URL en la barra lateral para comenzar.")
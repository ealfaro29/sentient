import os
from PIL import Image, ImageDraw, ImageFont, ImageOps
from io import BytesIO

CONFIG = {
    "CANVAS_SIZE": (1080, 1350),
    "COLORS": { 
        "accent": "#CCFF00", 
        "bg": "#09090b", 
        "text_main": "#FFFFFF",
        "text_secondary": "#D4D4D4" 
    },
    "PADDING": 80,
    # Asegúrate de que estas rutas sean correctas en tu servidor
    "FONTS": { 
        "headline": "static/Inter-Black.ttf", 
        "subtitle": "static/Inter-Medium.ttf", 
        "tag": "static/Inter-Bold.ttf" 
    }
}

class ThumbnailGenerator:
    def __init__(self):
        self.img = Image.new('RGB', CONFIG["CANVAS_SIZE"], CONFIG["COLORS"]["bg"])
        self.draw = ImageDraw.Draw(self.img)

    def load_font(self, font_name, size):
        try:
            return ImageFont.truetype(CONFIG["FONTS"][font_name], size)
        except Exception as e:
            print(f"⚠️ Fuente no encontrada ({font_name}): {e}. Usando default.")
            return ImageFont.load_default()

    def draw_background(self, image_source=None, overlay_mode='black'):
        """Dibuja el fondo desde un archivo, BytesIO o color sólido"""
        if image_source:
            try:
                # image_source puede ser path (str) o BytesIO
                bg = Image.open(image_source).convert('RGB')
                bg = ImageOps.fit(bg, CONFIG["CANVAS_SIZE"], method=Image.Resampling.LANCZOS)
                self.img.paste(bg, (0, 0))
            except Exception as e:
                print(f"Error dibujando fondo: {e}")

        # Aplicar overlay
        if overlay_mode in ['black', 'white']:
            color = (0,0,0) if overlay_mode == 'black' else (255,255,255)
            # Opacidad del 50% (128/255)
            overlay = Image.new('RGBA', CONFIG["CANVAS_SIZE"], color + (128,))
            self.img.paste(Image.alpha_composite(self.img.convert('RGBA'), overlay).convert('RGB'), (0,0))

    def draw_tag(self, text, x, y, align='left'):
        if not text: return 0
        font = self.load_font("tag", 32)
        pad_x, pad_y = 40, 16
        bbox = font.getbbox(text)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        w = text_w + pad_x * 2
        h = text_h + pad_y * 2 + 10
        
        final_x = x
        if align == 'center': final_x = x - (w / 2)
        
        # Pill background
        self.draw.rounded_rectangle(
            (final_x, y, final_x + w, y + h), 
            radius=h/2, 
            fill=CONFIG["COLORS"]["accent"]
        )
        # Text inside pill
        self.draw.text(
            (final_x + pad_x, y + pad_y - 4), 
            text, 
            font=font, 
            fill="black"
        )
        return h

    def fit_text(self, text, font_name, max_w, max_h, start_size=130, min_size=60):
        """Ajusta el tamaño del texto para que quepa en el área designada"""
        size = start_size
        font = self.load_font(font_name, size)
        
        while size >= min_size:
            lines = []
            words = text.split()
            if not words: return font, [], 0, 0
            
            curr_line = words[0]
            for word in words[1:]:
                if font.getlength(curr_line + " " + word) <= max_w:
                    curr_line += " " + word
                else:
                    lines.append(curr_line)
                    curr_line = word
            lines.append(curr_line)
            
            # Calcular altura total
            ascent, descent = font.getmetrics()
            line_height = ascent + descent + 10 # un poco de leading
            total_h = len(lines) * line_height
            
            if total_h <= max_h:
                return font, lines, line_height, total_h
            
            size -= 5
            font = self.load_font(font_name, size)
            
        return font, [text], 0, 0 # Fallback si no cabe

    def render_layout(self, title, subtitle, tag_text, layout='layout-standard'):
        w_cv, h_cv = CONFIG["CANVAS_SIZE"]
        pad = CONFIG["PADDING"]
        
        if layout == 'layout-centered':
            self._render_centered(title, subtitle, tag_text, w_cv, h_cv, pad)
        elif layout == 'layout-bold':
            self._render_bold(title, subtitle, tag_text, w_cv, h_cv, pad)
        else:
            self._render_standard(title, subtitle, tag_text, w_cv, h_cv, pad)

    def _render_standard(self, title, subtitle, tag_text, w, h, pad):
        # 1. Subtítulo (Bottom-up)
        sub_font, sub_lines, sub_lh, sub_h = self.fit_text(subtitle, "subtitle", w - pad*2, 400, start_size=55, min_size=40)
        cur_y = h - pad - sub_lh # Empezar desde la última línea
        for line in reversed(sub_lines):
            self.draw.text((pad, cur_y), line, font=sub_font, fill=CONFIG["COLORS"]["text_main"])
            cur_y -= sub_lh
            
        # 2. Título (Encima del subtítulo)
        tit_font, tit_lines, tit_lh, tit_h = self.fit_text(title, "headline", w - pad*2, 600, start_size=140)
        cur_y -= (tit_h + 40) # Espacio entre título y subtítulo
        start_tit_y = cur_y
        for line in tit_lines:
             self.draw.text((pad, cur_y), line, font=tit_font, fill=CONFIG["COLORS"]["accent"])
             cur_y += tit_lh

        # 3. Tag (Encima del título)
        if tag_text:
            self.draw_tag(tag_text, pad, start_tit_y - 120)

    def _render_centered(self, title, subtitle, tag_text, w, h, pad):
        # Centro vertical aproximado
        center_y = h / 2
        
        # Calcular alturas primero para centrar el bloque completo
        t_font, t_lines, t_lh, t_h = self.fit_text(title, "headline", w - pad*2, 600, start_size=120)
        s_font, s_lines, s_lh, s_h = self.fit_text(subtitle, "subtitle", w - pad*2, 300, start_size=50)
        
        total_content_h = t_h + s_h + 150 # 150 es espacio aprox para tag y márgenes
        start_y = center_y - (total_content_h / 2)
        
        # Tag centrado
        if tag_text:
            tag_h = self.draw_tag(tag_text, w/2, start_y, align='center')
            start_y += tag_h + 40
            
        # Título centrado
        for line in t_lines:
            line_w = t_font.getlength(line)
            self.draw.text(((w - line_w)/2, start_y), line, font=t_font, fill=CONFIG["COLORS"]["accent"])
            start_y += t_lh
            
        start_y += 30 # Espacio
        
        # Subtítulo centrado
        for line in s_lines:
            line_w = s_font.getlength(line)
            self.draw.text(((w - line_w)/2, start_y), line, font=s_font, fill=CONFIG["COLORS"]["text_main"])
            start_y += s_lh

    def _render_bold(self, title, subtitle, tag_text, w, h, pad):
        cur_y = 180 # Padding superior fuerte
        
        # Tag arriba a la izquierda
        if tag_text:
            tag_h = self.draw_tag(tag_text, pad, cur_y)
            cur_y += tag_h + 50
            
        # Título grande
        t_font, t_lines, t_lh, t_h = self.fit_text(title, "headline", w - pad*2, 800, start_size=160)
        for line in t_lines:
            self.draw.text((pad, cur_y), line, font=t_font, fill=CONFIG["COLORS"]["accent"])
            cur_y += t_lh
            
        cur_y += 40
        
        # Subtítulo
        s_font, s_lines, s_lh, s_h = self.fit_text(subtitle, "subtitle", w - pad*2, 400, start_size=60)
        for line in s_lines:
            self.draw.text((pad, cur_y), line, font=s_font, fill=CONFIG["COLORS"]["text_main"])
            cur_y += s_lh
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

CONFIG = {
    "CANVAS_SIZE": (1080, 1350),
    "COLORS": { "accent": "#CCFF00", "bg": "#09090b", "text_secondary": "#D4D4D4" },
    "PADDING": 60,
    "FONTS": { "headline": "static/Inter-Black.ttf", "subtitle": "static/Inter-Medium.ttf", "tag": "static/Inter-Bold.ttf" }
}

class ThumbnailGenerator:
    def __init__(self):
        self.img = Image.new('RGB', CONFIG["CANVAS_SIZE"], CONFIG["COLORS"]["bg"])
        self.draw = ImageDraw.Draw(self.img)
    def load_font(self, font_name, size):
        try: return ImageFont.truetype(CONFIG["FONTS"][font_name], size)
        except: return ImageFont.load_default()
    def draw_background(self, image_source=None, overlay_mode='off'):
        if image_source:
            try:
                bg = Image.open(image_source).convert('RGB')
                bg = ImageOps.fit(bg, CONFIG["CANVAS_SIZE"], method=Image.Resampling.LANCZOS)
                self.img.paste(bg, (0, 0))
            except: pass
        if overlay_mode in ['black', 'white']:
            color = (0,0,0) if overlay_mode == 'black' else (255,255,255)
            overlay = Image.new('RGBA', CONFIG["CANVAS_SIZE"], color + (int(255*0.6),))
            self.img.paste(overlay, (0,0), mask=overlay)
    def draw_tag(self, text, x, y):
        font = self.load_font("tag", 30); pad_x, pad_y = 32, 12
        bbox = font.getbbox(text); w = (bbox[2]-bbox[0])+pad_x*2; h = (bbox[3]-bbox[1])+pad_y*2+8
        self.draw.rounded_rectangle((x,y,x+w,y+h), radius=h/2, fill=CONFIG["COLORS"]["accent"])
        self.draw.text((x+pad_x, y+pad_y-2), text, font=font, fill="black")
        return h
    def fit_text(self, text, font_name, max_w, max_h, start_size=120):
        size = start_size; font = self.load_font(font_name, size)
        while size > 40:
            lines = []; words = text.split(); curr = words[0] if words else ""
            for word in words[1:]:
                if font.getlength(curr+" "+word) <= max_w: curr+=" "+word
                else: lines.append(curr); curr=word
            lines.append(curr)
            lh = font.getbbox("Ay")[3]-font.getbbox("Ay")[1]+10
            if len(lines)*lh <= max_h: return font, lines, lh, len(lines)*lh
            size -= 5; font = self.load_font(font_name, size)
        return font, [text], 0, 0
    def render_layout(self, title, subtitle, tag_text, layout='standard', tag_visible=True):
        w, h = CONFIG["CANVAS_SIZE"]; pad = CONFIG["PADDING"]
        sub_font = self.load_font("subtitle", 60); sub_lines = []; curr = ""
        for word in subtitle.split():
            if sub_font.getlength(curr+" "+word) < w-pad*2: curr+=" "+word
            else: sub_lines.append(curr.strip()); curr=word
        if curr: sub_lines.append(curr.strip())
        sub_lh = sub_font.getbbox("Ay")[3]-sub_font.getbbox("Ay")[1]+15; sub_h = len(sub_lines)*sub_lh
        t_font, t_lines, t_lh, t_h = self.fit_text(title, "headline", w-pad*2, 500)
        cur_y = h-pad-sub_lh*len(sub_lines)
        for line in sub_lines: self.draw.text((pad, cur_y), line, font=sub_font, fill=CONFIG["COLORS"]["text_secondary"]); cur_y+=sub_lh
        cur_y = h-pad-sub_h-t_h-40
        for line in t_lines: self.draw.text((pad, cur_y), line, font=t_font, fill=CONFIG["COLORS"]["accent"]); cur_y+=t_lh
        if tag_visible and tag_text: self.draw_tag(tag_text, pad, h-pad-sub_h-t_h-40-80)
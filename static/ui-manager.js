// static/ui-manager.js

import { CARD_IDS, LAYOUTS, OVERLAYS } from './utils.js';

const CARD_W = 1080;
const CARD_H = 1350;
const CARD_PADDING = 80;

// Tamaños fijos por layout
const FIXED_FS = {
  'layout-standard': { title: 84, subtitle: 32, titleLH: 0.98, subLH: 1.15 },
  'layout-centered': { title: 92, subtitle: 36, titleLH: 0.98, subLH: 1.15 },
  'layout-bold':     { title: 110, subtitle: 34, titleLH: 0.95, subLH: 1.15 },
  'layout-chatgptricks': { title: 140, subtitle: 0, titleLH: 0.9, subLH: 1 }
};

function sizesFor(layout) {
  return FIXED_FS[layout] || FIXED_FS['layout-standard'];
}

export const UIManager = {
  // --- RENDERING CORE ---
  renderCard(app, v, tid = `card${v}`) {
    const c = document.getElementById(tid);
    if (!c) return;

    const d = app.state.data[v];
    const isChatGPTricks = app.state.theme.id === 'chatgptricks';

    const ovs = (app.state.theme && app.state.theme.overlays)
      ? app.state.theme.overlays
      : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' };

    // Fondo (Aplica para A, B, C, D)
    const imgEl = c.querySelector('.card-bg');
    if (d.bg && d.bg.length > 0) {
      imgEl.src = d.bg.startsWith('data:') ? d.bg : `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
    } else {
      imgEl.src = '';
    }
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;

    // Overlay / Layout (Aplica para A, B, C, D)
    c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? ovs.white : ovs.black;
    c.querySelector('.card-content').className = `card-content ${d.layout}`;
    
    // ===== INICIO DE LA CORRECCIÓN (CSS PLACEHOLDER) =====
    const p = c.querySelector('.c-pill');
    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');

    // 1. Asignar atributos de placeholder (para CSS)
    p.setAttribute('data-placeholder', d.defaultTag || 'TAG');
    t.setAttribute('data-placeholder', d.defaultTitle || 'TITLE');
    s.setAttribute('data-placeholder', d.defaultSubtitle || 'Subtitle');
    
    // 2. Poner el texto o dejarlo vacío (para que :empty funcione)
    p.textContent = d.isPlaceholder ? '' : d.tag;
    t.textContent = d.isPlaceholder ? '' : d.title;
    s.textContent = d.isPlaceholder ? '' : d.subtitle;

    // 3. Quitar la clase .is-placeholder (ya no la usamos)
    p.classList.remove('is-placeholder');
    t.classList.remove('is-placeholder');
    s.classList.remove('is-placeholder');
    // ===== FIN DE LA CORRECCIÓN =====

    // Colores y edición
    t.style.color = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : (d.overlayColor === 'white' ? '#000' : 'var(--brand)');
    s.style.color = d.overlayColor === 'white' ? '#333' : '#fff';

    // Aplicar 'contenteditable' CADA VEZ que se renderiza
    p.setAttribute('contenteditable', 'true');
    t.setAttribute('contenteditable', 'true');
    s.setAttribute('contenteditable', isChatGPTricks ? 'false' : 'true');

    // Tamaños fijos
    const fs = sizesFor(d.layout);
    t.style.fontSize = `${fs.title}px`;
    t.style.lineHeight = fs.titleLH;
    t.style.wordBreak = 'normal';
    t.style.whiteSpace = 'normal';
    t.style.hyphens = 'auto';

    if (isChatGPTricks) {
      s.style.display = 'none';
    } else {
      s.style.display = '';
      s.style.fontSize = `${fs.subtitle}px`;
      s.style.lineHeight = fs.subLH;
      s.style.wordBreak = 'normal';
      s.style.whiteSpace = 'normal';
      s.style.hyphens = 'auto';
    }
  },

  renderAll(app) {
    CARD_IDS.forEach(v => {
      this.renderCard(app, v);
    });
    this.fitStage(app);
  },

  fitStage(app) {
    CARD_IDS.forEach(v => {
      const w = document.getElementById(`mount${v}`);
      const c = document.getElementById(`card${v}`);
      if (!w || !c) return;

      const scale = Math.min(w.clientWidth / CARD_W, w.clientHeight / CARD_H);
      c.style.transformOrigin = 'center center';
      c.style.transform = `scale(${scale})`;
    });
  },

  // ===== INICIO DE LA CORRECCIÓN (LÓGICA DE EDICIÓN REAL) =====
  
  // Soluciona Ctrl+V pegando solo texto plano
  handlePaste(e) {
    e.preventDefault(); // Detener el pegado por defecto
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text); // Insertar solo el texto
  },
  
  // (handleFocus y handleBlur ya no son necesarios gracias al placeholder CSS)

  // Guarda el dato en el estado de la App
  updateTextFromCard(app, el, type) {
    const v = el.closest('.mockup').id.replace('mock', '');
    const newText = el.textContent; // .textContent ya es texto plano

    let key;
    if (type === 'title') key = 'title';
    else if (type === 'subtitle') key = 'subtitle';
    else if (type === 'tag') key = 'tag';

    if (key) {
      app.updateCardData(v, key, newText);
    }
  },
  // ===== FIN DE LA CORRECCIÓN =====

  // --- UI/EVENT LOGIC ---
  bindEvents(app) {
    
    // Enlazar eventos para A, B, C, D
    ['A', 'B', 'C', 'D'].forEach(v => { 
      const el = document.getElementById(`mock${v}`);
      if (el) el.onclick = () => app.switchVar(v);
    });

    const up = () => this.renderCard(app, app.state.active);

    // Controles (que están ocultos, pero la lógica está lista)
    if (app.els.layoutBtn) {
      app.els.layoutBtn.onclick = () => {
        const currentLayout = app.state.data[app.state.active].layout;
        const currentIndex = LAYOUTS.findIndex(l => l.id === currentLayout);
        const nextIndex = (currentIndex + 1) % LAYOUTS.length;
        app.state.data[app.state.active].layout = LAYOUTS[nextIndex].id;
        app.els.layoutValue.textContent = LAYOUTS[nextIndex].short;
        up();
      };
    }

    if (app.els.overlayBtn) {
      app.els.overlayBtn.onclick = () => {
        const currentOverlay = app.state.data[app.state.active].overlayColor;
        const currentIndex = OVERLAYS.findIndex(o => o.id === currentOverlay);
        const nextIndex = (currentIndex + 1) % OVERLAYS.length;
        app.state.data[app.state.active].overlayColor = OVERLAYS[nextIndex].id;
        app.els.overlayValue.textContent = OVERLAYS[nextIndex].short;
        up();
      };
    }

    if (app.els.iUrl) app.els.iUrl.oninput = (e) => { app.state.data[app.state.active].bg = e.target.value; up(); };
    if (app.els.blur) app.els.blur.oninput = (e) => { app.state.data[app.state.active].blur = e.target.value; up(); };
    if (app.els.contrast) app.els.contrast.oninput = (e) => { app.state.data[app.state.active].contrast = e.target.value; up(); };

    if (app.els.iFile) {
      app.els.iFile.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          app.state.data[app.state.active].bg = reader.result;
          up();
        };
        reader.readAsDataURL(file);
      };
    }

    // ===== INICIO DE LA CORRECCIÓN (TEXTO EDITABLE) =====
    // Enlazar eventos para todos los campos de texto editables
    // Ahora incluye '.c-pill'
    document.querySelectorAll('.c-title[contenteditable="true"], .c-subtitle[contenteditable="true"], .c-pill[contenteditable="true"]').forEach(el => {
      
      let type;
      if (el.classList.contains('c-title')) type = 'title';
      else if (el.classList.contains('c-subtitle')) type = 'subtitle';
      else if (el.classList.contains('c-pill')) type = 'tag';

      // 1. Actualizar el estado en tiempo real (input)
      el.addEventListener('input', () => {
        // 'this' es UIManager
        this.updateTextFromCard(app, el, type);
      });

      // 2. Evitar saltos de línea y desenfocar (Enter)
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // Evita que se cree un <br> o <div>
          el.blur(); // Trata Enter como "Confirmar"
        }
      });
      
      // 3. Forzar pegado de texto plano
      el.addEventListener('paste', (e) => {
        this.handlePaste(e);
      });
    });
    // ===== FIN DE LA CORRECCIÓN =====
  },
  
  positionControls(app) { /* noop */ }
};
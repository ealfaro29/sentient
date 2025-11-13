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
  // Por si existiera el layout chatgptricks:
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

    if (v === 'D') {
      // Panel de caption
      if (app.els.captionTextD) app.els.captionTextD.value = d.caption || '';
      if (app.els.copyBtnD) {
        app.els.copyBtnD.onclick = () => {
          try {
            app.els.captionTextD?.select();
            document.execCommand?.('copy');
            navigator.clipboard?.writeText(app.els.captionTextD.value).catch(() => {});
          } catch (_) {}
        };
      }
      return;
    }

    // Fondo
    const imgEl = c.querySelector('.card-bg');
    if (d.bg && d.bg.length > 0) {
      imgEl.src = d.bg.startsWith('data:') ? d.bg : `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
    } else {
      imgEl.src = '';
    }
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;

    // Overlay / Layout
    c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? ovs.white : ovs.black;
    c.querySelector('.card-content').className = `card-content ${d.layout}`;
    c.querySelector('.c-pill').textContent = d.tag;

    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');

    // Placeholders
    if (d.isPlaceholder) {
      t.classList.add('is-placeholder');
      s.classList.add('is-placeholder');
    } else {
      t.classList.remove('is-placeholder');
      s.classList.remove('is-placeholder');
    }

    // Texto
    t.textContent = d.title || '';
    s.textContent = d.subtitle || '';

    // Colores y edición
    t.style.color = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : (d.overlayColor === 'white' ? '#000' : 'var(--brand)');
    s.style.color = d.overlayColor === 'white' ? '#333' : '#fff';
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
      const d = app.state.data[v];

      const mockEl = document.getElementById(`mock${v}`);
      const isActive = v === app.state.active;
      mockEl.classList.toggle('active-stage', isActive);
      mockEl.classList.toggle('inactive', !isActive && v !== 'D');
    });
    this.fitStage(app);
  },

  fitStage(app) {
    CARD_IDS.forEach(v => {
      const w = document.getElementById(`mount${v}`);
      const c = document.getElementById(`card${v}`);
      if (!w || !c) return;
      if (v === 'D') return; // D es panel, no escalamos

      const scale = Math.min(w.clientWidth / CARD_W, w.clientHeight / CARD_H);
      c.style.transformOrigin = 'center center';
      c.style.transform = `scale(${scale})`;
    });
  },

  // --- INPUT HANDLERS (editable text) ---
  handleFocus(app, el, type) {
    const v = el.closest('.mockup').id.replace('mock', '');
    const d = app.state.data[v];
    if (d.isPlaceholder) {
      requestAnimationFrame(() => {
        el.textContent = '';
        el.classList.remove('is-placeholder');
        d.isPlaceholder = false;
      });
    }
  },

  handleBlur(app, el, type) {
    const v = el.closest('.mockup').id.replace('mock', '');
    const d = app.state.data[v];
    const currentText = el.textContent;
    const trimmedText = currentText.trim();
    const isChatGPTricks = app.state.theme.id === 'chatgptricks';

    if (trimmedText === '') {
      d.isPlaceholder = true;
      d.title = d.defaultTitle;
      d.subtitle = d.defaultSubtitle;
      if (type === 'title') el.textContent = d.defaultTitle;
      else el.textContent = d.defaultSubtitle;
      el.classList.add('is-placeholder');
    } else {
      d.isPlaceholder = false;
      if (type === 'title') d.title = currentText;
      if (type === 'subtitle') d.subtitle = currentText;
      if (isChatGPTricks) {
        // asegurar subtítulo oculto
        const s = el.closest('.card-content')?.querySelector('.c-subtitle');
        if (s) s.style.display = 'none';
      }
    }
  },

  updateTextFromCard(app, el, type) {
    const v = el.closest('.mockup').id.replace('mock', '');
    const newText = el.textContent;
    const isChatGPTricks = app.state.theme.id === 'chatgptricks';

    if (type === 'subtitle' && isChatGPTricks) {
      if (newText.trim() !== app.state.data[v].subtitle) {
        el.textContent = app.state.data[v].subtitle;
      }
      return;
    }

    if (type === 'title') {
      app.state.data[v].title = newText;
    } else {
      app.state.data[v].subtitle = newText;
    }
  },

  // --- UI/EVENT LOGIC ---
  bindEvents(app) {
    // Landing
    app.els.scrape.onclick = () => app.animateFusionAndScrape();
    app.els.landingUrl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        app.animateFusionAndScrape();
      }
    };

    // Solo A, B, C son clickables (D es panel)
    ['A', 'B', 'C'].forEach(v => {
      const el = document.getElementById(`mock${v}`);
      if (el) el.onclick = () => app.switchVar(v);
    });

    const up = () => this.renderCard(app, app.state.active);

    // Controles
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
  },

  positionControls(app) { /* noop */ }
};

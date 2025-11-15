// static/ui-manager.js

import { CARD_IDS, LAYOUTS, OVERLAYS } from './utils.js';

const CARD_W = 1080;
const CARD_H = 1350;
const CARD_PADDING = 80;

const FIXED_FS = {
  'layout-standard': { title: 84, subtitle: 32, titleLH: 0.98, subLH: 1.15 },
  'layout-centered': { title: 92, subtitle: 36, titleLH: 0.98, subLH: 1.15 },
  'layout-bold':     { title: 110, subtitle: 34, titleLH: 0.95, subLH: 1.15 },
  'layout-chatgptricks': { title: 140, subtitle: 0, titleLH: 0.9, subLH: 1 }
};

const COLOR_OPTIONS = ['brand', 'white', 'black'];
const PILL_BG_OPTIONS = ['brand', 'white', 'black'];
const PILL_TEXT_OPTIONS = ['black', 'white', 'brand'];

function sizesFor(layout) {
  return FIXED_FS[layout] || FIXED_FS['layout-standard'];
}

function getResolvedColor(d, stateColor) {
    const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';
    switch (stateColor) {
        case 'brand': return brandColor;
        case 'white': return '#FFF';
        case 'black': return '#000';
        default: return brandColor;
    }
}

function getTextColor(d, element, defaultColor, stateColor) {
    const isPlaceholder = (element.textContent === '' && element.dataset.placeholder);
    if (isPlaceholder) return defaultColor; 
    return getResolvedColor(d, stateColor);
}

function positionColorPicker(app, el) {
    const rect = el.getBoundingClientRect();
    const stageRect = app.els.overviewGrid.getBoundingClientRect(); 
    
    if (!app.els.colorPickerDot) return;

    const offsetX = rect.right - stageRect.left;
    const offsetY = rect.top - stageRect.top;
    
    const dotSize = 20; 
    const margin = 10;
    
    app.els.colorPickerDot.style.left = `${offsetX - dotSize / 2 + margin}px`; 
    app.els.colorPickerDot.style.top = `${offsetY - margin}px`;
    
    const isTitle = el.classList.contains('c-title');
    const targetField = isTitle ? 'title' : 'subtitle';
    const colorState = app.state.editCardData[targetField + 'Color']; 
    
    app.els.colorPickerDot.setAttribute('data-color', colorState);
    app.els.colorPickerDot.style.visibility = 'visible';
    
    app.els.colorPickerDot.setAttribute('data-target-id', el.id);
    app.els.colorPickerDot.setAttribute('data-target-field', targetField);
}


export const UIManager = {
  // --- RENDERING CORE ---

  // 1. renderCard (Vista Overview) - EDICIÓN ELIMINADA
  renderCard(app, v, tid = `card${v}`) {
    const c = document.getElementById(tid);
    if (!c) return;

    const d = app.state.data[v];
    const ovs = (app.state.theme && app.state.theme.overlays)
      ? app.state.theme.overlays
      : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' };

    const imgEl = c.closest('.mockup').querySelector('.card-bg');
    if (d.bg && d.bg.length > 0) {
      const proxyUrl = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
      imgEl.src = d.bg.startsWith('data:') ? d.bg : proxyUrl;
    } else {
      imgEl.src = '';
    }
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;

    c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? ovs.white : ovs.black;
    c.querySelector('.card-content').className = `card-content ${d.layout}`;
    
    const p = c.querySelector('.c-pill');
    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');
    
    p.textContent = d.isPlaceholder ? '' : d.tag;
    t.textContent = d.isPlaceholder ? '' : d.title;
    s.textContent = d.isPlaceholder ? '' : d.subtitle;

    p.setAttribute('data-placeholder', d.defaultTag || 'TAG');
    t.setAttribute('data-placeholder', d.defaultTitle || 'TITLE');
    s.setAttribute('data-placeholder', d.defaultSubtitle || 'Subtitle');
    
    const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';
    const subtitleDefaultColor = d.overlayColor === 'white' ? '#333' : '#fff';
    
    t.style.color = getTextColor(d, t, brandColor, d.titleColor);
    s.style.color = getTextColor(d, s, subtitleDefaultColor, d.subtitleColor);
    
    p.removeAttribute('contenteditable');
    t.removeAttribute('contenteditable');
    s.removeAttribute('contenteditable');

    // Restaurar estilos de pill
    p.style.backgroundColor = '';
    p.style.color = '';

    const fs = sizesFor(d.layout);
    t.style.fontSize = `${fs.title}px`; t.style.lineHeight = fs.titleLH;
    s.style.display = ''; s.style.fontSize = `${fs.subtitle}px`; s.style.lineHeight = fs.subLH;
  },

  // 2. Nueva función: renderEditCard (aplica datos de 'editCardData' a la tarjeta activa)
  renderEditCard(app) {
    const cardId = app.state.active;
    if (!cardId) return;
    const c = document.getElementById(`card${cardId}`); 
    if (!c) return;

    const d = app.state.editCardData; 
    const ovs = (app.state.theme && app.state.theme.overlays)
      ? app.state.theme.overlays
      : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' };

    const imgEl = c.closest('.mockup').querySelector('.card-bg');
    if (d.bg && d.bg.length > 0) {
      const proxyUrl = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
      imgEl.src = d.bg.startsWith('data:') ? d.bg : proxyUrl;
    }
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;

    let overlayBg = ovs.black;
    if (d.overlayColor === 'white') overlayBg = ovs.white;
    else if (d.overlayColor === 'brand') overlayBg = 'rgba(204, 255, 0, 0.4)'; 
    c.querySelector('.card-overlay').style.background = overlayBg;
    c.querySelector('.card-content').className = `card-content ${d.layout}`;
    
    const p = c.querySelector('.c-pill');
    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');

    if (document.activeElement !== p) p.textContent = d.isPlaceholder ? '' : d.tag;
    if (document.activeElement !== t) t.textContent = d.isPlaceholder ? '' : d.title;
    if (document.activeElement !== s) s.textContent = d.isPlaceholder ? '' : d.subtitle;

    p.setAttribute('data-placeholder', d.defaultTag || 'TAG');
    t.setAttribute('data-placeholder', d.defaultTitle || 'TITLE');
    s.setAttribute('data-placeholder', d.defaultSubtitle || 'Subtitle');

    const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';
    const subtitleDefaultColor = d.overlayColor === 'white' ? '#333' : '#fff';
    
    t.style.color = getTextColor(d, t, brandColor, d.titleColor);
    s.style.color = getTextColor(d, s, subtitleDefaultColor, d.subtitleColor);

    // Aplicar nuevos colores de Pill
    p.style.backgroundColor = getResolvedColor(d, d.pillBgColor);
    p.style.color = getResolvedColor(d, d.pillTextColor);

    const fs = sizesFor(d.layout);
    t.style.fontSize = `${fs.title}px`; t.style.lineHeight = fs.titleLH;
    s.style.display = ''; s.style.fontSize = `${fs.subtitle}px`; s.style.lineHeight = fs.subLH;
  },

  // 3. Nueva función: updateDashboard (Actualiza los botones activos)
  updateDashboard(app) {
    const d = app.state.editCardData;
    const dash = app.els.editDashboard;
    if (!dash) return;
    
    dash.querySelectorAll('[data-variant-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.variantBtn === d.sourceVariant);
    });
    
    dash.querySelectorAll('[data-photo-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.photoBtn === d.sourcePhoto);
    });

    CARD_IDS.forEach(id => {
      const imgEl = dash.querySelector(`#dashPhotoGroup [data-photo-btn="${id}"] img`);
      if(imgEl) {
        const bg = app.state.data[id].bg;
        if(bg) {
          imgEl.src = bg.startsWith('data:') ? bg : `/api/proxy_image?url=${encodeURIComponent(bg)}`;
        } else {
          imgEl.src = ''; 
        }
      }
    });

    dash.querySelectorAll('[data-overlay-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.overlayBtn === d.overlayColor);
    });

    dash.querySelectorAll('[data-layout-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layoutBtn === d.layout);
    });
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
      c.style.transform = `scale(${scale})`;
    });
    
    const activeElement = document.activeElement;
    if (app.state.mode === 'EDIT' && activeElement && (activeElement.classList.contains('c-title') || activeElement.classList.contains('c-subtitle'))) {
        positionColorPicker(app, activeElement);
    }
  },

  handlePaste(e) {
    e.preventDefault(); 
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text); 
  },
  
  updateTextFromCard(app, el, type) {
    const newText = el.textContent; 
    let key;
    if (type === 'title') key = 'title';
    else if (type === 'subtitle') key = 'subtitle';
    else if (type === 'tag') key = 'tag';

    if (key) {
      app.updateCardData(app.state.editCardData, key, newText);
    }
  },

  // 4. Funciones de Coreografía (Reset)
  resetAnimations(app) {
    app.els.overviewGrid.classList.remove('in-edit-mode');
    app.els.editDashboard.classList.remove('is-visible');
    app.els.editDashboard.style.display = 'none';

    CARD_IDS.forEach(id => {
      const el = document.getElementById(`mock${id}`);
      if (el) {
        el.classList.remove('is-exiting', 'is-editing', 'active-stage', 'inactive');
      }
    });
    if (app.state.active) {
      this.disableEditing(app, app.state.active);
    }
    app.state.active = null;
  },

  // 5. bindEvents (dividido en dos)
  bindOverviewEvents(app) {
    ['A', 'B', 'C', 'D'].forEach(v => { 
      const el = document.getElementById(`mock${v}`);
      if (el) {
        el.onclick = () => {
          if (app.state.mode === 'APP') { 
            app.switchVar(v);
          }
        };
      }
    });
  },

  bindEditEvents(app) {
    const activeCardId = app.state.active;
    const activeMock = document.getElementById(`mock${activeCardId}`);
    if (!activeMock) return;

    // LÓGICA DEL CONTROL DE COLOR
    if (!app.els.colorPickerDot) {
        const dot = document.createElement('div');
        dot.id = 'colorPickerDot';
        dot.style.visibility = 'hidden';
        dot.style.pointerEvents = 'none'; 
        app.els.overviewGrid.appendChild(dot); 
        app.els.colorPickerDot = dot; 
        
        dot.addEventListener('mousedown', (e) => {
            e.preventDefault(); 
            const targetField = e.currentTarget.getAttribute('data-target-field');
            const currentColor = app.state.editCardData[targetField + 'Color'];
            const currentIndex = COLOR_OPTIONS.findIndex(c => c === currentColor);
            const nextColor = COLOR_OPTIONS[(currentIndex + 1) % COLOR_OPTIONS.length];
            
            app.updateCardColor(targetField, nextColor);
            
            const targetId = e.currentTarget.getAttribute('data-target-id');
            document.getElementById(targetId)?.focus();
            positionColorPicker(app, document.getElementById(targetId));
        });
    }

    // Listeners para campos de texto (SOLO en tarjeta activa)
    activeMock.querySelectorAll('.c-title, .c-subtitle, .c-pill').forEach(el => {
      el.setAttribute('contenteditable', 'true'); // HABILITAR EDICIÓN
      el.id = el.id || (`editable-${activeCardId}-` + Math.random().toString(36).substring(2, 9)); 
      
      let type;
      if (el.classList.contains('c-title')) type = 'title';
      else if (el.classList.contains('c-subtitle')) type = 'subtitle';
      else if (el.classList.contains('c-pill')) type = 'tag';
      
      const isColorEditable = (type === 'title' || type === 'subtitle');

      el.onfocus = () => {
        if (isColorEditable) {
          app.els.colorPickerDot.style.pointerEvents = 'auto'; 
          positionColorPicker(app, el);
        }
      };

      el.onblur = () => {
        this.updateTextFromCard(app, el, type);
        
        if (isColorEditable) {
          setTimeout(() => {
              const nextFocusedElement = document.activeElement;
              if (app.els.colorPickerDot && nextFocusedElement !== app.els.colorPickerDot && !el.contains(nextFocusedElement)) {
                  app.els.colorPickerDot.style.visibility = 'hidden';
                  app.els.colorPickerDot.style.pointerEvents = 'none'; 
              }
          }, 50);
        }
      };
      
      el.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); 
          el.blur(); 
        }
      };
      
      el.onpaste = (e) => {
        this.handlePaste(e);
      };
    });

    // Listeners para el Pill (Fondo y Texto)
    const editPill = activeMock.querySelector('.c-pill');
    if (editPill) {
      editPill.onclick = () => {
        const d = app.state.editCardData;
        const currentIndex = PILL_BG_OPTIONS.findIndex(c => c === d.pillBgColor);
        d.pillBgColor = PILL_BG_OPTIONS[(currentIndex + 1) % PILL_BG_OPTIONS.length];
        this.renderEditCard(app);
      };
      editPill.oncontextmenu = (e) => {
        e.preventDefault();
        const d = app.state.editCardData;
        const currentIndex = PILL_TEXT_OPTIONS.findIndex(c => c === d.pillTextColor);
        d.pillTextColor = PILL_TEXT_OPTIONS[(currentIndex + 1) % PILL_TEXT_OPTIONS.length];
        this.renderEditCard(app);
      };
    }

    // Listeners para el Dashboard
    const dash = app.els.editDashboard;
    if (dash) {
      dash.querySelectorAll('[data-variant-btn]').forEach(btn => {
        btn.onclick = () => {
          const variantId = btn.dataset.variantBtn;
          app.state.editCardData.title = app.state.data[variantId].title;
          app.state.editCardData.subtitle = app.state.data[variantId].subtitle;
          app.state.editCardData.sourceVariant = variantId;
          this.renderEditCard(app);
          this.updateDashboard(app);
        };
      });
      dash.querySelectorAll('[data-photo-btn]').forEach(btn => {
        btn.onclick = () => {
          const photoId = btn.dataset.photoBtn;
          app.state.editCardData.bg = app.state.data[photoId].bg;
          app.state.editCardData.sourcePhoto = photoId;
          this.renderEditCard(app);
          this.updateDashboard(app);
        };
      });
      dash.querySelectorAll('[data-overlay-btn]').forEach(btn => {
        btn.onclick = () => {
          app.state.editCardData.overlayColor = btn.dataset.overlayBtn;
          this.renderEditCard(app);
          this.updateDashboard(app);
        };
      });
      dash.querySelectorAll('[data-layout-btn]').forEach(btn => {
        btn.onclick = () => {
          app.state.editCardData.layout = btn.dataset.layoutBtn;
          this.renderEditCard(app);
          this.updateDashboard(app);
        };
      });
    }
  },

  disableEditing(app, cardId) {
    if (!cardId) return;
    const activeMock = document.getElementById(`mock${cardId}`);
    if (!activeMock) return;

    // Quitar listeners de texto/pill
    activeMock.querySelectorAll('.c-title, .c-subtitle, .c-pill').forEach(el => {
      el.removeAttribute('contenteditable');
      el.onfocus = null;
      el.onblur = null;
      el.onkeydown = null;
      el.onpaste = null;
      el.onclick = null;
      el.oncontextmenu = null;
    });
  }
};
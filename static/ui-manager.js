// static/ui-manager.js

// --- CORRECCIÓN: "toast" AÑADIDO A LA IMPORTACIÓN ---
import { CARD_IDS, LAYOUTS, OVERLAYS, toast } from './utils.js';

const CARD_W = 1080;
const CARD_H = 1440;
const CARD_PADDING = 80;

const FIXED_FS = {
  'layout-standard': { title: 84, subtitle: 32, titleLH: 0.98, subLH: 1.15 },
  'layout-centered': { title: 92, subtitle: 36, titleLH: 0.98, subLH: 1.15 },
  'layout-bold': { title: 110, subtitle: 34, titleLH: 0.95, subLH: 1.15 },
  'layout-chatgptricks': { title: 140, subtitle: 0, titleLH: 0.9, subLH: 1 }
};

const COLOR_OPTIONS = ['brand', 'white', 'black'];

function sizesFor(layout) {
  return FIXED_FS[layout] || FIXED_FS['layout-standard'];
}

// --- Helper para convertir color a RGBA con opacidad ---
function colorToRgba(color, opacityPercent, customHex) {
  const opacity = (parseFloat(opacityPercent) || 0) / 100;
  let rgb = '0,0,0'; // Default a negro

  if (color === 'black') {
    rgb = '0,0,0';
  } else if (color === 'white') {
    rgb = '255,255,255'; // BLANCO PURO
  } else if (color === 'brand') {
    rgb = '204, 255, 0'; // De 'app.js'
  } else if (color === 'custom' && isValidHex(customHex)) {
    let hex = customHex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    rgb = `${r},${g},${b}`;
  }

  return `rgba(${rgb}, ${opacity})`;
}

function getResolvedColor(d, stateColor) {
  const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';
  switch (stateColor) {
    case 'brand': return brandColor;
    case 'white': return '#FFF';
    case 'black': return '#000';
    default: return stateColor; // Permitir colores HEX
  }
}

function getTextColor(d, element, defaultColor, stateColor) {
  // Busca el nodo de texto
  const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
  const text = textNode ? textNode.nodeValue : '';
  const isPlaceholder = (text.trim() === '' && element.dataset.placeholder);

  if (isPlaceholder) return defaultColor;
  return getResolvedColor(d, stateColor);
}

// --- Helper de actualización de texto segura ---
function safeUpdateText(el, newText) {
  if (!el) return;
  let textNode = null;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      textNode = node;
      break;
    }
  }
  if (textNode) {
    textNode.nodeValue = newText;
  } else {
    // Si no hay nodo de texto, crearlo (y ponerlo antes de las bolitas)
    el.prepend(document.createTextNode(newText));
  }
}

// --- Helper para Sentence Case ---
function toSentenceCase(str) {
  if (!str) return '';
  // Capitaliza la primera letra y pone el RESTO en minúsculas
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// --- Helper para actualizar el estado desde los <select> de texto ---
function updateTextFromVariant(app, field, selectValue) {
  const d = app.state.editCardData;
  const newText = app.state.data[selectValue][field];
  d[field] = newText;
  d.sourceVariant[field] = selectValue;

  const activeCardId = app.state.active;
  const cardEl = document.getElementById(`card${activeCardId}`);
  if (cardEl) {
    const textEl = cardEl.querySelector(field === 'title' ? '.c-title' : '.c-subtitle');
    safeUpdateText(textEl, newText); // Usar la actualización segura
  }

  d.isPlaceholder = (d.title.trim() === '' && d.subtitle.trim() === '');
  UIManager.renderEditCard(app);
}

function isValidHex(hex) {
  return /^#([0-9A-F]{3}){1,2}$/i.test(hex);
}


export const UIManager = {
  // --- RENDERING CORE ---

  // 1. renderCard (Vista Overview)
  renderCard(app, v, tid = `card${v}`) {
    const c = document.getElementById(tid);
    if (!c) return;

    const d = app.state.data[v];

    const imgEl = c.closest('.mockup').querySelector('.card-bg');
    if (d.bg && d.bg.length > 0) {
      const proxyUrl = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
      imgEl.src = d.bg.startsWith('data:') ? d.bg : proxyUrl;
    } else {
      imgEl.src = '';
    }

    // --- FILTROS ACTUALIZADOS (con grayscale) ---
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%) brightness(${d.brightness}%) grayscale(${d.grayscale}%)`;

    // --- OVERLAY ACTUALIZADO (con opacidad) ---
    c.querySelector('.card-overlay').style.background = colorToRgba(d.overlayColor, d.overlayOpacity, d.customOverlayColor);

    c.querySelector('.card-content').className = `card-content ${d.layout}`;

    const p = c.querySelector('.c-pill');
    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');

    // Limpiar contenido antiguo (incluyendo bolitas de color de un render anterior)
    p.innerHTML = '';
    t.innerHTML = '';
    s.innerHTML = '';

    p.appendChild(document.createTextNode(d.isPlaceholder ? '' : d.tag));
    t.appendChild(document.createTextNode(d.isPlaceholder ? '' : d.title));
    s.appendChild(document.createTextNode(d.isPlaceholder ? '' : d.subtitle));

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

    p.style.backgroundColor = getResolvedColor(d, d.pillBgColor);
    p.style.color = getResolvedColor(d, d.pillTextColor);
    p.style.display = (d.isPlaceholder || !d.tag || d.tag.trim() === '') ? 'none' : 'flex';

    const fs = sizesFor(d.layout);
    t.style.fontSize = `${fs.title}px`; t.style.lineHeight = fs.titleLH;
    s.style.display = ''; s.style.fontSize = `${fs.subtitle}px`; s.style.lineHeight = fs.subLH;
  },

  // 2. renderEditCard (Aplica datos de 'editCardData' a la tarjeta activa)
  renderEditCard(app) {
    const cardId = app.state.active;
    if (!cardId) return;
    const c = document.getElementById(`card${cardId}`);
    if (!c) return;

    const d = app.state.editCardData;

    const imgEl = c.closest('.mockup').querySelector('.card-bg');
    if (d.bg && d.bg.length > 0) {
      const proxyUrl = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
      imgEl.src = d.bg.startsWith('data:') ? d.bg : proxyUrl;
    }

    // --- FILTROS ACTUALIZADOS (con grayscale) ---
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%) brightness(${d.brightness}%) grayscale(${d.grayscale}%)`;

    // --- OVERLAY ACTUALIZADO (con opacidad) ---
    c.querySelector('.card-overlay').style.background = colorToRgba(d.overlayColor, d.overlayOpacity, d.customOverlayColor);

    c.querySelector('.card-content').className = `card-content ${d.layout}`;

    const p = c.querySelector('.c-pill');
    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');

    // Actualizar texto solo si no está enfocado
    if (document.activeElement !== p) safeUpdateText(p, d.isPlaceholder ? '' : d.tag);
    if (document.activeElement !== t) safeUpdateText(t, d.isPlaceholder ? '' : d.title);
    if (document.activeElement !== s) safeUpdateText(s, d.isPlaceholder ? '' : d.subtitle);

    p.setAttribute('data-placeholder', d.defaultTag || 'TAG');
    t.setAttribute('data-placeholder', d.defaultTitle || 'TITLE');
    s.setAttribute('data-placeholder', d.defaultSubtitle || 'Subtitle');

    const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';
    const subtitleDefaultColor = d.overlayColor === 'white' ? '#333' : '#fff';

    t.style.color = getTextColor(d, t, brandColor, d.titleColor);
    s.style.color = getTextColor(d, s, subtitleDefaultColor, d.subtitleColor);

    p.style.backgroundColor = getResolvedColor(d, d.pillBgColor);
    p.style.color = getResolvedColor(d, d.pillTextColor);
    p.style.display = d.showTag ? 'flex' : 'none';

    const fs = sizesFor(d.layout);
    t.style.fontSize = `${fs.title}px`; t.style.lineHeight = fs.titleLH;
    s.style.display = ''; s.style.fontSize = `${fs.subtitle}px`; s.style.lineHeight = fs.subLH;

    this.updateColorDots(app, c.closest('.mockup'));
  },

  // --- FUNCIÓN DE BOLITAS DE COLOR ACTUALIZADA ---
  updateColorDots(app, activeMock) {
    if (!activeMock) return;
    const d = app.state.editCardData;

    const titleDot = activeMock.querySelector('.colorPickerDot[data-target="titleColor"]');
    if (titleDot) titleDot.style.backgroundColor = getResolvedColor(d, d.titleColor);

    const subtitleDot = activeMock.querySelector('.colorPickerDot[data-target="subtitleColor"]');
    if (subtitleDot) subtitleDot.style.backgroundColor = getResolvedColor(d, d.subtitleColor);

    const pillBgDot = activeMock.querySelector('.colorPickerDot[data-target="pillBgColor"]');
    if (pillBgDot) pillBgDot.style.backgroundColor = getResolvedColor(d, d.pillBgColor);

    const pillTextDot = activeMock.querySelector('.colorPickerDot[data-target="pillTextColor"]');
    if (pillTextDot) pillTextDot.style.backgroundColor = getResolvedColor(d, d.pillTextColor);
  },

  // 3. updateDashboard (Actualizado)
  updateDashboard(app) {
    const d = app.state.editCardData;
    const dash = app.els.editDashboard;
    if (!dash) return;

    const titleSelect = dash.querySelector('#titleSelect');
    const subtitleSelect = dash.querySelector('#subtitleSelect');

    // --- 1. Dinamizar Dropdowns (SOLO SE HACE UNA VEZ) ---
    if (titleSelect.options.length === 0) {
      CARD_IDS.forEach(id => {
        const data = app.state.data[id];

        const titleOpt = document.createElement('option');
        titleOpt.value = id;
        // --- "Sentence case" y 24 caracteres ---
        let titleText = toSentenceCase(data.title || data.defaultTitle || 'Variant ' + id);
        titleOpt.textContent = titleText.substring(0, 24) + (titleText.length > 24 ? '...' : '');
        titleSelect.appendChild(titleOpt);

        const subtitleOpt = document.createElement('option');
        subtitleOpt.value = id;
        // --- "Sentence case" y 24 caracteres ---
        let subtitleText = toSentenceCase(data.subtitle || data.defaultSubtitle || 'Subtitle ' + id);
        subtitleOpt.textContent = subtitleText.substring(0, 24) + (subtitleText.length > 24 ? '...' : '');
        subtitleSelect.appendChild(subtitleOpt);
      });
    }

    // --- 2. Sincronizar Selects (CON LÓGICA DE PRE-SELECCIÓN) ---
    if (d.sourceVariant?.title === 'custom') {
      titleSelect.selectedIndex = -1; // Deseleccionar
    } else {
      titleSelect.value = d.sourceVariant?.title; // Seleccionar A, B, C, o D
    }

    if (d.sourceVariant?.subtitle === 'custom') {
      subtitleSelect.selectedIndex = -1;
    } else {
      subtitleSelect.value = d.sourceVariant?.subtitle;
    }

    // --- 3. Sincronizar el resto de controles ---

    // Sincronizar Botones de Foto
    dash.querySelectorAll('[data-photo-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.photoBtn === d.sourcePhoto);
    });

    // Rellenar miniaturas de fotos
    CARD_IDS.forEach(id => {
      const imgEl = dash.querySelector(`#dashPhotoGroup [data-photo-btn="${id}"] img`);
      if (imgEl) {
        const bg = app.state.data[id].bg;
        if (bg) {
          imgEl.src = bg.startsWith('data:') ? bg : `/api/proxy_image?url=${encodeURIComponent(bg)}`;
        } else {
          imgEl.src = '';
        }
      }
    });

    // Sincronizar Botones de Layout
    dash.querySelectorAll('[data-layout-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layoutBtn === d.layout);
    });

    // Sincronizar Toggle de Tag
    dash.querySelector('#tagToggle').checked = d.showTag;

    // Sincronizar Botones de Overlay
    let activeOverlay = d.overlayColor;
    if (isValidHex(activeOverlay)) {
      activeOverlay = 'custom';
      d.customOverlayColor = d.overlayColor;
    }

    dash.querySelectorAll('[data-overlay-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.overlayBtn === activeOverlay);
    });

    // --- LÓGICA DEL BOTÓN ARCOÍRIS ---
    const customBtn = dash.querySelector('[data-overlay-btn="custom"]');
    if (activeOverlay === 'custom') {
      customBtn.classList.remove('rainbow-bg');
      customBtn.style.backgroundColor = d.customOverlayColor;
    } else {
      customBtn.classList.add('rainbow-bg');
      customBtn.style.backgroundColor = '';
    }

    // --- SINCRONIZAR NUEVO SLIDER DE OPACIDAD ---
    dash.querySelector('#overlayOpacitySlider').value = d.overlayOpacity;

    // Sincronizar Color Picker y HEX Input
    const colorPicker = dash.querySelector('#overlayColorPicker');
    const hexInput = dash.querySelector('#overlayHexInput');
    const color = d.customOverlayColor || '#CCFF00';

    colorPicker.value = color;
    hexInput.value = color;

    // --- SINCRONIZAR SLIDERS (con grayscale) ---
    dash.querySelector('#contrastSlider').value = d.contrast;
    dash.querySelector('#brightnessSlider').value = d.brightness;
    dash.querySelector('#blurSlider').value = d.blur;
    dash.querySelector('#grayscaleSlider').value = d.grayscale || 0;
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

    // Scale carousel slides
    for (let i = 1; i <= 5; i++) {
      const w = document.getElementById(`mountCarousel${i}`);
      const c = w?.querySelector('.carousel-render-target');
      if (!w || !c) continue;
      const scale = Math.min(w.clientWidth / CARD_W, w.clientHeight / CARD_H);
      c.style.transform = `scale(${scale})`;
    }

    // Scale carousel caption
    const captionMount = document.getElementById('mountCarouselCaption');
    const captionWrapper = captionMount?.querySelector('.canvas-wrapper');
    if (captionMount && captionWrapper) {
      const scale = Math.min(captionMount.clientWidth / CARD_W, captionMount.clientHeight / CARD_H);
      captionWrapper.style.transform = `scale(${scale})`;
    }
  },

  handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  },

  updateTextFromCard(app, el, type) {
    // Leer el texto del primer nodo de texto
    const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    const newText = textNode ? textNode.nodeValue : '';

    let key;
    if (type === 'title') key = 'title';
    else if (type === 'subtitle') key = 'subtitle';
    else if (type === 'tag') key = 'tag';

    if (key) {
      app.updateCardData(app.state.editCardData, key, newText);

      if (type === 'title' || type === 'subtitle') {
        app.state.editCardData.sourceVariant[type] = 'custom';
        this.updateDashboard(app);
      }
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

  // 6. bindEditEvents (REESCRITO para bolitas de color)
  bindEditEvents(app) {
    const activeCardId = app.state.active;
    const activeMock = document.getElementById(`mock${activeCardId}`);
    if (!activeMock) return;

    // --- LÓGICA DE BOLITAS DE COLOR ---
    const createDot = (targetField) => {
      const dot = document.createElement('div');
      dot.className = 'colorPickerDot';
      dot.dataset.target = targetField;

      dot.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const d = app.state.editCardData;
        const currentColor = d[targetField];
        const currentIndex = COLOR_OPTIONS.findIndex(c => c === currentColor);
        const nextColor = COLOR_OPTIONS[(currentIndex + 1) % COLOR_OPTIONS.length];

        app.updateCardColor(targetField, nextColor);
      };
      return dot;
    };

    // --- Listeners para campos de texto ---
    activeMock.querySelectorAll('.c-title, .c-subtitle, .c-pill').forEach(el => {
      el.setAttribute('contenteditable', 'true');
      el.id = el.id || (`editable-${activeCardId}-` + Math.random().toString(36).substring(2, 9));

      let type;
      if (el.classList.contains('c-title')) {
        type = 'title';
        if (!el.querySelector('.colorPickerDot')) {
          el.appendChild(createDot('titleColor'));
        }
      }
      else if (el.classList.contains('c-subtitle')) {
        type = 'subtitle';
        if (!el.querySelector('.colorPickerDot')) {
          el.appendChild(createDot('subtitleColor'));
        }
      }
      else if (el.classList.contains('c-pill')) {
        type = 'tag';
        if (!el.querySelector('.colorPickerDot')) {
          el.appendChild(createDot('pillBgColor'));
          el.appendChild(createDot('pillTextColor'));
        }
      }

      el.onfocus = null;
      el.onblur = () => {
        this.updateTextFromCard(app, el, type);
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

    this.updateColorDots(app, activeMock);


    // --- Listeners para el Dashboard ---
    const dash = app.els.editDashboard;
    if (dash) {

      // 1. Selects de Texto (mitad izquierda)
      dash.querySelector('#titleSelect').onchange = (e) => {
        updateTextFromVariant(app, 'title', e.target.value);
      };
      dash.querySelector('#subtitleSelect').onchange = (e) => {
        updateTextFromVariant(app, 'subtitle', e.target.value);
      };

      // 2. Botones de Foto (mitad izquierda)
      dash.querySelectorAll('[data-photo-btn]').forEach(btn => {
        btn.onclick = () => {
          const photoId = btn.dataset.photoBtn;
          app.state.editCardData.bg = app.state.data[photoId].bg;
          app.state.editCardData.sourcePhoto = photoId;
          this.renderEditCard(app);
          this.updateDashboard(app);
        };
      });

      // 3. Uploader de Archivo (mitad izquierda)
      dash.querySelector('#fileUpload').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            app.state.editCardData.bg = event.target.result;
            app.state.editCardData.sourcePhoto = 'custom';
            this.renderEditCard(app);
            this.updateDashboard(app);
          };
          reader.readAsDataURL(file);
        }
      };

      // --- 4. BOTÓN DE DESCARGA (mitad izquierda) ---
      if (app.els.downloadBtn) { // Asegurarse de que el botón exista
        app.els.downloadBtn.onclick = () => {
          this.downloadCard(app);
        };
      }

      // 5. Botones de Layout (mitad derecha)
      dash.querySelectorAll('[data-layout-btn]').forEach(btn => {
        btn.onclick = () => {
          app.state.editCardData.layout = btn.dataset.layoutBtn;
          this.renderEditCard(app);
          this.updateDashboard(app);
        };
      });

      // 6. Toggle de Tag (mitad derecha)
      dash.querySelector('#tagToggle').onchange = (e) => {
        app.state.editCardData.showTag = e.target.checked;
        this.renderEditCard(app);
      };

      // 7. Botones de Overlay (mitad derecha)
      dash.querySelectorAll('[data-overlay-btn]').forEach(btn => {
        if (btn.dataset.overlayBtn !== 'custom') {
          btn.onclick = () => {
            app.state.editCardData.overlayColor = btn.dataset.overlayBtn;
            this.renderEditCard(app);
            this.updateDashboard(app);
          };
        }
      });

      // 8. Input de Opacidad (AHORA ES SLIDER)
      dash.querySelector('#overlayOpacitySlider').oninput = (e) => {
        app.state.editCardData.overlayOpacity = e.target.value;
        this.renderEditCard(app);
      };

      // 9. Custom Color Picker (mitad derecha)
      const colorPicker = dash.querySelector('#overlayColorPicker');
      const hexInput = dash.querySelector('#overlayHexInput');

      colorPicker.oninput = (e) => {
        app.state.editCardData.overlayColor = 'custom';
        app.state.editCardData.customOverlayColor = e.target.value;
        hexInput.value = e.target.value;
        this.renderEditCard(app);
        this.updateDashboard(app);
      };

      hexInput.onchange = (e) => {
        if (isValidHex(e.target.value)) {
          app.state.editCardData.overlayColor = 'custom';
          app.state.editCardData.customOverlayColor = e.target.value;
          colorPicker.value = e.target.value;
          this.renderEditCard(app);
          this.updateDashboard(app);
        } else {
          hexInput.value = app.state.editCardData.customOverlayColor;
        }
      };

      // 10. Sliders 2x2 (mitad derecha, con grayscale)
      dash.querySelector('#contrastSlider').oninput = (e) => {
        app.state.editCardData.contrast = e.target.value;
        this.renderEditCard(app);
      };
      dash.querySelector('#brightnessSlider').oninput = (e) => {
        app.state.editCardData.brightness = e.target.value;
        this.renderEditCard(app);
      };
      dash.querySelector('#blurSlider').oninput = (e) => {
        app.state.editCardData.blur = e.target.value;
        this.renderEditCard(app);
      };
      dash.querySelector('#grayscaleSlider').oninput = (e) => {
        app.state.editCardData.grayscale = e.target.value;
        this.renderEditCard(app);
      };

    }
  },

  disableEditing(app, cardId) {
    if (!cardId) return;
    const activeMock = document.getElementById(`mock${cardId}`);
    if (!activeMock) return;

    // --- QUITAR BOLITAS DE COLOR ---
    activeMock.querySelectorAll('.colorPickerDot').forEach(dot => dot.remove());

    // Quitar listeners de texto/pill
    activeMock.querySelectorAll('.c-title, .c-subtitle, .c-pill').forEach(el => {
      el.removeAttribute('contenteditable');
      el.onfocus = null;
      el.onblur = null;
      el.onkeydown = null;
      el.onpaste = null;

      // Limpiar el contenido para que solo quede el nodo de texto
      safeUpdateText(el, el.textContent.trim());
    });

    // Limpiar dropdowns para la próxima vez
    const dash = app.els.editDashboard;
    if (dash) {
      dash.querySelector('#titleSelect').innerHTML = '';
      dash.querySelector('#subtitleSelect').innerHTML = '';
    }
  },

  // --- FUNCIÓN DE DESCARGA (MODIFICADA) ---
  async downloadCard(app) {
    const cardId = app.state.active;
    if (!cardId) {
      toast("No active card selected.", "error");
      return;
    }

    const element = document.getElementById(`card${cardId}`);
    if (!element) {
      toast("Card element not found.", "error");
      return;
    }

    toast("Generating HD image... please wait.", "info");

    // Ocultar temporalmente las bolitas de color
    element.querySelectorAll('.colorPickerDot').forEach(dot => dot.style.display = 'none');

    // === INICIO DE LA MODIFICACIÓN (escalado + artefacto) ===

    // 1. Guardar la transformación original del elemento
    const originalTransform = element.style.transform;

    // 2. Guardar estilos originales del tag y eliminarlos temporalmente
    const pillElement = element.querySelector('.c-pill');
    let originalPillShadow = '';
    let originalPillFilter = '';

    if (pillElement) {
      originalPillShadow = pillElement.style.boxShadow;
      originalPillFilter = pillElement.style.filter;
      pillElement.style.boxShadow = 'none';
      pillElement.style.filter = 'none';
    }

    // 3. Forzar escala 1:1 para la captura
    element.style.transform = 'scale(1)';
    // === FIN DE LA MODIFICACIÓN ===

    try {

      const canvas = await html2canvas(element, {
        useCORS: true,
        width: 1080,          // Forzar ancho de renderizado
        height: 1440,         // Forzar alto de renderizado
        scale: 1,             // 1:1 pixel ratio
        backgroundColor: '#000',
        logging: false
      });

      // Convertir el canvas resultante a Data URL
      const dataUrl = canvas.toDataURL('image/png');

      // Crear enlace y descargar
      const link = document.createElement('a');
      link.download = `sentient-card-${cardId}.png`;
      link.href = dataUrl;
      link.click();

    } catch (err) {
      console.error('Download failed', err);
      toast('Error generating image. Check console.', 'error');
    } finally {
      // === INICIO DE LA MODIFICACIÓN (restaurar) ===

      // 4. Restaurar la transformación original
      element.style.transform = originalTransform;

      // 5. Restaurar estilos originales del tag
      if (pillElement) {
        pillElement.style.boxShadow = originalPillShadow;
        pillElement.style.filter = originalPillFilter;
      }
      // === FIN DE LA MODIFICACIÓN (restaurar) ===

      // Volver a mostrar las bolitas de color
      element.querySelectorAll('.colorPickerDot').forEach(dot => {
        dot.style.display = '';
      });
    }
  }

};
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

const COLOR_OPTIONS = ['brand', 'white', 'black'];

function sizesFor(layout) {
  return FIXED_FS[layout] || FIXED_FS['layout-standard'];
}

// Función auxiliar para traducir la cadena de estado a un valor CSS
function getResolvedColor(d, stateColor) {
    // Determinar el color 'brand' con la excepción de layout-chatgptricks
    const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';

    switch (stateColor) {
        case 'brand': return brandColor;
        case 'white': return '#FFF';
        case 'black': return '#000';
        default: return brandColor; // Fallback
    }
}

// Función para obtener el valor CSS del color
function getTextColor(d, element, defaultColor, stateColor) {
    // Si el texto está vacío, usamos el color por defecto
    if (d.isPlaceholder && element.textContent === '') return defaultColor; 

    return getResolvedColor(d, stateColor);
}

// Función para posicionar la bolita
function positionColorPicker(app, el) {
    const rect = el.getBoundingClientRect();
    const stageRect = app.els.appStage.getBoundingClientRect();
    
    if (!app.els.colorPickerDot) return;

    // Calcular la posición relativa a la etapa de la aplicación
    const offsetX = rect.right - stageRect.left;
    const offsetY = rect.top - stageRect.top;
    
    // Ajustar el desplazamiento (Tamaño de la bolita 20px, con 10px de margen)
    const dotSize = 20; 
    const margin = 10;
    
    // Posición: Esquina superior derecha del campo + un margen negativo
    app.els.colorPickerDot.style.left = `${offsetX - dotSize / 2 + margin}px`; 
    app.els.colorPickerDot.style.top = `${offsetY - margin}px`;
    
    // Actualizar el color de la bolita para reflejar el estado actual
    const isTitle = el.classList.contains('c-title');
    const targetField = isTitle ? 'title' : 'subtitle';
    const colorState = app.state.data[app.state.active][targetField + 'Color'];
    
    app.els.colorPickerDot.setAttribute('data-color', colorState);
    app.els.colorPickerDot.style.visibility = 'visible';
    
    // Adjuntar datos al elemento para el manejo del clic
    app.els.colorPickerDot.setAttribute('data-target-id', el.id);
    app.els.colorPickerDot.setAttribute('data-target-field', targetField);
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
      // Usar el proxy local para mayor estabilidad de carga.
      const proxyUrl = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
      imgEl.src = d.bg.startsWith('data:') ? d.bg : proxyUrl;
    } else {
      imgEl.src = '';
    }
    imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;

    // Overlay / Layout (Aplica para A, B, C, D)
    c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? ovs.white : ovs.black;
    c.querySelector('.card-content').className = `card-content ${d.layout}`;
    
    // Lógica de Placeholder y contenido
    const p = c.querySelector('.c-pill');
    const t = c.querySelector('.c-title');
    const s = c.querySelector('.c-subtitle');

    // 1. Asignar atributos de placeholder (para CSS)
    p.setAttribute('data-placeholder', d.defaultTag || 'TAG');
    t.setAttribute('data-placeholder', d.defaultTitle || 'TITLE');
    s.setAttribute('data-placeholder', d.defaultSubtitle || 'Subtitle');
    
    // 2. Poner el texto o dejarlo vacío para que :empty funcione
    // Protección de foco para evitar sobrescribir el texto que se está editando
    if (document.activeElement !== p) p.textContent = d.isPlaceholder ? '' : d.tag;
    if (document.activeElement !== t) t.textContent = d.isPlaceholder ? '' : d.title;
    if (document.activeElement !== s) s.textContent = d.isPlaceholder ? '' : d.subtitle;

    // 3. Quitar la clase .is-placeholder (ya no la usamos)
    p.classList.remove('is-placeholder');
    t.classList.remove('is-placeholder');
    s.classList.remove('is-placeholder');

    // Colores y edición
    const brandColor = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : 'var(--brand)';
    const subtitleDefaultColor = d.overlayColor === 'white' ? '#333' : '#fff';
    
    t.style.color = getTextColor(d, t, brandColor, d.titleColor);
    s.style.color = getTextColor(d, s, subtitleDefaultColor, d.subtitleColor);

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
    
    // REPOSICIONAR LA BOLITA SI ALGÚN ELEMENTO ESTÁ ACTIVO
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.classList.contains('c-title') || activeElement.classList.contains('c-subtitle'))) {
        positionColorPicker(app, activeElement);
    }
  },

  // Soluciona Ctrl+V pegando solo texto plano
  handlePaste(e) {
    e.preventDefault(); // Detener el pegado por defecto
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text); // Insertar solo el texto
  },
  
  // Guarda el dato en el estado de la App
  updateTextFromCard(app, el, type) {
    const v = el.closest('.mockup').id.replace('mock', '');
    
    const newText = el.textContent; 

    let key;
    if (type === 'title') key = 'title';
    else if (type === 'subtitle') key = 'subtitle';
    else if (type === 'tag') key = 'tag';

    if (key) {
      // Guardar el texto en el estado de la App.
      app.updateCardData(v, key, newText);
    }
  },

  // --- UI/EVENT LOGIC ---
  bindEvents(app) {
    
    // Enlazar eventos para A, B, C, D
    ['A', 'B', 'C', 'D'].forEach(v => { 
      const el = document.getElementById(`mock${v}`);
      if (el) el.onclick = () => app.switchVar(v);
    });

    // --- EVENTOS DE CONTROLES (blur, contrast, iUrl, iFile) ELIMINADOS ---

    // LÓGICA DEL CONTROL DE COLOR (SE MANTIENE)
    
    // 1. Crear el elemento UNA VEZ
    if (!app.els.colorPickerDot) {
        const dot = document.createElement('div');
        dot.id = 'colorPickerDot';
        dot.style.visibility = 'hidden';
        dot.style.pointerEvents = 'none'; // Inicialmente no interactivo
        app.els.appStage.style.position = 'relative'; 
        app.els.appStage.appendChild(dot);
        app.els.colorPickerDot = dot; 
        
        // 2. Adjuntar el listener de clic/mousedown a la bolita
        dot.addEventListener('mousedown', (e) => {
            // CORRECCIÓN CRÍTICA: Prevenir el evento blur del campo de texto
            e.preventDefault(); 
            
            const targetId = e.currentTarget.getAttribute('data-target-id');
            const targetField = e.currentTarget.getAttribute('data-target-field');
            const el = document.getElementById(targetId);
            if (!el) return;

            const cardId = app.state.active;
            const currentColor = app.state.data[cardId][targetField + 'Color'];
            const currentIndex = COLOR_OPTIONS.findIndex(c => c === currentColor);
            const nextIndex = (currentIndex + 1) % COLOR_OPTIONS.length;
            const nextColor = COLOR_OPTIONS[nextIndex];
            
            // Actualizar el estado de la App, lo que llama a renderCard
            app.updateCardColor(cardId, targetField, nextColor);
            
            // Re-foco y reposicionamiento para asegurar el estado visual
            el.focus(); 
            positionColorPicker(app, el);
        });
    }

    // 3. Adjuntar listeners de focus/blur a los campos de texto
    document.querySelectorAll('.c-title, .c-subtitle, .c-pill').forEach(el => {
      
      el.id = el.id || ('editable-' + Math.random().toString(36).substring(2, 9)); // Asegurar que tenga ID
      
      let type;
      if (el.classList.contains('c-title')) type = 'title';
      else if (el.classList.contains('c-subtitle')) type = 'subtitle';
      else if (el.classList.contains('c-pill')) type = 'tag';
      
      const isColorEditable = (type === 'title' || type === 'subtitle');

      // Escuchador de foco
      if (isColorEditable) {
          el.addEventListener('focus', () => {
              // Posicionar y mostrar la bolita
              app.els.colorPickerDot.style.pointerEvents = 'auto'; // Habilitar clic
              positionColorPicker(app, el);
          });
      }

      // Escuchador de blur (para guardar y ocultar)
      el.addEventListener('blur', () => {
        // 1. Guardar el estado
        this.updateTextFromCard(app, el, type);
        
        // 2. Ocultar la bolita.
        // Usamos un pequeño timeout de seguridad para la transición de foco
        setTimeout(() => {
            const nextFocusedElement = document.activeElement;
            if (isColorEditable && app.els.colorPickerDot && nextFocusedElement !== app.els.colorPickerDot && !el.contains(nextFocusedElement)) {
                app.els.colorPickerDot.style.visibility = 'hidden';
                app.els.colorPickerDot.style.pointerEvents = 'none'; // Deshabilitar clic
            }
        }, 50); 
      });
      
      // 2. Evitar saltos de línea y forzar 'blur' (Guardar) con Enter
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); 
          el.blur(); 
        }
      });
      
      // 3. Forzar pegado de texto plano
      el.addEventListener('paste', (e) => {
        this.handlePaste(e);
      });
    });
  },
  
  positionControls(app) { /* noop */ }
};
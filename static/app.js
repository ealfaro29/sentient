// static/app.js
import { DataHandler } from './data-handler.js';
import { UIManager } from './ui-manager.js';
import { CARD_IDS, toast } from './utils.js'; 
import { Animation } from './animation.js'; 

const SENTIENT_THEME = {
  name: 'Sentient (Default)',
  id: 'default',
  cssVariables: {
    '--brand': '#CCFF00',
    '--bg-main': '#000000',
    '--bg-panel': '#0a0a0a',
    '--border': '#262626',
    '--text': '#e4e4e7',
    '--text-dim': '#71717a'
  },
  fontConfig: {
    cardBodyFont: "'Inter', sans-serif",
    headlineFont: "'Inter', sans-serif",
    fontWeight: '800'
  },
  overlays: { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' },
  defaultLayouts: { A: 'layout-standard', B: 'layout-centered', C: 'layout-bold' }
};

const App = {
  state: {
    active: 'A',
    mode: 'LANDING',
    theme: {},
    url: '', 
    data: {
      A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...', defaultTag: 'NEWS' },
      B: { title: 'SET',   subtitle: 'Choose variant...',       bg: '', tag: 'STORY',    layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET',   defaultSubtitle: 'Choose variant...', defaultTag: 'STORY' },
      C: { title: 'GO',    subtitle: 'Customize & export.',     bg: '', tag: 'BREAKING', layout: 'layout-bold',     caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO',    defaultSubtitle: 'Customize & export.', defaultTag: 'BREAKING' },
      D: { title: 'GIGA', subtitle: 'Analyze & Synthesize.', bg: '', tag: 'NERD',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GIGA', defaultSubtitle: 'Analyze & Synthesize.', defaultTag: 'NERD' } 
    }
  },

  async init() {
    this.cacheDOM();
    UIManager.bindEvents(this); // <-- UIManager ahora se encarga de todo
    this.applyTheme();
    Animation.init(this); 
    
    // Listener para el botón de cierre manual (la 'X')
    this.els.closeFallbackBtn?.addEventListener('click', () => {
      this.closeFallbackModal();
      this.setAppState('LANDING'); // Vuelve al landing si se cancela
    });

    // Listener para el fondo (backdrop) del modal
    this.els.fbModal?.addEventListener('click', (e) => {
      // Si el clic es SOBRE el fondo (fbModal) y NO sobre sus hijos (el cuadro de contenido)
      if (e.target === this.els.fbModal) {
        this.closeFallbackModal();
        this.setAppState('LANDING'); // Vuelve al landing si se cancela
      }
    });

    await DataHandler.loadInitialPlaceholders(this);
    this.setAppState('LANDING');
    window.addEventListener('resize', () => {
      UIManager.fitStage(this);
    });
  },
  
  closeFallbackModal() {
    if (this.els.fbModal) {
      this.els.fbModal.classList.add('hidden');
    }
  },
  
  restartWithUrl(url) {
    if (!url) return;
    
    // Cierra el modal y vuelve a LANDING
    this.closeFallbackModal();
    this.setAppState('LANDING');
    
    setTimeout(() => {
      if (this.els.url) {
        this.els.url.value = url; 
      }
      Animation.start(true); 
    }, 100); 
  },

  cacheDOM() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      // IDs del nuevo landing
      landing: $('landing'),
      logo: $('logo'),
      url: $('url'),
      magic: $('magic'),
      fusion: $('fusion'),
      morphPill: $('morphPill'),
      particles: $('particles'),
      host: $('host'), 

      // IDs de la App (conservados)
      topControlBar: $('topControlBar'),
      appStage: $('appStage'),
      dl: $('dlBtn'), 
      iUrl: $('imgUrlInput'),
      iFile: $('imgFileInput'),
      imgFileBtn: $('imgFileBtn'),
      blur: $('blurRange'),
      contrast: $('contrastRange'),
      activeControls: $('activeControls'),
      layoutBtn: $('layoutBtn'),
      layoutValue: $('layoutValue'),
      overlayBtn: $('overlayBtn'),
      overlayValue: $('overlayValue'),
      stageGrid: document.querySelector('.stage-grid'),
      
      // Modal de Fallback
      fbModal: $('fallbackModal'),
      fbList: $('fallbackList'),
      fbMsg: $('fbMsg'),
      fbGoogle: $('googleFallbackBtn'),
      closeFallbackBtn: $('closeFallbackBtn'), 
    };
  },

  setAppState(mode) {
    this.state.mode = mode;

    const showTop = (mode === 'APP' || mode === 'LOADING');
    this.els.topControlBar.classList.toggle('hidden', !showTop);
    this.els.topControlBar.classList.toggle('flex', showTop);

    if (mode === 'LANDING') {
      // Mostrar nuevos elementos del landing
      if (this.els.landing) {
        this.els.landing.style.display = 'flex';
        this.els.landing.style.opacity = '1';
        this.els.landing.style.pointerEvents = 'auto';
      }
      if (this.els.logo) this.els.logo.style.opacity = '1';
      if (this.els.fusion) this.els.fusion.style.visibility = 'visible';
      
      // Ocultar modal de fallback si estuviera abierto
      this.closeFallbackModal(); 
      
      // Ocultar app stage
      this.els.appStage.classList.add('opacity-0', 'pointer-events-none');
      this.els.activeControls?.classList.remove('is-visible');
      
      // Resetear tarjetas
      ['A','B','C','D'].forEach(v => {
        const el = document.getElementById(`mock${v}`);
        el?.classList.remove('visible-card','active-stage','inactive');
      });

    } else if (mode === 'LOADING') {
      // La animación (runMorph) se encarga de la UI
      // Ocultamos el landing, pero appStage sigue oculto
      this.els.appStage.classList.add('opacity-0', 'pointer-events-none');
      if (this.els.landing) {
          this.els.landing.style.opacity = '0';
          this.els.landing.style.pointerEvents = 'none';
      }
      
    } else if (mode === 'APP') {
      // Ocultar landing (la animación ya debería haberlo hecho)
      if (this.els.landing) {
          this.els.landing.style.display = 'none';
      }
      if (this.els.logo) this.els.logo.style.opacity = '0';

      // Ocultar modal de fallback
      this.closeFallbackModal(); 

      // Mostrar app stage
      this.els.appStage.classList.remove('opacity-0', 'pointer-events-none');
      
      UIManager.updateTopControlBar?.(this, this.state.url);
      UIManager.renderAll(this);
    }
  },

  applyTheme() {
    const t = SENTIENT_THEME;
    this.state.theme = t;
    document.body.className = t.id;
    const root = document.documentElement;
    const hex = t.cssVariables['--brand'].replace('#','');
    const r = parseInt(hex.length===3?hex[0]+hex[0]:hex.slice(0,2),16);
    const g = parseInt(hex.length===3?hex[1]+hex[1]:hex.slice(2,4),16);
    const b = parseInt(hex.length===3?hex[2]+hex[2]:hex.slice(4,6),16);
    root.style.setProperty('--brand-rgb', `${r}, ${g}, ${b}`);
    Object.entries(t.cssVariables).forEach(([k,v]) => root.style.setProperty(k,v));
    root.style.setProperty('--font-card-body', t.fontConfig.cardBodyFont);
    root.style.setProperty('--font-headline', t.fontConfig.headlineFont);
    root.style.setProperty('--font-headline-weight', t.fontConfig.fontWeight);
  },

  updateTopControlBar(url, onDownload) {
    if (this.els?.dl) this.els.dl.onclick = () => this.downloadHD();
    if (typeof onDownload === 'function') this.els?.dl && (this.els.dl.onclick = onDownload);
  },

  // ===== INICIO DE LA CORRECCIÓN =====
  // Esta es la *única* función que UIManager llamará para guardar datos.
  updateCardData(cardId, field, newText) {
    if (this.state.data[cardId]) {
      this.state.data[cardId][field] = newText;
      // También borramos el placeholder si el texto ya no está vacío
      if (newText.trim() !== '') {
        this.state.data[cardId].isPlaceholder = false;
      } else {
        // Si el usuario borró todo, marcamos que es un placeholder
        // para que la lógica de CSS (en style.css) pueda mostrar el default.
        this.state.data[cardId].isPlaceholder = true;
      }
    }
  },
  // ===== FIN DE LA CORRECCIÓN =====

  renderCard(v) { UIManager.renderCard(this, v, `card${v}`); },
  renderAll() { UIManager.renderAll(this); },

  switchVar(v) {
    if (!CARD_IDS.includes(v)) return;
    this.state.active = v;
    UIManager.renderAll(this);
    
    // Oculta la barra de opciones
    // this.els.activeControls?.classList.add('is-visible'); 

    const ids = ['A','B','C','D'];
    [document.getElementById('mockA'),
     document.getElementById('mockB'),
     document.getElementById('mockC'),
     document.getElementById('mockD')].forEach((m, idx) => {
      if (!m) return;
      const id = ids[idx];
      const isActive = id === v;
      m.classList.toggle('active-stage', isActive);
      m.classList.toggle('inactive', !isActive);
    });
  },

  // Funciones de manejo de texto ELIMINADAS de aquí.

  async downloadHD() {
    const v = this.state.active;
    const source = document.getElementById(`card${v}`);
    if (!source || !window.htmlToImage) return;

    const styles = Array.from(document.styleSheets);
    const toggled = [];
    styles.forEach(ss => {
      try { 
        const href = ss.href;
        if (href && new URL(href, location.href).origin !== location.origin) { ss.disabled = true; toggled.push(ss); }
      } catch { ss.disabled = true; toggled.push(ss); }
    });

    const off = document.createElement('div');
    off.style.position = 'fixed';
    off.style.left = '-99999px';
    off.style.top = '0';
    off.style.width = '1080px';
    off.style.height = '1350px';
    off.style.zIndex = '-1';
    document.body.appendChild(off);

    const clone = source.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.width = '1080px';
    clone.style.height = '1350px';
    clone.id = 'hd-render-card';
    off.appendChild(clone);

    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-main')?.trim() || '#000000';
      const blob = await window.htmlToImage.toBlob(clone, {
        width: 1080, height: 1350, cacheBust: true, backgroundColor: bg, pixelRatio: 2
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentient-${v}.jpg`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      console.error('Export error:', e);
    } finally {
      document.body.removeChild(off);
      toggled.forEach(ss => { ss.disabled = false; });
    }
  }
};

window.App = App;
export { App };
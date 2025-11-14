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
    appStep: 'pick_cover', 
    theme: {},
    url: '', 
    data: {
      A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...', defaultTag: 'NEWS', titleColor: 'brand', subtitleColor: 'white' },
      B: { title: 'SET',   subtitle: 'Choose variant...',       bg: '', tag: 'STORY',    layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET',   defaultSubtitle: 'Choose variant...', defaultTag: 'STORY', titleColor: 'brand', subtitleColor: 'white' },
      C: { title: 'GO',    subtitle: 'Customize & export.',     bg: '', tag: 'BREAKING', layout: 'layout-bold',     caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO',    defaultSubtitle: 'Customize & export.', defaultTag: 'BREAKING', titleColor: 'brand', subtitleColor: 'white' },
      D: { title: 'GIGA', subtitle: 'Analyze & Synthesize.', bg: '', tag: 'NERD',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GIGA', defaultSubtitle: 'Analyze & Synthesize.', defaultTag: 'NERD', titleColor: 'brand', subtitleColor: 'white' } 
    }
  },

  async init() {
    this.cacheDOM();
    UIManager.bindEvents(this); 
    this.applyTheme();
    Animation.init(this); 
    
    this.setAppState('LANDING');
    window.addEventListener('resize', () => {
      UIManager.fitStage(this);
    });
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
      breadcrumbs: $('breadcrumbs'), 

      // IDs de la App (conservados)
      topControlBar: $('topControlBar'),
      appStage: $('appStage'),
      dl: null, 
      nextBtn: $('nextBtn'), 
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
      
      // Nuevo Elemento para el control de color
      colorPickerDot: $('colorPickerDot'),
    };
  },

  setAppState(mode) {
    this.state.mode = mode;

    const showTop = (mode === 'APP' || mode === 'LOADING');
    this.els.topControlBar.classList.toggle('hidden', !showTop);
    this.els.topControlBar.classList.toggle('flex', showTop); 

    // --- INICIO DE MODIFICACIÓN ---
    // 1. Lógica de 'hidden'/'block' para #host ELIMINADA
    //    La visibilidad ahora se controla con la clase '.visible' y opacidad
    // --- FIN DE MODIFICACIÓN ---

    if (mode === 'LANDING') {
      if (this.els.landing) {
        this.els.landing.style.display = 'flex';
        this.els.landing.style.opacity = '1';
        this.els.landing.style.pointerEvents = 'auto';
      }
      if (this.els.logo) this.els.logo.style.opacity = '1';
      if (this.els.fusion) this.els.fusion.style.visibility = 'visible';
      
      this.els.appStage.classList.add('opacity-0', 'pointer-events-none');
      this.els.activeControls?.classList.remove('is-visible');
      
      ['A','B','C','D'].forEach(v => {
        const el = document.getElementById(`mock${v}`);
        el?.classList.remove('visible-card','active-stage','inactive');
      });
      
      this.els.breadcrumbs?.classList.remove('visible');
      this.els.nextBtn?.classList.remove('visible');
      // 2. Añadido reseteo para #host
      this.els.host?.classList.remove('visible'); 

    } else if (mode === 'LOADING') {
      this.els.appStage.classList.add('opacity-0', 'pointer-events-none');
      if (this.els.landing) {
          this.els.landing.style.opacity = '0';
          this.els.landing.style.pointerEvents = 'none';
      }
      
    } else if (mode === 'APP') {
      if (this.els.landing) {
          this.els.landing.style.display = 'none';
      }
      if (this.els.logo) this.els.logo.style.opacity = '0';

      this.els.appStage.classList.remove('opacity-0', 'pointer-events-none');
      
      this.renderBreadcrumbs(); 
      UIManager.updateTopControlBar?.(this, this.state.url); 
      UIManager.renderAll(this);
    }
  },

  applyTheme() {
    // (Esta función no cambia)
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

  updateTopControlBar(url) {
    // (Esta función no cambia)
    if (this.els?.host) {
      let displayUrl = url.replace(/^(https:\/\/|http:\/\/|www\.)/,'');
      if (displayUrl.endsWith('/')) {
        displayUrl = displayUrl.slice(0, -1);
      }
      
      this.els.host.textContent = displayUrl; 
      this.els.host.href = url; 
    }

    if (this.els?.nextBtn) {
      this.els.nextBtn.onclick = () => {
        console.log("Botón Next presionado. Estado actual:", this.state.appStep);
        // Lógica futura para avanzar el breadcrumb
      };
    }
  },

  renderBreadcrumbs() {
    // (Esta función no cambia)
    if (!this.els.breadcrumbs) return;
    const steps = this.els.breadcrumbs.querySelectorAll('.breadcrumb-step');
    const currentStep = this.state.appStep;
    
    steps.forEach(span => {
      span.classList.toggle('active', span.dataset.step === currentStep);
    });
  },

  updateCardColor(cardId, field, newColor) {
    // (Esta función no cambia)
    const colorField = field + 'Color';
    if (this.state.data[cardId] && this.state.data[cardId][colorField] !== undefined) {
      this.state.data[cardId][colorField] = newColor;
      UIManager.renderCard(this, cardId); 
    }
  },

  updateCardData(cardId, field, newText) {
    // (Esta función no cambia)
    if (this.state.data[cardId]) {
      this.state.data[cardId][field] = newText;
      if (newText.trim() !== '') {
        this.state.data[cardId].isPlaceholder = false;
      } else {
        this.state.data[cardId].isPlaceholder = true;
      }
    }
  },

  renderCard(v) { UIManager.renderCard(this, v, `card${v}`); },
  renderAll() { UIManager.renderAll(this); },

  switchVar(v) {
    // (Esta función no cambia)
    if (!CARD_IDS.includes(v)) return;
    this.state.active = v;
    UIManager.renderAll(this);
    
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

  async downloadHD() {
    // (Esta función no cambia)
    const v = this.state.active;
    // ...
  }
};

window.App = App;
export { App };
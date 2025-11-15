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
    active: null, 
    mode: 'LANDING',
    appStep: 'pick_cover', 
    theme: {},
    url: '', 
    data: {
      A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...', defaultTag: 'NEWS', titleColor: 'brand', subtitleColor: 'white' },
      B: { title: 'SET',   subtitle: 'Choose variant...',       bg: '', tag: 'STORY',    layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET',   defaultSubtitle: 'Choose variant...', defaultTag: 'STORY', titleColor: 'brand', subtitleColor: 'white' },
      C: { title: 'GO',    subtitle: 'Customize & export.',     bg: '', tag: 'BREAKING', layout: 'layout-bold',     caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO',    defaultSubtitle: 'Customize & export.', defaultTag: 'BREAKING', titleColor: 'brand', subtitleColor: 'white' },
      D: { title: 'GIGA', subtitle: 'Analyze & Synthesize.', bg: '', tag: 'NERD',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GIGA', defaultSubtitle: 'Analyze & Synthesize.', defaultTag: 'NERD', titleColor: 'brand', subtitleColor: 'white' } 
    },
    editCardData: {}
  },

  async init() {
    this.cacheDOM();
    // UIManager.bindEvents(this); // Movido a setAppState
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
      landing: $('landing'),
      logo: $('logo'),
      url: $('url'),
      magic: $('magic'),
      fusion: $('fusion'),
      morphPill: $('morphPill'),
      particles: $('particles'),
      host: $('host'), 
      breadcrumbs: $('breadcrumbs'), 
      topControlBar: $('topControlBar'),
      appStage: $('appStage'),
      dl: null, 
      nextBtn: $('nextBtn'), 
      
      overviewGrid: $('overviewGrid'), 
      editDashboard: $('editDashboard'),

      // (Controles ocultos, no son necesarios)
      iUrl: null, iFile: null, imgFileBtn: null, blur: null, contrast: null,
      activeControls: null, layoutBtn: null, layoutValue: null, 
      overlayBtn: null, overlayValue: null,
      
      colorPickerDot: $('colorPickerDot'),
    };
  },

  setAppState(mode) {
    this.state.mode = mode;

    const showTop = (mode === 'APP' || mode === 'EDIT' || mode === 'LOADING' || mode === 'TRANSITION');
    this.els.topControlBar.classList.toggle('hidden', !showTop);
    this.els.topControlBar.classList.toggle('flex', showTop); 

    if (mode === 'LANDING') {
      if (this.els.landing) {
        this.els.landing.style.display = 'flex';
        this.els.landing.style.opacity = '1';
        this.els.landing.style.pointerEvents = 'auto';
      }
      if (this.els.logo) this.els.logo.style.opacity = '1';
      if (this.els.fusion) this.els.fusion.style.visibility = 'visible';
      
      this.els.appStage.classList.add('opacity-0', 'pointer-events-none');
      
      this.els.breadcrumbs?.classList.remove('visible');
      this.els.nextBtn?.classList.remove('visible');
      this.els.host?.classList.remove('visible'); 

      // Resetear el modo de edición del grid
      this.els.overviewGrid.classList.remove('in-edit-mode');
      this.els.editDashboard.classList.remove('is-visible');
      this.els.editDashboard.style.display = 'none';
      CARD_IDS.forEach(id => {
        const el = document.getElementById(`mock${id}`);
        if (el) {
          el.classList.remove('is-exiting', 'is-editing', 'active-stage', 'inactive');
        }
      });

    } else if (mode === 'LOADING') {
      this.els.appStage.classList.add('opacity-0', 'pointer-events-none');
      if (this.els.landing) {
          this.els.landing.style.opacity = '0';
          this.els.landing.style.pointerEvents = 'none';
      }
      
    } else if (mode === 'APP') { // Fase 1: Overview
      if (this.els.landing) this.els.landing.style.display = 'none';
      if (this.els.logo) this.els.logo.style.opacity = '0';

      this.els.appStage.classList.remove('opacity-0', 'pointer-events-none');
      
      this.renderBreadcrumbs(); 
      // --- INICIO DE CORRECCIÓN ---
      this.updateTopControlBar(); // Error 1: Llamar a this.updateTopControlBar
      // --- FIN DE CORRECCIÓN ---
      UIManager.renderAll(this); 
      UIManager.bindOverviewEvents(this); 

    } else if (mode === 'EDIT') { // Fase 2: Edición
      this.renderBreadcrumbs(); 
      // --- INICIO DE CORRECCIÓN ---
      this.updateTopControlBar(); // Error 1: Llamar a this.updateTopControlBar
      // --- FIN DE CORRECCIÓN ---
      
      UIManager.renderEditCard(this);
      UIManager.bindEditEvents(this); 
      UIManager.updateDashboard(this);
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

  updateTopControlBar() {
    if (this.els?.host) {
      let displayUrl = (this.state.url || '').replace(/^(https:\/\/|http:\/\/|www\.)/,'');
      if (displayUrl.endsWith('/')) {
        displayUrl = displayUrl.slice(0, -1);
      }
      this.els.host.textContent = displayUrl; 
      this.els.host.href = this.state.url || '#'; 
    }

    if (this.els?.nextBtn) {
      this.els.nextBtn.onclick = () => {
        
        if (this.state.mode === 'TRANSITION') return; 

        if (this.state.appStep === 'pick_cover') {
          // --- Lógica para pasar a FASE 2 ---
          if (!this.state.active) {
            toast("Please select a card to edit first.", "warn");
            return;
          }
          
          this.state.mode = 'TRANSITION';
          
          this.state.editCardData = JSON.parse(JSON.stringify(this.state.data[this.state.active]));
          this.state.editCardData.sourceVariant = this.state.active;
          this.state.editCardData.sourcePhoto = this.state.active;
          this.state.editCardData.pillBgColor = 'brand';
          this.state.editCardData.pillTextColor = 'black';
          
          this.state.appStep = 'edit_details';
          this.renderBreadcrumbs();
          this.els.nextBtn.querySelector('span').textContent = 'Generate >';
          
          this.els.overviewGrid.classList.add('in-edit-mode');
          
          const activeCardEl = document.getElementById(`mock${this.state.active}`);
          activeCardEl.classList.add('is-editing'); 
          activeCardEl.classList.remove('active-stage'); 
          
          CARD_IDS.forEach(id => {
            if (id !== this.state.active) {
              document.getElementById(`mock${id}`).classList.add('is-exiting'); 
            }
          });
          
          this.els.editDashboard.style.display = 'block';
          setTimeout(() => { 
            this.els.editDashboard.classList.add('is-visible');
          }, 30); 
          
          setTimeout(() => {
            this.state.mode = 'EDIT';
            UIManager.renderEditCard(this);
            UIManager.bindEditEvents(this); 
            UIManager.updateDashboard(this);
          }, 700); 

        } else if (this.state.appStep === 'edit_details') {
          console.log("Avanzando a Fase 3 (Carousel)");
          toast("Fase 3 (Carousel) aún no implementada.");
        }
      };
    }
  },

  renderBreadcrumbs() {
    if (!this.els.breadcrumbs) return;
    const steps = this.els.breadcrumbs.querySelectorAll('.breadcrumb-step');
    const currentStep = this.state.appStep;
    
    steps.forEach(span => {
      span.classList.toggle('active', span.dataset.step === currentStep);
    });
  },

  updateCardData(cardObj, field, newText) {
    if (cardObj) {
      cardObj[field] = newText;
      cardObj.isPlaceholder = (newText.trim() === '');
    }
  },

  updateCardColor(field, newColor) {
    const colorField = field + 'Color';
    if (this.state.editCardData && this.state.editCardData[colorField] !== undefined) {
      this.state.editCardData[colorField] = newColor;
      UIManager.renderEditCard(this); 
    }
  },

  renderCard(v) { UIManager.renderCard(this, v, `card${v}`); },
  renderAll() { UIManager.renderAll(this); },

  switchVar(v) {
    if (this.state.mode !== 'APP') return; 
    if (!CARD_IDS.includes(v)) return;
    this.state.active = v; 
    
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
    const v = this.state.active;
    const source = document.getElementById(`card${v}`);
    // ...
  }
};

window.App = App;
export { App };
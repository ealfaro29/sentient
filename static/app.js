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
  overlays: { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,0.3)' },
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
      A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, brightness: 100, grayscale: 0, overlayColor: 'black', overlayOpacity: 50, isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...', defaultTag: 'NEWS', titleColor: 'brand', subtitleColor: 'white', pillBgColor: 'brand', pillTextColor: 'black' },
      B: { title: 'SET',   subtitle: 'Choose variant...',       bg: '', tag: 'STORY',    layout: 'layout-centered', caption: '', blur: 0, contrast: 100, brightness: 100, grayscale: 0, overlayColor: 'black', overlayOpacity: 50, isPlaceholder: true, defaultTitle: 'SET',   defaultSubtitle: 'Choose variant...', defaultTag: 'STORY', titleColor: 'brand', subtitleColor: 'white', pillBgColor: 'brand', pillTextColor: 'black' },
      C: { title: 'GO',    subtitle: 'Customize & export.',     bg: '', tag: 'BREAKING', layout: 'layout-bold',     caption: '', blur: 0, contrast: 100, brightness: 100, grayscale: 0, overlayColor: 'black', overlayOpacity: 50, isPlaceholder: true, defaultTitle: 'GO',    defaultSubtitle: 'Customize & export.', defaultTag: 'BREAKING', titleColor: 'brand', subtitleColor: 'white', pillBgColor: 'brand', pillTextColor: 'black' },
      D: { title: 'GIGA', subtitle: 'Analyze & Synthesize.', bg: '', tag: 'NERD',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, brightness: 100, grayscale: 0, overlayColor: 'black', overlayOpacity: 50, isPlaceholder: true, defaultTitle: 'GIGA', defaultSubtitle: 'Analyze & Synthesize.', defaultTag: 'NERD', titleColor: 'brand', subtitleColor: 'white', pillBgColor: 'brand', pillTextColor: 'black' } 
    },
    editCardData: {}
  },

  async init() {
    this.cacheDOM();
    this.applyTheme();
    Animation.init(this); 
    
    // Vincular el botón de retroceso UNA VEZ
    this.bindBackButton();
    
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
      backBtn: $('backBtn'), // <-- BOTÓN "BACK" AÑADIDO
      
      overviewGrid: $('overviewGrid'), 
      editDashboard: $('editDashboard'),

      colorPickerDot: null, // Obsoleto
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
      this.els.backBtn?.classList.add('is-hidden'); // Ocultar Back

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
      this.updateTopControlBar(); 
      UIManager.renderAll(this); 
      UIManager.bindOverviewEvents(this); 

    } else if (mode === 'EDIT') { // Fase 2: Edición
      this.renderBreadcrumbs(); 
      this.updateTopControlBar(); 
      
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

  // --- FUNCIÓN DEL BOTÓN "BACK" ---
  bindBackButton() {
    if (this.els?.backBtn) {
      this.els.backBtn.onclick = () => {
        if (this.state.mode === 'TRANSITION') return; 
        
        this.state.mode = 'TRANSITION';
        
        // Ejecutar la animación de reseteo
        UIManager.resetAnimations(this); 
        
        // Actualizar el estado de la app
        this.state.appStep = 'pick_cover';
        this.renderBreadcrumbs();
        this.els.nextBtn.querySelector('span').textContent = 'Next >';
        this.els.backBtn.classList.add('is-hidden');
        
        // Esperar a que la animación termine para cambiar al estado APP
        setTimeout(() => {
          this.setAppState('APP');
        }, 700); // 700ms es la duración de la animación del grid
      };
    }
  },

  updateTopControlBar() {
    if (this.els?.host) {
      // --- HOST ESTÁTICO Y NO CLICKABLE ---
      this.els.host.textContent = "sentient.io"; 
      this.els.host.href = '#'; 
      this.els.host.onclick = (e) => e.preventDefault();
    }
    
    // 1. Mostrar/Ocultar Botón "Back"
    if (this.state.appStep === 'edit_details') {
      this.els.backBtn.classList.remove('is-hidden');
    } else {
      this.els.backBtn.classList.add('is-hidden');
    }

    // 2. Lógica del Botón "Next"
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
          
          this.state.editCardData.sourceVariant = {
            title: this.state.active,
            subtitle: this.state.active
          };
          
          this.state.editCardData.sourcePhoto = this.state.active;
          this.state.editCardData.showTag = this.state.editCardData.tag.trim().length > 0;
          this.state.editCardData.customOverlayColor = '#CCFF00'; // Default
          
          this.state.appStep = 'edit_details';
          this.renderBreadcrumbs();
          this.els.nextBtn.querySelector('span').textContent = 'Generate >';
          this.els.backBtn.classList.remove('is-hidden'); // Mostrar Back
          
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
            this.setAppState('EDIT'); // Cambiar a setAppState
          }, 700); 

        } else if (this.state.appStep === 'edit_details') {
          console.log("Avanzando a Fase 3 (Carousel)");
          toast("Fase 3 (Carousel) aún no implementada.");
        }
      };
    }
  },

  // --- BREADCRUMBS CLICKABLES ---
  renderBreadcrumbs() {
    if (!this.els.breadcrumbs) return;
    const steps = this.els.breadcrumbs.querySelectorAll('.breadcrumb-step');
    const currentStep = this.state.appStep;
    const stepOrder = ['pick_cover', 'edit_details', 'gen_carousel', 'export'];
    const currentIndex = stepOrder.indexOf(currentStep);

    steps.forEach((span, index) => {
      span.classList.toggle('active', span.dataset.step === currentStep);
      
      if (index < currentIndex) { // Este es un paso "pasado"
        span.classList.add('clickable');
        span.onclick = () => {
          // Ir atrás a este paso
          if (span.dataset.step === 'pick_cover' && this.state.mode === 'EDIT') {
            this.els.backBtn.click(); // Simular click en el botón "Back"
          }
        };
      } else {
        span.classList.remove('clickable');
        span.onclick = null;
      }
    });
  },

  updateCardData(cardObj, field, newText) {
    if (cardObj) {
      cardObj[field] = newText;
      cardObj.isPlaceholder = (newText.trim() === '');
    }
  },

  updateCardColor(field, newColor) {
    const colorField = field; 
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
// static/app.js

import { DataHandler } from './data-handler.js';
import { UIManager } from './ui-manager.js';
import { CARD_IDS } from './utils.js';

// --- TEMA HARDCODEADO ---
const SENTIENT_THEME = {
  "name": "Sentient (Default)",
  "id": "default",
  "cssVariables": {
    "--brand": "#CCFF00",
    "--bg-main": "#000000", 
    "--bg-panel": "#0a0a0a",
    "--border": "#262626",
    "--text": "#e4e4e7",
    "--text-dim": "#71717a"
  },
  "fontConfig": {
    "cardBodyFont": "'Inter', sans-serif",
    "headlineFont": "'Inter', sans-serif",
    "fontWeight": "800"
  },
  "overlays": {
    "black": "rgba(0,0,0,0.5)",
    "white": "rgba(255,255,255,0.3)"
  },
  "defaultLayouts": {
    "A": "layout-standard",
    "B": "layout-centered",
    "C": "layout-bold"
  }
};
// -----------------------

const App = {
    state: {
        active: 'A',
        mode: 'LANDING',
        theme: {}, 
        url: '',
        data: {
            A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS', layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...' },
            B: { title: 'SET', subtitle: 'Choose variant...', bg: '', tag: 'INFO', layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET', defaultSubtitle: 'Choose variant...' },
            C: { title: 'GO', subtitle: 'Customize & export.', bg: '', tag: 'BREAKING', layout: 'layout-bold', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO', defaultSubtitle: 'Customize & export.' },
            D: { title: 'CAPTION', subtitle: 'Copy ready text.', bg: '', tag: 'TEXT', layout: 'layout-standard', caption: 'Paste an article URL to generate a caption...', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'CAPTION', defaultSubtitle: 'Copy ready text.' }
        }
    },

    async init() {
        this.cacheDOM();
        UIManager.bindEvents(this);
        this.applyTheme(); 
        await DataHandler.loadInitialPlaceholders(this); 
        this.setAppState('LANDING');

        lucide.createIcons(); 
        window.addEventListener('resize', () => { UIManager.fitStage(this); UIManager.positionControls(this); });
    },

    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            landingStage: $('landingStage'),
            landingUrl: $('landingUrlInput'), 
            scrape: $('landingScrapeBtn'),
            fusionContainer: $('fusionContainer'),
            topControlBar: $('topControlBar'), 
            loadingPill: $('loadingPill'),
            appStage: $('appStage'),
            
            // App Elements
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
            loadingBar: $('loadingBar'),
            fbModal: $('fallbackModal'), 
            fbList: $('fallbackList'), 
            fbMsg: $('fallbackMsg'), 
            fbGoogle: $('googleFallbackBtn'),
            captionTextD: $('captionTextD'),
            copyBtnD: $('copyBtnD'),
            
            landingInputWrapper: $('landingInputWrapper'),
        };
    },
    
    setAppState(mode) {
        this.state.mode = mode;
        
        // --- Lógica de Landing Stage (Barra "Fantasma") ---
        if (mode === 'LANDING') {
            this.els.landingStage.style.display = 'flex';
            this.els.landingStage.offsetHeight; 
            this.els.landingStage.classList.remove('opacity-0', 'pointer-events-none');
            this.els.landingInputWrapper.style.opacity = '1';
            this.els.scrape.style.opacity = '1';
            this.els.fusionContainer.style.display = 'flex';
        } else {
            this.els.landingStage.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                if (this.state.mode !== 'LANDING') { 
                   this.els.landingStage.style.display = 'none';
                }
            }, 500); 
        }
        // ------------------------------------

        this.els.appStage.classList.toggle('opacity-0', mode === 'LANDING');
        this.els.appStage.classList.toggle('pointer-events-none', mode === 'LANDING');
        
        // --- Lógica de Barra Superior (Progreso/URL) ---
        if (mode === 'APP' || mode === 'LOADING') {
            this.els.topControlBar.classList.remove('hidden');
            this.els.topControlBar.classList.add('flex'); 
        } else {
             this.els.topControlBar.classList.add('hidden'); 
        }
        // -------------------------------------------
        
        if (mode === 'APP') {
            UIManager.updateTopControlBar(this, this.state.url);
            UIManager.renderAll(this);
            
        } else if (mode === 'LANDING') {
            this.els.activeControls.classList.remove('is-visible');
            
            // --- Lógica de Reset (Excluyendo Card D) ---
            CARD_IDS.forEach(v => {
                const mockEl = document.getElementById(`mock${v}`);
                if (mockEl && v !== 'D') { // No ocultar Card D
                   mockEl.classList.remove('visible-card');
                }
            });
            // ---------------------------------------------
        }
    },

    applyTheme() {
        const t = SENTIENT_THEME;
        if (!t) return;
        
        this.state.theme = t; 
        document.body.className = t.id; 
        
        const root = document.documentElement;
        
        const brandColorHex = t.cssVariables['--brand'].replace('#', '');
        let r, g, b;
        if (brandColorHex.length === 3) {
            r = parseInt(brandColorHex.charAt(0) + brandColorHex.charAt(0), 16);
            g = parseInt(brandColorHex.charAt(1) + brandColorHex.charAt(1), 16);
            b = parseInt(brandColorHex.charAt(2) + brandColorHex.charAt(2), 16);
        } else if (brandColorHex.length === 6) {
            r = parseInt(brandColorHex.substring(0, 2), 16);
            g = parseInt(brandColorHex.substring(2, 4), 16);
            b = parseInt(brandColorHex.substring(4, 6), 16);
        }
        root.style.setProperty('--brand-rgb', `${r}, ${g}, ${b}`);

        for (const [k, v] of Object.entries(t.cssVariables)) {
            root.style.setProperty(k, v);
        }
        
        root.style.setProperty('--font-card-body', t.fontConfig.cardBodyFont);
        root.style.setProperty('--font-headline', t.fontConfig.headlineFont);
        root.style.setProperty('--font-headline-weight', t.fontConfig.fontWeight);
        
        ['A', 'B', 'C'].forEach(v => this.state.data[v].layout = t.defaultLayouts[v]);

        if (this.state.mode === 'APP') UIManager.switchVar(this, this.state.active);
    },
    
    // EXPOSE UI METHODS
    renderCard: function(v, tid) { UIManager.renderCard(this, v, tid); },
    switchVar: function(v) { UIManager.switchVar(this, v); },
    updateTopControlBar: function(url, downloadFn) { UIManager.updateTopControlBar(this, url, downloadFn); },
    
    // EXPOSE DATA HANDLER METHODS
    downloadHD: function() { DataHandler.downloadHD(this); },
    animateFusionAndScrape: function() { DataHandler.animateFusionAndScrape(this); },
    
    // Exposed handlers for editable content
    handleFocus: function(el, type) { UIManager.handleFocus(this, el, type); },
    handleBlur: function(el, type) { UIManager.handleBlur(this, el, type); },
    updateTextFromCard: function(el, type) { UIManager.updateTextFromCard(this, el, type); },
    copyCaption: function() { UIManager.copyCaption(this); }
};

// --- EXPOSICIÓN GLOBAL (para que módulos importados puedan acceder a métodos internos) ---
window.App = {
    init: App.init.bind(App),
    downloadHD: App.downloadHD.bind(App),
    animateFusionAndScrape: App.animateFusionAndScrape.bind(App),
    switchVar: App.switchVar.bind(App),
    copyCaption: App.copyCaption.bind(App),
    
    handleFocus: App.handleFocus.bind(App),
    handleBlur: App.handleBlur.bind(App),
    updateTextFromCard: App.updateTextFromCard.bind(App),
    
    autoFit: function(app, el, maxFs, minFs, maxHeight) {
        UIManager.autoFit(app, el, maxFs, minFs, maxHeight);
    },
    renderCard: App.renderCard.bind(App) 
};
// -------------------------------------------

// --- Se elimina el 'DOMContentLoaded' listener ---
// La app ahora es iniciada por el script de bypass en index.html
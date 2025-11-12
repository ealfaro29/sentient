// app.js

import { DataHandler } from './data-handler.js';
import { UIManager } from './ui-manager.js';
import { CARD_IDS } from './utils.js';

const App = {
    state: {
        active: 'A',
        mode: 'LANDING',
        theme: {}, 
        themes: {}, 
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
        await this.loadThemes(); 
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
            theme: $('themeSelector'),
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
        this.els.landingStage.classList.toggle('opacity-0', mode !== 'LANDING');
        this.els.landingStage.classList.toggle('pointer-events-none', mode !== 'LANDING');
        
        this.els.appStage.classList.toggle('opacity-0', mode === 'LANDING');
        this.els.appStage.classList.toggle('pointer-events-none', mode === 'LANDING');
        
        if (mode === 'APP') {
            this.els.topControlBar.classList.remove('hidden');
            this.els.topControlBar.classList.add('flex');
            UIManager.updateTopControlBar(this, this.state.url);
            this.els.activeControls.classList.add('is-visible');
            UIManager.renderAll(this);
        } else if (mode === 'LANDING') {
            this.els.topControlBar.classList.add('hidden');
            this.els.activeControls.classList.remove('is-visible');
            CARD_IDS.forEach(v => document.getElementById(`mock${v}`).classList.remove('visible-card'));
        } else if (mode === 'LOADING') {
             this.els.topControlBar.classList.remove('hidden');
             this.els.topControlBar.classList.add('flex');
        }
    },

    async loadThemes() {
        try {
            const themesToLoad = ['sentient.json', 'cyber.json', 'elegant.json', 'chatgptricks.json'];
            const responses = await Promise.all(themesToLoad.map(f => fetch(f)));
            const themesData = await Promise.all(responses.map(res => { 
                if (!res.ok) throw new Error(`Failed to load theme: ${res.url}`); 
                return res.json(); 
            }));
            
            if (this.els.theme) {
                this.els.theme.innerHTML = ''; 
                themesData.forEach(t => {
                    this.state.themes[t.id] = t; 
                    const o = document.createElement('option'); o.value = t.id; o.innerText = t.name; this.els.theme.appendChild(o);
                });
            } else {
                 themesData.forEach(t => { this.state.themes[t.id] = t; });
            }
            
            if (themesData.length > 0) this.applyTheme(themesData[0].id);

        } catch (err) { 
            console.error("Theme loader error:", err); 
            toast("Could not load themes. Check console.", "error"); 
        }
    },

    applyTheme(tid) {
        const t = this.state.themes[tid]; if (!t) return;
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

        for (const [k, v] of Object.entries(t.cssVariables)) root.style.setProperty(k, v);
        
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

// --- CORRECCIÓN CLAVE: EXPOSICIÓN GLOBAL ---
window.App = {
    init: App.init.bind(App),
    downloadHD: App.downloadHD.bind(App),
    animateFusionAndScrape: App.animateFusionAndScrape.bind(App),
    switchVar: App.switchVar.bind(App),
    copyCaption: App.copyCaption.bind(App),
    
    handleFocus: App.handleFocus.bind(App),
    handleBlur: App.handleBlur.bind(App),
    updateTextFromCard: App.updateTextFromCard.bind(App),
};
// -------------------------------------------

// Start the engine
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
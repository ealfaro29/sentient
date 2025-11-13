// static/app.js
import { DataHandler } from './data-handler.js';
import { UIManager } from './ui-manager.js';
import { CARD_IDS } from './utils.js';

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
      A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS',     layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...' },
      B: { title: 'SET',   subtitle: 'Choose variant...',       bg: '', tag: 'STORY',    layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET',   defaultSubtitle: 'Choose variant...' },
      C: { title: 'GO',    subtitle: 'Customize & export.',     bg: '', tag: 'BREAKING', layout: 'layout-bold',     caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO',    defaultSubtitle: 'Customize & export.' },
      D: { title: 'CAPTION', subtitle: 'Copy ready text.',      bg: '', tag: 'TEXT',     layout: 'layout-standard', caption: 'Paste an article URL to generate a caption...', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'CAPTION', defaultSubtitle: 'Copy ready text.' }
    }
  },

  async init() {
    this.cacheDOM();
    UIManager.bindEvents(this);
    this.applyTheme();
    await DataHandler.loadInitialPlaceholders(this);
    this.setAppState('LANDING');
    window.lucide?.createIcons?.();
    window.addEventListener('resize', () => {
      UIManager.fitStage(this);
      UIManager.positionControls?.(this);
    });
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
      fbModal: $('fallbackModal'),
      fbList: $('fallbackList'),
      fbMsg: $('fallbackMsg'),
      fbGoogle: $('googleFallbackBtn'),
      captionTextD: $('captionTextD'),
      copyBtnD: $('copyBtnD'),
      landingInputWrapper: $('landingInputWrapper')
    };
  },

  setAppState(mode) {
    this.state.mode = mode;

    const showTop = (mode === 'APP' || mode === 'LOADING');
    this.els.topControlBar.classList.toggle('hidden', !showTop);
    this.els.topControlBar.classList.toggle('flex', showTop);

    // botón de descarga solo en APP
    if (this.els.dl) this.els.dl.style.display = (mode === 'APP') ? 'inline-flex' : 'none';

    if (mode === 'LANDING') {
      this.els.landingStage.style.display = 'flex';
      this.els.landingStage.offsetHeight;
      this.els.landingStage.classList.remove('opacity-0', 'pointer-events-none');
      this.els.landingInputWrapper.style.opacity = '1';
      this.els.scrape.style.opacity = '1';
      this.els.fusionContainer.style.display = 'flex';
      ['A','B','C','D'].forEach(v => {
        const el = document.getElementById(`mock${v}`);
        el?.classList.remove('visible-card','active-stage','inactive');
      });
    } else {
      this.els.landingStage.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => { if (this.state.mode !== 'LANDING') this.els.landingStage.style.display = 'none'; }, 500);
    }

    this.els.appStage.classList.toggle('opacity-0', mode === 'LANDING');
    this.els.appStage.classList.toggle('pointer-events-none', mode === 'LANDING');

    if (mode === 'APP') {
      UIManager.updateTopControlBar?.(this, this.state.url);
      UIManager.renderAll(this);
    } else if (mode === 'LANDING') {
      this.els.activeControls?.classList.remove('is-visible');
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
    UIManager.updateTopControlBar?.(this, url);
    if (this.els?.dl) this.els.dl.onclick = () => this.downloadHD();
    if (typeof onDownload === 'function') this.els?.dl && (this.els.dl.onclick = onDownload);
  },

  animateFusionAndScrape() { return DataHandler.animateFusionAndScrape(this); },

  renderCard(v) { UIManager.renderCard(this, v, `card${v}`); },
  renderAll() { UIManager.renderAll(this); },

  switchVar(v) {
    if (!CARD_IDS.includes(v)) return;
    this.state.active = v;
    UIManager.renderAll(this);
    this.els.activeControls?.classList.add('is-visible');

    const ids = ['A','B','C','D'];
    [document.getElementById('mockA'),
     document.getElementById('mockB'),
     document.getElementById('mockC'),
     document.getElementById('mockD')].forEach((m, idx) => {
      if (!m) return;
      const id = ids[idx];
      const isActive = id === v;
      m.classList.toggle('active-stage', isActive);
      m.classList.toggle('inactive', !isActive && id !== 'D');
    });
  },

  updateTextFromCard(el, type) { UIManager.updateTextFromCard(this, el, type); },
  handleFocus(el, type) { UIManager.handleFocus(this, el, type); },
  handleBlur(el, type) { UIManager.handleBlur(this, el, type); },

  async downloadHD() {
    // Export nítido: clonado offscreen a 1080×1350 sin transformaciones
    const v = this.state.active;
    const source = document.getElementById(`card${v}`);
    if (!source || !window.htmlToImage) return;

    // Desactivar stylesheets cross-origin
    const styles = Array.from(document.styleSheets);
    const toggled = [];
    styles.forEach(ss => {
      try { /* eslint-disable no-unused-expressions */ ss.cssRules; /* eslint-enable */ 
        const href = ss.href;
        if (href && new URL(href, location.href).origin !== location.origin) { ss.disabled = true; toggled.push(ss); }
      } catch { ss.disabled = true; toggled.push(ss); }
    });

    // Clonar offscreen
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

const STORAGE_KEY = 'sentient_v5_state';

// Simulamos la carga del JSON. En producción: fetch('sentient.json').then(r => r.json())
const DEFAULT_CONFIG = {
    theme: {
        colors: { accent: "#CCFF00", bg: "#09090b", panel: "#111113", border: "#2b2b30" },
        fonts: { googleFontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap", primary: "'Inter', sans-serif" }
    },
    defaults: { tagText: "LATEST", initialHeadline: "YOUR HEADLINE\nGOES HERE" },
    layouts: [
        { id: 0, name: "Standard", container: ["justify-end", "items-start", "text-left"], pill: ["mb-8"] },
        { id: 1, name: "Centered", container: ["justify-center", "items-center", "text-center"], pill: ["mb-8"] },
        { id: 2, name: "Bold Top", container: ["justify-start", "items-start", "text-left", "pt-[140px]"], pill: ["order-last", "mt-12", "mb-0"] }
    ]
};

const App = {
    config: null,
    state: {
        graphics: { bgDataUrl: '', overlayMode: 'off', logoMode: 'accent', logoPos: 'tr', tagVisible: true, tagText: '' },
        content: { title: '', subtitle: '', subtitleColor: '#D4D4D4' },
        layoutIdx: 0
    },
    els: {},

    async init() {
        await this.loadConfig();
        this.applyTheme();
        this.cacheDOM();
        this.loadState(); // Load previous user state from localstorage
        this.bindEvents();
        this.render();
        this.initResizeHandler();
        lucide.createIcons();
    },

    async loadConfig() {
        // Here you would normally do: this.config = await fetch('sentient.json').then(r => r.json());
        this.config = DEFAULT_CONFIG;
        // Set initial state defaults from config if not loading from storage
        if(!localStorage.getItem(STORAGE_KEY)) {
             this.state.graphics.tagText = this.config.defaults.tagText;
             this.state.content.title = this.config.defaults.initialHeadline;
        }
    },

    applyTheme() {
        // Inject config colors into CSS variables
        const root = document.documentElement;
        const c = this.config.theme.colors;
        root.style.setProperty('--accent', c.accent);
        root.style.setProperty('--bg', c.bg);
        root.style.setProperty('--panel', c.panel);
        root.style.setProperty('--border', c.border);
        root.style.setProperty('--font-primary', this.config.theme.fonts.primary);

        // Load fonts dynamically
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = this.config.theme.fonts.googleFontUrl;
        document.head.appendChild(link);
    },

    cacheDOM() {
        const $ = (s) => document.querySelector(s);
        const $$ = (s) => document.querySelectorAll(s);
        this.els = {
            bgUpload: $('#bgUpload'), tagText: $('#tagText'), tagToggle: $('#tagToggle'),
            titleInput: $('#titleInput'), subtitleInput: $('#subtitleInput'),
            thumb: $('#thumb'), background: $('#background'), overlay: $('#overlay'),
            logoContainer: $('#logoContainer'), logoMask: $('#logoMask'),
            pill: $('#pill'), pillText: $('#pillText'),
            title: $('#title'), subtitle: $('#subtitle'), layout: $('#contentLayout'),
            overlayRadios: $$('input[name="overlay"]'),
            logoModeRadios: $$('input[name="logoMode"]'),
            logoPosRadios: $$('input[name="logoPos"]'),
            subtitleColorRadios: $$('input[name="subtitleColor"]'),
            templateName: $('#templateName'),
            previewMount: $('#previewMount'), cardScaleWrap: $('#cardScaleWrap')
        };
    },

    bindEvents() {
        this.els.bgUpload.addEventListener('change', (e) => this.handleImage(e.target));
        this.els.tagText.addEventListener('input', (e) => this.setState('graphics.tagText', e.target.value));
        this.els.titleInput.addEventListener('input', (e) => this.setState('content.title', e.target.value));
        this.els.subtitleInput.addEventListener('input', (e) => this.setState('content.subtitle', e.target.value));
        this.els.tagToggle.addEventListener('change', (e) => this.setState('graphics.tagVisible', e.target.checked));
        
        const bindRadio = (radios, path) => radios.forEach(r => r.addEventListener('change', (e) => this.setState(path, e.target.value)));
        bindRadio(this.els.overlayRadios, 'graphics.overlayMode');
        bindRadio(this.els.logoModeRadios, 'graphics.logoMode');
        bindRadio(this.els.logoPosRadios, 'graphics.logoPos');
        bindRadio(this.els.subtitleColorRadios, 'content.subtitleColor');

        document.getElementById('templateBtn').onclick = () => this.cycleLayout();
        document.getElementById('downloadBtn').onclick = () => this.download();
    },

    setState(path, val) {
        let target = this.state;
        const parts = path.split('.');
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = val;
        this.render();
        this.saveState();
    },

    render() {
        const s = this.state;
        const e = this.els;

        // Sync Inputs
        e.tagText.value = s.graphics.tagText;
        e.tagToggle.checked = s.graphics.tagVisible;
        e.titleInput.value = s.content.title;
        e.subtitleInput.value = s.content.subtitle;
        this.syncRadios(e.overlayRadios, s.graphics.overlayMode);
        this.syncRadios(e.logoModeRadios, s.graphics.logoMode);
        this.syncRadios(e.logoPosRadios, s.graphics.logoPos);
        this.syncRadios(e.subtitleColorRadios, s.content.subtitleColor);

        // Render Graphics
        e.background.src = s.graphics.bgDataUrl || '';
        e.background.classList.toggle('opacity-0', !s.graphics.bgDataUrl);
        e.overlay.style.opacity = s.graphics.overlayMode === 'off' ? '0' : '0.75';
        e.overlay.style.backgroundColor = s.graphics.overlayMode; // 'black' or 'white' works directly as color

        // Render Logo
        e.logoContainer.style.opacity = s.graphics.logoMode === 'off' ? '0' : '1';
        this.updateLogoPos(s.graphics.logoPos);
        e.logoMask.style.backgroundColor = s.graphics.logoMode === 'accent' ? 'var(--accent)' : s.graphics.logoMode;

        // Render Tag
        e.pill.style.opacity = s.graphics.tagVisible ? '1' : '0';
        e.pill.style.transform = s.graphics.tagVisible ? 'scale(1)' : 'scale(0.8)';
        e.pillText.textContent = s.graphics.tagText;
        e.tagText.disabled = !s.graphics.tagVisible;
        e.tagText.parentNode.style.opacity = s.graphics.tagVisible ? '1' : '0.5';

        // Render Text
        e.title.textContent = s.content.title;
        e.subtitle.textContent = s.content.subtitle;
        e.subtitle.style.color = s.content.subtitleColor;

        // DATA-DRIVEN LAYOUT ENGINE
        const layout = this.config.layouts[s.layoutIdx];
        e.templateName.textContent = layout.name;
        // Reset classes and apply new ones from config
        e.layout.className = 'absolute inset-0 z-10 flex flex-col p-[60px] transition-all duration-500 ' + layout.container.join(' ');
        e.pill.className = 'px-8 py-2 rounded-full font-bold tracking-wider uppercase shadow-lg inline-block bg-brand-accent transition-all duration-300 origin-left ' + layout.pill.join(' ');

        this.autoSizeTitle();
    },

    updateLogoPos(pos) {
        const s = this.els.logoContainer.style;
        s.top = pos.startsWith('t') ? '60px' : 'auto';
        s.bottom = pos.startsWith('b') ? '60px' : 'auto';
        s.left = pos.endsWith('l') ? '60px' : (pos === 'bc' ? '50%' : 'auto');
        s.right = pos.endsWith('r') ? '60px' : 'auto';
        s.transform = pos === 'bc' ? 'translateX(-50%)' : 'none';
    },

    autoSizeTitle() {
        const el = this.els.title;
        let fontSize = 120;
        el.style.fontSize = fontSize + 'px';
        // Reduce font size until it fits roughly within 350px height (approx 2.5 lines)
        while (el.scrollHeight > 350 && fontSize > 40) {
            fontSize -= 5;
            el.style.fontSize = fontSize + 'px';
        }
    },

    cycleLayout() {
        this.setState('layoutIdx', (this.state.layoutIdx + 1) % this.config.layouts.length);
    },

    handleImage(input) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => this.setState('graphics.bgDataUrl', e.target.result);
        reader.readAsDataURL(file);
    },

    syncRadios(radios, val) { radios.forEach(r => r.checked = (r.value === val)); },

    initResizeHandler() {
        const fit = () => {
            if (!this.els.previewMount.offsetParent) return;
            const PAD = 60;
            const scale = Math.min((this.els.previewMount.clientWidth - PAD) / 1080, (this.els.previewMount.clientHeight - PAD) / 1350, 1);
            this.els.cardScaleWrap.style.transform = `scale(${scale})`;
        };
        window.addEventListener('resize', fit);
        setTimeout(fit, 50); // Initial fit
    },

    async download() {
        const btn = document.getElementById('downloadBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Exporting...';
        lucide.createIcons();
        await new Promise(r => setTimeout(r, 50)); // Let UI update

        try {
            const dataUrl = await htmlToImage.toPng(this.els.thumb, { quality: 1.0, pixelRatio: 1, width: 1080, height: 1140 });
            const link = document.createElement('a');
            link.download = 'sentient-thumbnail.png';
            link.href = dataUrl;
            link.click();
        } catch (err) {
            alert('Export failed. See console.');
            console.error(err);
        } finally {
            btn.innerHTML = originalText;
            lucide.createIcons();
        }
    },

    saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch {} },
    loadState() { try { const s = localStorage.getItem(STORAGE_KEY); if (s) this.state = { ...this.state, ...JSON.parse(s) }; } catch {} }
};

document.addEventListener('DOMContentLoaded', () => App.init());
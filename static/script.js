// --- CONSTANTS ---
const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)', short: 'STD' },
    { id: 'layout-centered', name: 'Centered (Middle)', short: 'CTR' },
    { id: 'layout-bold', name: 'Bold (Top Left)', short: 'BLD' }
];

const OVERLAYS = [
    { id: 'black', short: 'B' },
    { id: 'white', short: 'W' }
];

const CARD_IDS = ['A', 'B', 'C', 'D']; // A, B, C for content, D for caption

const toast = (msg, type = 'info') => {
    Toastify({
        text: msg,
        duration: 3000,
        gravity: "top",
        position: "center",
        style: {
            background: type === 'error' ? "#ef4444" : "#CCFF00",
            color: "#000",
            fontWeight: "700",
            borderRadius: "8px",
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }
    }).showToast();
};

// --- P5.JS SKETCH (BACKGROUND ANIMATION) ---
const p5_sketch = (p) => {
    let lines = [];
    const MAX_LINES = 100;

    p.setup = () => {
        const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.parent('p5-canvas-container');
        p.strokeWeight(1);
        p.frameRate(30);
    };

    p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        lines = []; // Reset lines on resize
    };

    p.draw = () => {
        p.background('rgba(0,0,0,0.01)'); // Very light residual for trail effect
        const brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#ccff00';
        p.stroke(brandColor);

        if (lines.length < MAX_LINES && p.frameCount % 5 === 0) {
            lines.push(new Line(p.width / 2, p.height / 2));
        }

        for (let i = lines.length - 1; i >= 0; i--) {
            lines[i].update();
            lines[i].display();
            if (lines[i].isOffScreen()) {
                lines.splice(i, 1);
            }
        }
    };

    class Line {
        constructor(x, y) {
            this.pos = p.createVector(x, y);
            this.vel = p.createVector(p.random(-1, 1), p.random(-1, 1));
            this.vel.normalize();
            this.vel.mult(p.random(1, 3));
            this.length = p.random(20, 50);
            this.history = [];
            this.alpha = 255;
        }

        update() {
            this.history.push(this.pos.copy());
            this.pos.add(this.vel);

            if (this.history.length > this.length) {
                this.history.splice(0, 1);
            }
            this.alpha = p.map(p.dist(p.width / 2, p.height / 2, this.pos.x, this.pos.y), 0, p.width / 2, 255, 50);
        }

        display() {
            p.beginShape();
            for (let i = 0; i < this.history.length; i++) {
                const pos = this.history[i];
                p.vertex(pos.x, pos.y);
            }
            p.endShape();
        }

        isOffScreen() {
            return (this.pos.x < 0 || this.pos.x > p.width || this.pos.y < 0 || this.pos.y > p.height);
        }
    }
};
new p5(p5_sketch);

// --- APP CORE ---
const App = {
    state: {
        active: 'A',
        mode: 'LANDING', // 'LANDING', 'LOADING', 'APP'
        theme: {}, 
        themes: {}, 
        url: '', // The URL that was scraped
        data: {
            A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS', layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...' },
            B: { title: 'SET', subtitle: 'Choose variant...', bg: '', tag: 'INFO', layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET', defaultSubtitle: 'Choose variant...' },
            C: { title: 'GO', subtitle: 'Customize & export.', bg: '', tag: 'BREAKING', layout: 'layout-bold', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO', defaultSubtitle: 'Customize & export.' },
            D: { title: 'CAPTION', subtitle: 'Copy ready text.', bg: '', tag: 'TEXT', layout: 'layout-standard', caption: 'Paste an article URL to generate a caption...', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'CAPTION', defaultSubtitle: 'Copy ready text.' }
        }
    },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        await this.loadThemes(); 
        await this.loadInitialPlaceholders(); 
        this.setAppState('LANDING'); // Start in landing mode
        lucide.createIcons(); 
        window.addEventListener('resize', () => { this.fitStage(); this.positionControls(); });
    },

    setAppState(mode) {
        this.state.mode = mode;
        this.els.landingStage.classList.toggle('opacity-0', mode !== 'LANDING');
        this.els.landingStage.classList.toggle('pointer-events-none', mode !== 'LANDING');
        
        this.els.appStage.classList.toggle('opacity-0', mode === 'LANDING');
        this.els.appStage.classList.toggle('pointer-events-none', mode === 'LANDING');
        
        this.els.sidebar.classList.toggle('hidden', mode === 'LANDING');
        this.els.mobToggle.classList.toggle('hidden', mode === 'LANDING');

        // Initial App Stage Setup
        if (mode === 'APP') {
            this.els.topControlBar.classList.remove('hidden');
            this.els.topControlBar.classList.add('flex');
            this.updateTopControlBar(this.state.url);
            this.els.activeControls.classList.add('is-visible');
            this.renderAll();
        } else if (mode === 'LANDING') {
            this.els.topControlBar.classList.add('hidden');
            this.els.activeControls.classList.remove('is-visible');
            // Reset card visibility on returning to landing
            CARD_IDS.forEach(v => document.getElementById(`mock${v}`).classList.remove('visible-card'));
        } else if (mode === 'LOADING') {
             this.els.topControlBar.classList.remove('hidden');
             this.els.topControlBar.classList.add('flex');
        }
    },

    async loadInitialPlaceholders() {
        try {
            const res = await fetch('/api/initial_images');
            if (!res.ok) throw new Error('Failed to fetch initial images');
            const data = await res.json();
            if (data.A) this.state.data.A.bg = data.A;
            if (data.B) this.state.data.B.bg = data.B;
            if (data.C) this.state.data.C.bg = data.C;
        } catch (e) {
            console.error("Error loading initial placeholders:", e);
        }
    },

    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            // New Landing/App State Elements
            landingStage: $('landingStage'),
            landingUrl: $('landingUrlInput'), 
            scrape: $('landingScrapeBtn'),
            fusionContainer: $('fusionContainer'),
            topControlBar: $('topControlBar'),
            loadingPill: $('loadingPill'),
            appStage: $('appStage'),
            
            // Existing App Elements
            editor: $('editorPanel'), 
            dl: $('dlBtn'),
            ti: $('titleInput'), 
            sub: $('subInput'), 
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
            sidebar: $('mainSidebar'), 
            mobToggle: $('mobileToggle'),
            loadingBar: $('loadingBar'),
            fbModal: $('fallbackModal'), 
            fbList: $('fallbackList'), 
            fbMsg: $('fallbackMsg'), 
            fbGoogle: $('googleFallbackBtn'),
            subGroup: $('subtitle-control-group'), 
            // New Card D Caption Element
            captionTextD: $('captionTextD'),
            copyBtnD: $('copyBtnD')
        };
    },

    async loadThemes() {
        try {
            const themesToLoad = ['sentient.json', 'cyber.json', 'elegant.json', 'chatgptricks.json'];
            const responses = await Promise.all(themesToLoad.map(f => fetch(f)));
            const themesData = await Promise.all(responses.map(res => { 
                if (!res.ok) throw new Error(`Failed to load theme: ${res.url}`); 
                return res.json(); 
            }));
            
            this.els.theme.innerHTML = ''; 
            themesData.forEach(t => {
                this.state.themes[t.id] = t; 
                const o = document.createElement('option'); o.value = t.id; o.innerText = t.name; this.els.theme.appendChild(o);
            });
            
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

        const isChatGPTricks = tid === 'chatgptricks';
        if (this.els.subGroup) {
            this.els.subGroup.style.display = isChatGPTricks ? 'none' : 'block';
        }
        
        // Re-render only if already in the app stage
        if (this.state.mode === 'APP') this.switchVar(this.state.active);
    },

    bindEvents() {
        this.els.scrape.onclick = () => this.animateFusionAndScrape();
        this.els.landingUrl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.animateFusionAndScrape();
            }
        };
        this.els.mobToggle.onclick = () => this.els.sidebar.classList.toggle('open');
        
        // Variant activation from the mockup click
        CARD_IDS.forEach(v => document.getElementById(`mock${v}`).onclick = () => this.switchVar(v));
        this.els.theme.onchange = (e) => this.applyTheme(e.target.value);

        const up = () => this.renderCard(this.state.active);
        
        // --- MOCKUP CONTROL LOGIC ---
        this.els.layoutBtn.onclick = () => {
            const currentLayout = this.state.data[this.state.active].layout;
            const currentIndex = LAYOUTS.findIndex(l => l.id === currentLayout);
            const nextIndex = (currentIndex + 1) % LAYOUTS.length;
            
            this.state.data[this.state.active].layout = LAYOUTS[nextIndex].id;
            this.els.layoutValue.textContent = LAYOUTS[nextIndex].short;
            up();
        };

        this.els.overlayBtn.onclick = () => {
            const currentOverlay = this.state.data[this.state.active].overlayColor;
            const currentIndex = OVERLAYS.findIndex(o => o.id === currentOverlay);
            const nextIndex = (currentIndex + 1) % OVERLAYS.length;
            
            this.state.data[this.state.active].overlayColor = OVERLAYS[nextIndex].id;
            this.els.overlayValue.textContent = OVERLAYS[nextIndex].short;
            up();
        };

        this.els.iUrl.oninput = (e) => { 
            this.state.data[this.state.active].bg = e.target.value; 
            up(); 
        };
        this.els.blur.oninput = (e) => { this.state.data[this.state.active].blur = e.target.value; up(); };
        this.els.contrast.oninput = (e) => { this.state.data[this.state.active].contrast = e.target.value; up(); };

        this.els.iFile.onchange = (e) => {
            if (e.target.files?.[0]) {
                const r = new FileReader();
                r.onload = (ev) => { 
                    this.state.data[this.state.active].bg = ev.target.result; 
                    up(); 
                    this.els.iUrl.value = "(Local Image Loaded)"; 
                };
                r.readAsDataURL(e.target.files[0]);
            }
        };

        this.els.dl.onclick = () => this.downloadHD();
        this.els.copyBtnD.onclick = (e) => {
            e.stopPropagation();
            this.copyCaption();
        }
    },
    
    copyCaption() {
        const captionToCopy = this.els.captionTextD.innerText;
        navigator.clipboard.writeText(captionToCopy); 
        toast('Caption copied to clipboard!'); 
    },

    // --- ANIMATIONS & STATE TRANSITIONS ---
    animateFusionAndScrape() {
        const url = this.els.landingUrl.value.trim();
        if (!url) { toast('Please enter a URL first.', 'error'); return; }
        
        // --- FIX 1: Guard against null elements and stop execution ---
        if (!this.els.landingUrl || !this.els.scrape || !this.els.appStage) {
            console.error("Landing elements not found in cache.");
            toast("UI Error: Cannot start, please reload.", "error");
            return;
        }
        
        this.state.url = url;
        const pill = this.els.loadingPill;
        
        // 1. Get initial positions
        const inputRect = this.els.landingUrl.getBoundingClientRect();
        const btnRect = this.els.scrape.getBoundingClientRect();
        // --- FIX 2: Change selector from '.main-stage' to '#mainStage' ---
        const mainStageRect = this.els.appStage.closest('#mainStage').getBoundingClientRect(); 

        // 2. Set the loading pill to input/button size/position
        // We set position relative to mainStage for animation consistency
        pill.style.width = `${inputRect.width + btnRect.width}px`;
        pill.style.height = `${inputRect.height}px`;
        pill.style.left = `${inputRect.left - mainStageRect.left}px`;
        pill.style.top = `${inputRect.top - mainStageRect.top}px`;
        pill.style.borderRadius = `${inputRect.height}px`; // Full pill shape
        pill.style.position = 'absolute';
        pill.style.background = getComputedStyle(this.els.scrape).backgroundColor;
        pill.innerHTML = `<span class="font-extrabold text-black">ANALYZING...</span>`;
        
        // Hide original elements
        this.els.landingUrl.style.opacity = '0';
        this.els.scrape.style.opacity = '0';
        
        // Start state
        this.setAppState('LOADING'); 

        // 3. Animate to final loading state (top center)
        setTimeout(() => {
            // Force position to top bar center
            pill.style.width = '250px';
            pill.style.height = '38px';
            pill.style.left = '50%';
            pill.style.top = '30px'; 
            pill.style.transform = 'translate(-50%, 0)';
            
            // Wait for pill to reach position before setting loading class
            setTimeout(() => {
                pill.classList.add('loading-state');
                
                // Binary animation (simplified to CSS-driven text)
                pill.innerHTML = '<span class="binary-animation">10101010101010101010101010101010</span>';
                this.startBinaryAnimation();
            }, 500); // Wait for CSS transition (0.6s)

            // 4. Start scraping after animation completes
            setTimeout(() => this.scrapeContent(url), 1500); 
        }, 500); // Start of fusion move
    },
    
    startBinaryAnimation() {
        let text = this.els.loadingPill.querySelector('.binary-animation');
        let interval = setInterval(() => {
            if (this.state.mode !== 'LOADING') {
                clearInterval(interval);
                return;
            }
            const randomBinary = Array.from({ length: 30 }, () => Math.round(Math.random())).join('');
            text.textContent = randomBinary;
        }, 100);
    },

    async scrapeContent(url) {
        try {
            const res = await fetch('/api/scrape', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({url}) 
            });
            const d = await res.json(); 
            if (d.error) throw new Error(d.error);

            // Update App State
            this.setAppState('APP'); 
            
            // 1. Reset Landing UI (for future use)
            this.els.landingUrl.value = '';
            this.els.landingUrl.style.opacity = '1';
            this.els.scrape.style.opacity = '1';

            // 2. Prepare Data Structure
            const isChatGPTricks = this.state.theme.id === 'chatgptricks';
            const commonCaption = d.ai_content?.common_caption || d.original.subtitle || 'Caption not found.';
            const variants = d.ai_content?.variants || { A: { title: d.original.title, subtitle: d.original.subtitle }, B: { title: d.original.title, subtitle: d.original.subtitle }, C: { title: d.original.title, subtitle: d.original.subtitle } };

            // Apply images and caption to state (D)
            this.state.data.A.bg = d.images.a; this.state.data.A.tag = 'NEWS';
            this.state.data.B.bg = d.images.b; this.state.data.B.tag = 'STORY';
            this.state.data.C.bg = d.images.c; this.state.data.C.tag = 'BREAKING';
            this.state.data.D.caption = commonCaption;
            
            // 3. Sequential Card Fill Animation
            for (let i = 0; i < CARD_IDS.length; i++) {
                const v = CARD_IDS[i];
                await new Promise(resolve => setTimeout(resolve, 300)); // Delay between cards

                const cardData = this.state.data[v];

                if (v === 'D') { // Caption Card Logic
                    cardData.isPlaceholder = false;
                    this.els.captionTextD.innerText = cardData.caption;
                } else { // A, B, C Content Card Logic
                    cardData.isPlaceholder = false; 
                    cardData.tag = ['NEWS', 'STORY', 'BREAKING'][i];
                    cardData.title = variants[v].title.toUpperCase(); 
                    cardData.subtitle = isChatGPTricks ? '' : variants[v].subtitle;
                }

                this.renderCard(v);
                document.getElementById(`mock${v}`).classList.add('visible-card');
            }

            // 4. Update Final Top Bar
            this.updateTopControlBar(url, this.downloadHD.bind(this));

            this.switchVar('A'); // Set A as active stage
            toast('Content processed successfully!');

        } catch (e) {
            console.error("Scrape error:", e);
            this.setAppState('LANDING'); // Reset to landing state
            toast('Link unreachable or scraping failed. Try alternative source.', 'error');
            this.showFallback(url);
        }
    },
    
    updateTopControlBar(url, downloadFn = null) {
        const pill = this.els.loadingPill;
        pill.classList.remove('loading-state');
        pill.classList.add('app-state');
        
        // NEW: URL Display and Download Button logic
        let content = `<span class="url-text" title="${url}">${url}</span>`;
        
        if (downloadFn) {
            content += `<button class="download-btn" id="downloadTopBtn" onclick="App.downloadHD()"><i data-lucide="download"></i> DOWNLOAD</button>`;
        }

        pill.innerHTML = content;
        lucide.createIcons();
    },


    // --- RENDERING AND UX ---

    switchVar(v) {
        this.state.active = v;
        CARD_IDS.forEach(x => { 
            const mockEl = document.getElementById(`mock${x}`);
            const isActive = x === v;
            mockEl.classList.toggle('active-stage', isActive); 
            mockEl.classList.toggle('inactive', !isActive && x !== 'D'); // D doesn't need inactive style
            if (isActive) {
                const mockupEl = document.getElementById(`mock${x}`);
                if (mockupEl) mockupEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        });
        
        const d = this.state.data[v];
        
        // Sync textareas with active card (Sidebar is hidden in APP mode, but useful)
        this.els.ti.value = d.title; 
        this.els.sub.value = d.subtitle; 
        
        const titleEl = document.querySelector(`#card${v} .c-title`);
        const subEl = document.querySelector(`#card${v} .c-subtitle`);
        
        if (titleEl) {
            if (document.activeElement !== titleEl) titleEl.textContent = d.title;
            if (d.isPlaceholder) titleEl.classList.add('is-placeholder');
            else titleEl.classList.remove('is-placeholder');
        }
        if (subEl) {
            if (document.activeElement !== subEl) subEl.textContent = d.subtitle;
            if (d.isPlaceholder) subEl.classList.add('is-placeholder');
            else subEl.classList.remove('is-placeholder');
        }

        // Hide controls for Caption Card (D)
        const isContentCard = (v !== 'D');
        this.els.activeControls.classList.toggle('opacity-0', !isContentCard);
        this.els.activeControls.classList.toggle('pointer-events-none', !isContentCard);
        
        if (isContentCard) {
            const layoutShort = LAYOUTS.find(l => l.id === d.layout)?.short || 'ERR';
            const overlayShort = OVERLAYS.find(o => o.id === d.overlayColor)?.short || 'ERR';

            this.els.layoutValue.textContent = layoutShort;
            this.els.overlayValue.textContent = overlayShort;
            this.els.blur.value = d.blur;
            this.els.contrast.value = d.contrast;
            if (!d.bg.startsWith('data:')) {
                this.els.iUrl.value = d.bg;
            } else {
                this.els.iUrl.value = "(Local Image Loaded)";
            }
        }
        
        this.fitStage();
    },

    positionControls() {
        // Position is now fixed by Tailwind: absolute bottom-5 left-1/2 -translate-x-1/2
        this.els.stageGrid.style.transform = ''; 
    },
    
    renderCard(v, tid = `card${v}`) {
        const c = document.getElementById(tid); if (!c) return;
        const d = this.state.data[v];
        const isChatGPTricks = this.state.theme.id === 'chatgptricks';
        
        const ovs = (this.state.theme && this.state.theme.overlays) 
            ? this.state.theme.overlays 
            : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' }; 

        if (v === 'D') {
             if (this.els.captionTextD) this.els.captionTextD.innerText = d.caption;
             return;
        }

        const imgEl = c.querySelector('.card-bg');
        if (d.bg && d.bg.length > 0) {
            if (d.bg.startsWith('data:')) {
                imgEl.src = d.bg;
            } else {
                imgEl.src = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
            }
        } else {
            imgEl.src = ''; 
        }

        imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;
        c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? ovs.white : ovs.black;
        c.querySelector('.card-content').className = `card-content ${d.layout}`;
        c.querySelector('.c-pill').textContent = d.tag;
        
        const t = c.querySelector('.c-title'); 
        const s = c.querySelector('.c-subtitle');
        
        if(d.isPlaceholder) {
            t.classList.add('is-placeholder');
            s.classList.add('is-placeholder');
        } else {
            t.classList.remove('is-placeholder');
            s.classList.remove('is-placeholder');
        }
        
        t.style.color = (d.layout === 'layout-chatgptricks') ? '#FFFFFF' : (d.overlayColor === 'white' ? '#000' : 'var(--brand)');
        s.style.color = d.overlayColor === 'white' ? '#333' : '#fff';
        
        s.setAttribute('contenteditable', isChatGPTricks ? 'false' : 'true');

        if (tid.startsWith('hd-')) { 
            this.autoFit(t, isChatGPTricks ? 180 : 140, isChatGPTricks ? 80 : 70, 700); 
            this.autoFit(s, 56, 30, 400); 
        }
    },

    renderAll() { 
        CARD_IDS.forEach(v => {
            this.renderCard(v);
            const d = this.state.data[v];
            const t = document.querySelector(`#card${v} .c-title`);
            const s = document.querySelector(`#card${v} .c-subtitle`);
            const isChatGPTricks = this.state.theme.id === 'chatgptricks';
            
            if (t) t.textContent = d.title;
            if (s) s.textContent = d.subtitle;
            
            const mockEl = document.getElementById(`mock${v}`);
            const isActive = v === this.state.active;
            
            mockEl.classList.toggle('active-stage', isActive); 
            mockEl.classList.toggle('inactive', !isActive && v !== 'D');
            
            if (t && !d.isPlaceholder) this.autoFit(t, isChatGPTricks ? 180 : 120, isChatGPTricks ? 80 : 60, 650);
            if (s && !d.isPlaceholder) this.autoFit(s, 56, 30, 400);
        }); 
        this.fitStage();
    },
    
    autoFit(el, maxFs, minFs, maxHeight) { 
        let fs = maxFs; 
        el.style.fontSize = fs + 'px'; 
        while (el.scrollHeight > maxHeight && fs > minFs) { 
            fs -= 2; 
            el.style.fontSize = fs + 'px'; 
        } 
    },
    
    fitStage() { 
        CARD_IDS.forEach(v => { 
            const w = document.getElementById(`mount${v}`); 
            const c = document.getElementById(`card${v}`); 
            if (w && c) {
                // Skip scaling for the caption card (D) as it should fill its grid cell
                if (v === 'D') return;

                const scale = Math.min(w.clientWidth / 1080, w.clientHeight / 1350);
                c.style.transform = `scale(${scale})`; 
            }
        }); 
    },

    async showFallback(failedUrl) {
        // Hide the top loading bar before showing the modal
        this.els.topControlBar.classList.add('hidden');
        
        this.els.fbModal.classList.remove('hidden'); 
        this.els.fbModal.style.display = 'flex';
        this.els.fbMsg.innerHTML = 'Scraping failed. Analyzing URL to find similar sources...';
        this.els.fbList.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim);"><i data-lucide="loader-2" class="spin" style="width:32px; height:32px; opacity:0.5;"></i></div>';
        lucide.createIcons();

        try {
            const res = await fetch('/api/search_alternatives', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url: failedUrl})
            });
            const data = await res.json();

            const safeQuery = encodeURIComponent(data.query || 'latest news');
            this.els.fbGoogle.href = `https://www.google.com/search?q=${safeQuery}`;

            if (!data.results || data.results.length === 0) {
                this.els.fbMsg.innerHTML = `Couldn't find direct alternatives for <b>"${data.query}"</b>. Try the Google button below.`;
                this.els.fbList.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.6; font-style:italic;">No matches found.</div>';
                return;
            }

            this.els.fbMsg.innerHTML = `Source blocked. Here are similar articles for: <b style="color:var(--brand)">"${data.query}"</b>`;
            this.els.fbList.innerHTML = ''; 

            data.results.forEach(r => {
                const item = document.createElement('div');
                item.className = 'fallback-item';
                item.innerHTML = `
                    <div style="font-weight:700; color:var(--text); font-size:0.95rem; margin-bottom:4px; line-height:1.3;">${r.title}</div>
                    <div style="color:var(--text-dim); font-size:0.8rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${r.snippet}</div>
                    <div style="color:var(--brand); font-size:0.7rem; margin-top:6px; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.url}</div>
                `;
                
                item.onmouseover = () => { item.style.borderColor = 'var(--brand)'; item.style.background = 'rgba(255,255,255,0.05)'; };
                item.onmouseout = () => { item.style.borderColor = 'var(--border)'; item.style.background = 'rgba(0,0,0,0.3)'; };
                
                item.onclick = () => {
                    this.els.landingUrl.value = r.url; // Use landing URL input for retry
                    this.els.fbModal.style.display = 'none';
                    this.els.fbModal.classList.add('hidden'); 
                    toast(`Retrying with new source...`);
                    this.animateFusionAndScrape(); 
                };
                this.els.fbList.appendChild(item);
            });

        } catch (e) {
            console.error(e);
            this.els.fbMsg.innerText = 'Error during alternative search.';
            this.els.fbList.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">${e.message}</div>`;
        }
    },

    async downloadHD() {
        // Use the existing logic for HD download
        const btn = document.getElementById('downloadTopBtn') || this.els.dl;
        const ogHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> RENDERING HD...'; 
        btn.disabled = true; 
        lucide.createIcons(); 
        
        try {
            const activeCardData = this.state.data[this.state.active]; 
            if (this.state.active === 'D') {
                 toast('Cannot export the Caption Card (D). Please select a visual card (A, B, or C).', 'error');
                 return;
            }
            
            this.renderCard(this.state.active, 'hd-render-card');
            const hd = document.getElementById('hd-render-card');
            
            // Sync text
            hd.querySelector('.c-title').textContent = activeCardData.title;
            hd.querySelector('.c-subtitle').textContent = activeCardData.subtitle;

            // Sync placeholders
            if (activeCardData.isPlaceholder) {
                hd.querySelector('.c-title').classList.add('is-placeholder');
                hd.querySelector('.c-subtitle').classList.add('is-placeholder');
            } else {
                hd.querySelector('.c-title').classList.remove('is-placeholder');
                hd.querySelector('.c-subtitle').classList.remove('is-placeholder');
            }

            const hdImg = hd.querySelector('.card-bg');
            hdImg.crossOrigin = "anonymous"; 
            const currentBg = activeCardData.bg;
            if (!currentBg.startsWith('data:')) {
                 hdImg.src = `/api/proxy_image?url=${encodeURIComponent(currentBg)}`;
            }
            
            // AutoFit
            const isChatGPTricks = activeCardData.layout === 'layout-chatgptricks';
            this.autoFit(hd.querySelector('.c-title'), isChatGPTricks ? 180 : 140, isChatGPTricks ? 80 : 70, 700); 
            this.autoFit(hd.querySelector('.c-subtitle'), 56, 30, 400);
            
            // Wait for image load
            await new Promise((resolve, reject) => {
                if (!currentBg || currentBg.length === 0) { 
                    resolve();
                } else if (hdImg.complete && hdImg.naturalHeight !== 0) {
                    resolve();
                }
                else { 
                    hdImg.onload = resolve; 
                    hdImg.onerror = () => resolve(); 
                }
                setTimeout(resolve, 5000); 
            });
            
            await new Promise(r => setTimeout(r, 500));
            
            const dataUrl = await htmlToImage.toPng(hd, { quality: 1.0, pixelRatio: 1, cacheBust: true });
            
            const a = document.createElement('a');
            const tag = isChatGPTricks ? 'TRICKS' : activeCardData.tag;
            a.download = `Sentient_${tag}_${Date.now()}.png`;
            a.href = dataUrl;
            a.click();
            toast('HD Export started!');

        } catch (e) {
            console.error("Export failed:", e);
            toast('Export failed. Try a different image.', 'error');
        } finally { 
            btn.innerHTML = ogHtml; 
            btn.disabled = false; 
            lucide.createIcons(); 
        }
    }
};

// Start the engine
App.init();
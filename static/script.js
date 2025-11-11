const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)', short: 'STD' },
    { id: 'layout-centered', name: 'Centered (Middle)', short: 'CTR' },
    { id: 'layout-bold', name: 'Bold (Top Left)', short: 'BLD' }
];

const OVERLAYS = [
    { id: 'black', short: 'B' },
    { id: 'white', short: 'W' }
];

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

const App = {
    state: {
        active: 'A',
        theme: {}, 
        themes: {}, 
        data: {
            A: { title: 'READY', subtitle: 'Paste an article URL...', bg: '', tag: 'NEWS', layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'READY', defaultSubtitle: 'Paste an article URL...' },
            B: { title: 'SET', subtitle: 'Choose variant...', bg: '', tag: 'INFO', layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'SET', defaultSubtitle: 'Choose variant...' },
            C: { title: 'GO', subtitle: 'Customize & export.', bg: '', tag: 'BREAKING', layout: 'layout-bold', caption: '', blur: 0, contrast: 100, overlayColor: 'black', isPlaceholder: true, defaultTitle: 'GO', defaultSubtitle: 'Customize & export.' }
        }
    },

    async init() {
        this.cacheDOM();
        this.initUI(); 
        this.bindEvents();
        await this.loadThemes(); 
        await this.loadInitialPlaceholders(); 
        this.renderAll(); 
        lucide.createIcons(); 
        this.fitStage();
        this.positionControls(); 
        document.fonts.ready.then(() => { this.renderAll(); this.fitStage(); this.positionControls(); });
        window.addEventListener('resize', () => { this.fitStage(); this.positionControls(); });
    },

    async loadInitialPlaceholders() {
        try {
            console.log("⏳ Loading initial random placeholders...");
            const res = await fetch('/api/initial_images');
            if (!res.ok) throw new Error('Failed to fetch initial images');
            const data = await res.json();
            if (data.A) this.state.data.A.bg = data.A;
            if (data.B) this.state.data.B.bg = data.B;
            if (data.C) this.state.data.C.bg = data.C;
            console.log("✅ Initial placeholders loaded.");
        } catch (e) {
            console.error("Error loading initial placeholders:", e);
        }
    },
    
    handleFocus(el, type) {
        const v = el.closest('.mockup').id.replace('mock', '');
        const d = this.state.data[v];
        
        if (d.isPlaceholder) {
            requestAnimationFrame(() => {
                el.textContent = '';
                el.classList.remove('is-placeholder');
                d.isPlaceholder = false;
            });
        }
    },

    handleBlur(el, type) {
        const v = el.closest('.mockup').id.replace('mock', '');
        const d = this.state.data[v];
        const currentText = el.textContent; 
        const trimmedText = currentText.trim();
        const isChatGPTricks = this.state.theme.id === 'chatgptricks';

        if (trimmedText === '') {
            d.isPlaceholder = true;
            d.title = d.defaultTitle;
            d.subtitle = d.defaultSubtitle;
            
            if (type === 'title') el.textContent = d.defaultTitle;
            else el.textContent = d.defaultSubtitle;
            
            el.classList.add('is-placeholder');
        } else {
            d.isPlaceholder = false;
            
            // APLICA EL AUTOFIT AL TERMINAR DE EDITAR
            if (type === 'title') {
                 this.autoFit(el, isChatGPTricks ? 180 : 120, isChatGPTricks ? 80 : 60, 650);
            } else {
                 this.autoFit(el, 56, 30, 400);
            }
            // Sincronizar el estado con el contenido final
            if (type === 'title') d.title = currentText;
            if (type === 'subtitle') d.subtitle = currentText;
        }
    },

    updateTextFromCard(el, type) {
        const v = el.closest('.mockup').id.replace('mock', '');
        const newText = el.textContent; 
        const isChatGPTricks = this.state.theme.id === 'chatgptricks';

        // Bloqueo específico para tema chatgptricks en subtítulo
        if (type === 'subtitle' && isChatGPTricks) {
             if (newText.trim() !== this.state.data[v].subtitle) {
                 el.textContent = this.state.data[v].subtitle; 
             }
             return;
        }

        // SOLO actualizamos el estado.
        if (type === 'title') {
            this.state.data[v].title = newText;
        } else {
            this.state.data[v].subtitle = newText;
        }
    },
    
    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            url: $('urlInput'), scrape: $('scrapeBtn'), editor: $('editorPanel'), dl: $('dlBtn'),
            // Textareas 
            ti: $('titleInput'), 
            sub: $('subInput'), 
            
            // NEW CONTROL PANEL ELEMENTS
            iUrl: $('imgUrlInput'), 
            iFile: $('imgFileInput'),
            imgFileBtn: $('imgFileBtn'),
            blur: $('blurRange'), 
            contrast: $('contrastRange'), 
            activeControls: $('activeControls'), 
            
            // NEW MOCKUP ELEMENTS
            layoutBtn: $('layoutBtn'),
            layoutValue: $('layoutValue'),
            overlayBtn: $('overlayBtn'),
            controlRows: document.querySelectorAll('#activeControls .row'), // Capturar filas para cálculo de altura
            overlayValue: $('overlayValue'),
            stageGrid: document.querySelector('.stage-grid'), // Capturar stage-grid para la transformación
            
            theme: $('themeSelector'),
            cap: $('captionPreview'), 
            cpy: $('copyBtn'),
            sidebar: $('mainSidebar'), 
            mobToggle: $('mobileToggle'),
            loadingBar: $('loadingBar'),
            fbModal: $('fallbackModal'), 
            fbList: $('fallbackList'), 
            fbMsg: $('fallbackMsg'), 
            fbGoogle: $('googleFallbackBtn'),
            subGroup: $('subtitle-control-group'), 
            capGroup: $('caption-control-group'),
        };
    },

    initUI() { 
        // No longer needed: this.els.lay.innerHTML = '';
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
        for (const [k, v] of Object.entries(t.cssVariables)) root.style.setProperty(k, v);
        
        root.style.setProperty('--font-card-body', t.fontConfig.cardBodyFont);
        root.style.setProperty('--font-headline', t.fontConfig.headlineFont);
        root.style.setProperty('--font-headline-weight', t.fontConfig.fontWeight);
        
        ['A', 'B', 'C'].forEach(v => this.state.data[v].layout = t.defaultLayouts[v]);

        const isChatGPTricks = tid === 'chatgptricks';
        if (this.els.subGroup) {
            this.els.subGroup.style.display = isChatGPTricks ? 'none' : 'block';
        }
        
        if (this.els.editor.classList.contains('hidden')) this.renderAll(); 
        else this.switchVar(this.state.active);
    },

    bindEvents() {
        this.els.scrape.onclick = () => this.scrape();
        this.els.mobToggle.onclick = () => this.els.sidebar.classList.toggle('open');
        
        // Clicks on the 'more-horizontal' icon also switch the active variant
        document.querySelectorAll('.card-options-btn').forEach(btn => 
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                const v = e.target.closest('.mockup').id.replace('mock', '');
                this.switchVar(v);
            }
        );

        // Variant activation from the mockup click
        ['A', 'B', 'C'].forEach(v => document.getElementById(`mock${v}`).onclick = () => this.switchVar(v));
        this.els.theme.onchange = (e) => this.applyTheme(e.target.value);

        const up = () => this.renderCard(this.state.active);
        
        // --- NEW MOCKUP CONTROL LOGIC ---
        
        // Layout Cycler
        this.els.layoutBtn.onclick = () => {
            const currentLayout = this.state.data[this.state.active].layout;
            const currentIndex = LAYOUTS.findIndex(l => l.id === currentLayout);
            const nextIndex = (currentIndex + 1) % LAYOUTS.length;
            
            this.state.data[this.state.active].layout = LAYOUTS[nextIndex].id;
            this.els.layoutValue.textContent = LAYOUTS[nextIndex].short;
            up();
        };

        // Overlay Cycler
        this.els.overlayBtn.onclick = () => {
            const currentOverlay = this.state.data[this.state.active].overlayColor;
            const currentIndex = OVERLAYS.findIndex(o => o.id === currentOverlay);
            const nextIndex = (currentIndex + 1) % OVERLAYS.length;
            
            this.state.data[this.state.active].overlayColor = OVERLAYS[nextIndex].id;
            this.els.overlayValue.textContent = OVERLAYS[nextIndex].short;
            up();
        };

        // Sliders and URL Input (standard bindings)
        this.els.iUrl.oninput = (e) => { 
            this.state.data[this.state.active].bg = e.target.value; 
            up(); 
        };
        this.els.blur.oninput = (e) => { this.state.data[this.state.active].blur = e.target.value; up(); };
        this.els.contrast.oninput = (e) => { this.state.data[this.state.active].contrast = e.target.value; up(); };

        // Local Image Upload (existing logic)
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
        // --- END NEW MOCKUP CONTROL LOGIC ---

        this.els.dl.onclick = () => this.downloadHD();
        this.els.cpy.onclick = () => { 
            const captionToCopy = (this.state.theme.id === 'chatgptricks') ? "read de caption" : this.state.data[this.state.active].caption;
            navigator.clipboard.writeText(captionToCopy); 
            toast('Caption copied to clipboard!'); 
        };
    },

    enableCustomMode() {
        ['A','B','C'].forEach((v, i) => {
            const isChatGPTricks = this.state.theme.id === 'chatgptricks';
            this.state.data[v].title = this.state.data[v].defaultTitle;
            this.state.data[v].subtitle = this.state.data[v].defaultSubtitle;
            this.state.data[v].isPlaceholder = true; 
            this.state.data[v].tag = isChatGPTricks ? '' : ['NEWS', 'STORY', 'BREAKING'][i]; 
            this.state.data[v].caption = isChatGPTricks ? "read de caption" : 'Write your caption here...';
            this.state.data[v].layout = this.state.theme.defaultLayouts[v];
            this.state.data[v].bg = ''; 
        });
        this.els.editor.classList.remove('hidden'); 
        this.switchVar('A'); 
        this.renderAll(); 
        toast('Manual mode activated.');
        if(window.innerWidth<=1024) this.els.sidebar.classList.remove('open');
    },

    switchVar(v) {
        this.state.active = v;
        ['A', 'B', 'C'].forEach(x => { 
            document.getElementById(`mock${x}`).classList.toggle('active-stage', x === v); 
            if (x === v) {
                const mockupEl = document.getElementById(`mock${x}`);
                if (mockupEl) mockupEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        });
        
        const d = this.state.data[v];
        // Sync textareas with active card (for quick reference/debugging)
        this.els.ti.value = d.title; 
        this.els.sub.value = d.subtitle; 
        
        const titleEl = document.querySelector(`#card${v} .c-title`);
        const subEl = document.querySelector(`#card${v} .c-subtitle`);
        
        // Sync content if not actively editing
        if (document.activeElement !== titleEl) titleEl.textContent = d.title;
        if (document.activeElement !== subEl) subEl.textContent = d.subtitle;
        
        if (d.isPlaceholder) {
            titleEl.classList.add('is-placeholder');
            subEl.classList.add('is-placeholder');
        } else {
             titleEl.classList.remove('is-placeholder');
             subEl.classList.remove('is-placeholder');
        }

        const isChatGPTricks = this.state.theme.id === 'chatgptricks';
        const displayedCaption = isChatGPTricks ? "read de caption" : (d.caption || 'Waiting for AI...');
        this.els.cap.innerText = displayedCaption;
        
        // --- MOCKUP CONTROL PANEL SYNCHRONIZATION ---
        const layoutShort = LAYOUTS.find(l => l.id === d.layout)?.short || 'ERR';
        const overlayShort = OVERLAYS.find(o => o.id === d.overlayColor)?.short || 'ERR';

        this.els.layoutValue.textContent = layoutShort;
        this.els.overlayValue.textContent = overlayShort;
        this.els.blur.value = d.blur;
        this.els.contrast.value = d.contrast;
        // Sincronizar el input de URL solo si no es una imagen local
        if (!d.bg.startsWith('data:')) {
            this.els.iUrl.value = d.bg;
        } else {
            this.els.iUrl.value = "(Local Image Loaded)";
        }
        
        // Recalculamos la posición vertical y la posición de los controles
        this.updateVerticalCentering(v); 
        this.positionControls(v);
        // ----------------------------------------------------

        this.fitStage();
    },
    
    // --- FUNCIÓN PARA EL CENTRADO VERTICAL DEL CONJUNTO (Stage-grid + Controls) ---
    updateVerticalCentering(v) {
        if (this.els.activeControls.classList.contains('hidden') || window.innerWidth <= 1024) {
            this.els.stageGrid.style.transform = ''; // Reset transform if controls are hidden
            return;
        }
        
        // Medir la altura sin interferir con la visibilidad final (solo posición)
        const originalPosition = this.els.activeControls.style.position;
        const originalLeft = this.els.activeControls.style.left;

        this.els.activeControls.style.position = 'static';
        this.els.activeControls.style.left = '0';
        this.els.activeControls.classList.remove('hidden');

        const controlsHeight = this.els.activeControls.offsetHeight;
        
        // Restaurar estado de posición, pero mantener la visibilidad para positionControls()
        this.els.activeControls.style.position = 'absolute';
        this.els.activeControls.style.left = originalLeft; 

        const separation = 20; 
        const totalOffset = controlsHeight + separation;
        const translateY = -(totalOffset / 2);
        
        // Aplicar el desplazamiento a stageGrid para centrar el conjunto visualmente
        this.els.stageGrid.style.transform = `translateY(${translateY}px)`;
    },
    // --- FIN FUNCIÓN DE CENTRADO ---

    positionControls(v = this.state.active) {
        if (this.els.editor.classList.contains('hidden') || window.innerWidth <= 1024) {
            this.els.activeControls.classList.add('hidden'); 
            this.els.stageGrid.style.transform = ''; // Asegurar que se centra si los controles se ocultan
            return;
        }

        const activeMockup = document.getElementById(`mock${v}`);
        if (!activeMockup) {
            this.els.activeControls.classList.add('hidden');
            return;
        }

        // Hacemos el panel visible para medir y posicionar
        this.els.activeControls.classList.remove('hidden'); 
        
        const rect = activeMockup.getBoundingClientRect();
        const mainStageRect = this.els.activeControls.closest('.main-stage').getBoundingClientRect();
        
        // 1. Posición vertical (rect.bottom ya incorpora el desplazamiento del centrado)
        const topPosition = (rect.bottom - mainStageRect.top) + 20; // + 20px separación
        
        // 2. Centrar horizontalmente
        const panelWidth = this.els.activeControls.offsetWidth; 
        const leftPosition = (rect.left - mainStageRect.left) + (rect.width / 2) - (panelWidth / 2);
        
        // Apply the new position
        this.els.activeControls.style.left = `${leftPosition}px`;
        this.els.activeControls.style.top = `${topPosition}px`;
        this.els.activeControls.style.transform = 'none'; 
        
        this.updateVerticalCentering(v); // Re-centrar después de posicionar para asegurar que el stage-grid esté compensado
    },
    
    renderCard(v, tid = `card${v}`) {
        const c = document.getElementById(tid); if (!c) return;
        const d = this.state.data[v];
        const isChatGPTricks = this.state.theme.id === 'chatgptricks';
        
        const ovs = (this.state.theme && this.state.theme.overlays) 
            ? this.state.theme.overlays 
            : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' }; 

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
        
        // Sincronizar classes de placeholder
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
        ['A', 'B', 'C'].forEach(v => {
            this.renderCard(v);
            const d = this.state.data[v];
            const t = document.querySelector(`#card${v} .c-title`);
            const s = document.querySelector(`#card${v} .c-subtitle`);
            const isChatGPTricks = this.state.theme.id === 'chatgptricks';
            
            // FIX: Actualizar el textContent de todas las tarjetas immediately
            if (t) t.textContent = d.title;
            if (s) s.textContent = d.subtitle;

            // FIX: Aplicar AutoFit inicial
            if (t && !d.isPlaceholder) this.autoFit(t, isChatGPTricks ? 180 : 120, isChatGPTricks ? 80 : 60, 650);
            if (s && !d.isPlaceholder) this.autoFit(s, 56, 30, 400);
        }); 
        this.updateVerticalCentering(this.state.active); // Re-center on full render
        this.positionControls(); 
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
        ['A','B','C'].forEach(v => { 
            const w = document.getElementById(`mount${v}`); 
            const c = document.getElementById(`card${v}`); 
            if (w && c) {
                const scale = Math.min(w.clientWidth / 1080, w.clientHeight / 1350);
                c.style.transform = `scale(${scale})`; 
            }
        }); 
    },

    async scrape() {
        const url = this.els.url.value.trim();
        if (!url) { toast('Please enter a URL first.', 'error'); return; }
        
        this.els.scrape.innerHTML = '<i data-lucide="loader-2" class="spin"></i>'; 
        this.els.scrape.disabled = true; 
        this.els.loadingBar.style.display = 'block'; 
        lucide.createIcons();
        
        try {
            const res = await fetch('/api/scrape', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({url}) 
            });
            const d = await res.json(); 
            if (d.error) throw new Error(d.error);

            this.state.data.A.bg = d.images.a; this.state.data.A.tag = 'NEWS';
            this.state.data.B.bg = d.images.b; this.state.data.B.tag = 'STORY';
            this.state.data.C.bg = d.images.c; this.state.data.C.tag = 'UPDATE';
            
            const isChatGPTricks = this.state.theme.id === 'chatgptricks';

            if (d.ai_content && d.ai_content.variants) {
                this.state.data.A.tag = 'NEWS';
                this.state.data.B.tag = 'STORY';
                this.state.data.C.tag = 'BREAKING'; 

                ['A','B','C'].forEach(v => {
                    this.state.data[v].isPlaceholder = false; 
                    if (isChatGPTricks) {
                        this.state.data[v].subtitle = ''; 
                        this.state.data[v].tag = '';      
                        this.state.data[v].caption = "read de caption"; 
                    } else {
                        this.state.data[v].caption = d.ai_content.common_caption;
                        this.state.data[v].subtitle = d.ai_content.variants[v].subtitle;
                    }
                    this.state.data[v].title = d.ai_content.variants[v].title.toUpperCase(); 
                });
                
            } else {
                toast('AI generation failed. Using raw text.', 'error');
                ['A','B','C'].forEach(v => { 
                    this.state.data[v].isPlaceholder = false; 
                    this.state.data[v].title = d.original.title; 
                    if (isChatGPTricks) {
                         this.state.data[v].subtitle = ''; 
                         this.state.data[v].tag = '';
                         this.state.data[v].caption = "read de caption";
                    } else {
                         this.state.data[v].subtitle = d.original.subtitle; 
                    }
                });
            }
            
            this.els.editor.classList.remove('hidden'); 
            this.switchVar('A'); 
            this.renderAll(); 
            toast('Content processed successfully!');
            if(window.innerWidth<=1024) this.els.sidebar.classList.remove('open');

        } catch (e) {
            console.error("Scrape error:", e);
            toast('Link unreachable. Finding alternatives...', 'info');
            this.showFallback(url);
        } finally { 
            this.els.scrape.innerHTML = '<i data-lucide="sparkles"></i>'; 
            this.els.scrape.disabled = false; 
            this.els.loadingBar.style.display = 'none'; 
            lucide.createIcons(); 
        }
    },

    async showFallback(failedUrl) {
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
                item.style.cssText = 'padding:12px; background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:10px; cursor:pointer; transition:all 0.2s ease;';
                item.innerHTML = `
                    <div style="font-weight:700; color:var(--text); font-size:0.95rem; margin-bottom:4px; line-height:1.3;">${r.title}</div>
                    <div style="color:var(--text-dim); font-size:0.8rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${r.snippet}</div>
                    <div style="color:var(--brand); font-size:0.7rem; margin-top:6px; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.url}</div>
                `;
                
                item.onmouseover = () => { item.style.borderColor = 'var(--brand)'; item.style.background = 'rgba(255,255,255,0.05)'; };
                item.onmouseout = () => { item.style.borderColor = 'var(--border)'; item.style.background = 'rgba(0,0,0,0.3)'; };
                
                item.onclick = () => {
                    this.els.url.value = r.url;
                    this.els.fbModal.style.display = 'none';
                    toast(`Retrying with new source...`);
                    this.scrape(); 
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
        const btn = this.els.dl; 
        const ogHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> RENDERING HD...'; 
        btn.disabled = true; 
        lucide.createIcons(); 
        this.els.loadingBar.style.display = 'block';
        
        try {
            const activeCardData = this.state.data[this.state.active]; // Obtener los datos del estado
            this.renderCard(this.state.active, 'hd-render-card');
            const hd = document.getElementById('hd-render-card');
            
            // 1. Asegurar que el texto editable esté en el elemento HD (CORRECCIÓN WYSIWYG)
            hd.querySelector('.c-title').textContent = activeCardData.title;
            hd.querySelector('.c-subtitle').textContent = activeCardData.subtitle;

            // 2. Sincronizar clases de placeholder para aplicar el estilo correcto antes de renderizar (CORRECCIÓN WYSIWYG)
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
            
            const isChatGPTricks = activeCardData.layout === 'layout-chatgptricks';
            this.autoFit(hd.querySelector('.c-title'), isChatGPTricks ? 180 : 140, isChatGPTricks ? 80 : 70, 700); 
            this.autoFit(hd.querySelector('.c-subtitle'), 56, 30, 400);
            
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
            this.els.loadingBar.style.display = 'none'; 
        }
    }
};

// Start the engine
App.init();
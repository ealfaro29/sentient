const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)' },
    { id: 'layout-centered', name: 'Centered (Middle)' },
    { id: 'layout-bold', name: 'Bold (Top Left)' }
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
            A: { title: 'READY', subtitle: 'Paste an article URL...', bg: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080', tag: 'NEWS', layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black' },
            B: { title: 'SET', subtitle: 'Choose variant...', bg: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1080', tag: 'INFO', layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black' },
            C: { title: 'GO', subtitle: 'Customize & export.', bg: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?q=80&w=1080', tag: 'CLICKBAIT', layout: 'layout-bold', caption: '', blur: 0, contrast: 100, overlayColor: 'black' }
        }
    },

    async init() {
        this.cacheDOM();
        this.initUI(); 
        this.bindEvents();
        await this.loadThemes(); 
        this.renderAll(); 
        lucide.createIcons(); 
        this.fitStage();
        document.fonts.ready.then(() => { this.renderAll(); this.fitStage(); });
        window.addEventListener('resize', () => this.fitStage());
    },

    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            url: $('urlInput'), scrape: $('scrapeBtn'), editor: $('editorPanel'), dl: $('dlBtn'),
            ti: $('titleInput'), sub: $('subInput'), lay: $('layoutSelector'), theme: $('themeSelector'),
            iUrl: $('imgUrlInput'), iFile: $('imgFileInput'), cap: $('captionPreview'), cpy: $('copyBtn'),
            custom: $('customBtn'), sidebar: $('mainSidebar'), mobToggle: $('mobileToggle'),
            blur: $('blurRange'), contrast: $('contrastRange'), loadingBar: $('loadingBar'),
            // Fallback Modal Elements
            fbModal: $('fallbackModal'), fbList: $('fallbackList'), fbMsg: $('fallbackMsg'), fbGoogle: $('googleFallbackBtn')
        };
    },

    initUI() { 
        this.els.lay.innerHTML = ''; 
        LAYOUTS.forEach(l => { const o = document.createElement('option'); o.value = l.id; o.innerText = l.name; this.els.lay.appendChild(o); }); 
    },
    
    async loadThemes() {
        try {
            // In a real scenario, you might fetch a manifest first. Hardcoded for simplicity here.
            const themesToLoad = ['sentient.json', 'cyber.json', 'elegant.json'];
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
        // Apply generic CSS variables from JSON
        for (const [k, v] of Object.entries(t.cssVariables)) root.style.setProperty(k, v);
        
        // Apply specific font configs
        root.style.setProperty('--font-card-body', t.fontConfig.cardBodyFont);
        root.style.setProperty('--font-headline', t.fontConfig.headlineFont);
        root.style.setProperty('--font-headline-weight', t.fontConfig.fontWeight);
        
        // Reset layouts to theme defaults
        ['A', 'B', 'C'].forEach(v => this.state.data[v].layout = t.defaultLayouts[v]);
        
        // Refresh UI
        if (this.els.editor.classList.contains('hidden')) this.renderAll(); 
        else this.switchVar(this.state.active);
    },

    bindEvents() {
        this.els.scrape.onclick = () => this.scrape();
        this.els.custom.onclick = () => this.enableCustomMode();
        this.els.mobToggle.onclick = () => this.els.sidebar.classList.toggle('open');
        
        ['A', 'B', 'C'].forEach(v => document.getElementById(`btnVar${v}`).onclick = () => this.switchVar(v));
        this.els.theme.onchange = (e) => this.applyTheme(e.target.value);

        // Live Rendering Triggers
        const up = () => this.renderCard(this.state.active);
        this.els.ti.oninput = (e) => { this.state.data[this.state.active].title = e.target.value; up(); };
        this.els.sub.oninput = (e) => { this.state.data[this.state.active].subtitle = e.target.value; up(); };
        this.els.lay.onchange = (e) => { this.state.data[this.state.active].layout = e.target.value; up(); };
        this.els.iUrl.oninput = (e) => { this.state.data[this.state.active].bg = e.target.value; up(); };
        this.els.blur.oninput = (e) => { this.state.data[this.state.active].blur = e.target.value; up(); };
        this.els.contrast.oninput = (e) => { this.state.data[this.state.active].contrast = e.target.value; up(); };

        // Overlay Toggles
        document.querySelectorAll('.overlay-btn').forEach(b => b.onclick = (e) => {
            if (e.target.classList.contains('active')) return;
            document.querySelectorAll('.overlay-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active'); 
            this.state.data[this.state.active].overlayColor = e.target.dataset.overlay; 
            up();
        });

        // Local Image Upload
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
        this.els.cpy.onclick = () => { 
            navigator.clipboard.writeText(this.state.data[this.state.active].caption); 
            toast('Caption copied to clipboard!'); 
        };
    },

    enableCustomMode() {
        ['A','B','C'].forEach((v, i) => {
            this.state.data[v].title = `HEADLINE ${v}`; 
            this.state.data[v].subtitle = `Write your subtitle here for variant ${v}...`;
            this.state.data[v].tag = ['NEWS', 'STORY', 'UPDATE'][i]; 
            this.state.data[v].caption = 'Write your caption here...';
            this.state.data[v].layout = this.state.theme.defaultLayouts[v];
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
            document.getElementById(`btnVar${x}`).classList.toggle('active', x === v); 
            document.getElementById(`mock${x}`).classList.toggle('inactive', x !== v); 
        });
        
        const d = this.state.data[v];
        this.els.ti.value = d.title; 
        this.els.sub.value = d.subtitle; 
        this.els.lay.value = d.layout; 
        this.els.cap.innerText = d.caption || 'Waiting for AI...';
        this.els.blur.value = d.blur; 
        this.els.contrast.value = d.contrast;
        
        document.querySelectorAll('.overlay-btn').forEach(btn => 
            btn.classList.toggle('active', btn.dataset.overlay === d.overlayColor)
        );
        
        if (!d.bg.startsWith('data:')) this.els.iUrl.value = d.bg;
        this.fitStage();
    },

    renderCard(v, tid = `card${v}`) {
        const c = document.getElementById(tid); if (!c) return;
        const d = this.state.data[v];
        
        // Determine overlay colors based on theme or defaults
        const ovs = (this.state.theme && this.state.theme.overlays) 
            ? this.state.theme.overlays 
            : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' }; 

        // Image Handling (Proxy vs Data URL)
        const imgEl = c.querySelector('.card-bg');
        if (d.bg.startsWith('data:')) {
            imgEl.src = d.bg;
        } else {
            // Use proxy to avoid CORS issues on standard images
            imgEl.src = `/api/proxy_image?url=${encodeURIComponent(d.bg)}`;
        }

        imgEl.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;
        c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? ovs.white : ovs.black;
        c.querySelector('.card-content').className = `card-content ${d.layout}`;
        c.querySelector('.c-pill').textContent = d.tag;
        
        const t = c.querySelector('.c-title'); 
        const s = c.querySelector('.c-subtitle');
        t.innerText = d.title; 
        s.innerText = d.subtitle;

        // Dynamic text color based on overlay
        t.style.color = d.overlayColor === 'white' ? '#000' : 'var(--brand)';
        s.style.color = d.overlayColor === 'white' ? '#333' : '#fff';
        
        // Auto-fit text (only for preview cards, not HD render)
        if (!tid.startsWith('hd-')) { 
            this.autoFit(t, 120, 60, 650); 
            this.autoFit(s, 56, 30, 400); 
        }
    },

    renderAll() { ['A', 'B', 'C'].forEach(v => this.renderCard(v)); },
    
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

            // Distribute images and tags
            this.state.data.A.bg = d.images.a; this.state.data.A.tag = 'NEWS';
            this.state.data.B.bg = d.images.b; this.state.data.B.tag = 'STORY';
            this.state.data.C.bg = d.images.c; this.state.data.C.tag = 'UPDATE';
            
            // Apply AI content if available, else fallback to scraping data
            if (d.ai_content && d.ai_content.variants) {
                ['A','B','C'].forEach(v => this.state.data[v].caption = d.ai_content.common_caption);
                this.state.data.A.title = d.ai_content.variants.A.title.toUpperCase(); 
                this.state.data.A.subtitle = d.ai_content.variants.A.subtitle;
                this.state.data.B.title = d.ai_content.variants.B.title.toUpperCase(); 
                this.state.data.B.subtitle = d.ai_content.variants.B.subtitle;
                this.state.data.C.title = d.ai_content.variants.C.title.toUpperCase(); 
                this.state.data.C.subtitle = d.ai_content.variants.C.subtitle;
            } else {
                toast('AI generation failed. Using raw text.', 'error');
                ['A','B','C'].forEach(v => { 
                    this.state.data[v].title = d.original.title; 
                    this.state.data[v].subtitle = d.original.subtitle; 
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
        // Mensaje inicial mientras busca
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

            // Actualizar siempre el botón de Google con la mejor query encontrada (específica o amplia)
            const safeQuery = encodeURIComponent(data.query || 'latest news');
            this.els.fbGoogle.href = `https://www.google.com/search?q=${safeQuery}`;

            if (!data.results || data.results.length === 0) {
                this.els.fbMsg.innerHTML = `Couldn't find direct alternatives for <b>"${data.query || 'this topic'}"</b>. Try the Google button below.`;
                this.els.fbList.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.6; font-style:italic;">No matches found via DuckDuckGo.</div>';
                return;
            }

            // Mostrar qué query tuvo éxito finalmente
            this.els.fbMsg.innerHTML = `Source blocked. Here are similar articles for: <b style="color:var(--brand)">"${data.query}"</b>`;
            this.els.fbList.innerHTML = ''; // Limpiar loader

            // Renderizar resultados combinados
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
                    this.scrape(); // Auto-reintento con la nueva URL
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
            // Render active card to invisible HD stage
            this.renderCard(this.state.active, 'hd-render-card');
            const hd = document.getElementById('hd-render-card');
            const hdImg = hd.querySelector('.card-bg');
            
            hdImg.crossOrigin = "anonymous"; 
            const currentBg = this.state.data[this.state.active].bg;
            if (!currentBg.startsWith('data:')) {
                 hdImg.src = `/api/proxy_image?url=${encodeURIComponent(currentBg)}`;
            }
            
            // Upscale text for HD resolution
            this.autoFit(hd.querySelector('.c-title'), 140, 70, 700); 
            this.autoFit(hd.querySelector('.c-subtitle'), 56, 30, 400);
            
            await new Promise((resolve, reject) => {
                if (hdImg.complete && hdImg.naturalHeight !== 0) resolve();
                else { 
                    hdImg.onload = resolve; 
                    hdImg.onerror = () => resolve(); 
                }
                setTimeout(resolve, 5000); 
            });
            
            await new Promise(r => setTimeout(r, 500));
            
            const dataUrl = await htmlToImage.toPng(hd, { quality: 1.0, pixelRatio: 1, cacheBust: true });
            
            const a = document.createElement('a');
            a.download = `Sentient_${this.state.data[this.state.active].tag}_${Date.now()}.png`;
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
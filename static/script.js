const THEMES = {
    "default": { overlay_black: "rgba(0,0,0,0.5)", overlay_white: "rgba(255,255,255,0.3)" },
    "theme-cyber": { overlay_black: "linear-gradient(to bottom, rgba(0,255,249,0.1), rgba(5,1,13,0.9))", overlay_white: "linear-gradient(to bottom, rgba(0,255,249,0.1), rgba(255,255,255,0.8))" },
    "theme-elegant": { overlay_black: "rgba(0,0,0,0.4)", overlay_white: "rgba(255,255,255,0.4)" }
};

const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)' },
    { id: 'layout-centered', name: 'Centered (Middle)' },
    { id: 'layout-bold', name: 'Bold (Top Left)' }
];

const toast = (msg, type = 'info') => {
    Toastify({ text: msg, duration: 3000, gravity: "top", position: "center", style: { background: type === 'error' ? "#ef4444" : "#CCFF00", color: "#000", fontWeight: "700", borderRadius: "8px" } }).showToast();
};

const App = {
    state: {
        active: 'A', theme: 'default',
        data: {
            A: { title: 'READY', subtitle: 'Paste an article URL...', bg: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080', tag: 'NEWS', layout: 'layout-standard', caption: '', blur: 0, contrast: 100, overlayColor: 'black' },
            B: { title: 'SET', subtitle: 'Choose variant...', bg: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1080', tag: 'INFO', layout: 'layout-centered', caption: '', blur: 0, contrast: 100, overlayColor: 'black' },
            C: { title: 'GO', subtitle: 'Customize & export.', bg: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?q=80&w=1080', tag: 'CLICKBAIT', layout: 'layout-bold', caption: '', blur: 0, contrast: 100, overlayColor: 'black' }
        }
    },

    init() { this.cacheDOM(); this.initUI(); this.bindEvents(); this.renderAll(); lucide.createIcons(); this.fitStage(); document.fonts.ready.then(() => { this.renderAll(); this.fitStage(); }); window.addEventListener('resize', () => this.fitStage()); },

    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            url: $('urlInput'), scrape: $('scrapeBtn'), editor: $('editorPanel'), dl: $('dlBtn'),
            ti: $('titleInput'), sub: $('subInput'), lay: $('layoutSelector'), theme: $('themeSelector'),
            iUrl: $('imgUrlInput'), iFile: $('imgFileInput'), cap: $('captionPreview'), cpy: $('copyBtn'),
            custom: $('customBtn'), sidebar: $('mainSidebar'), mobToggle: $('mobileToggle'),
            blur: $('blurRange'), contrast: $('contrastRange'), loadingBar: $('loadingBar')
            // Se eliminó model: $('modelSelector')
        };
    },

    initUI() { this.els.lay.innerHTML = ''; LAYOUTS.forEach(l => { const o = document.createElement('option'); o.value = l.id; o.innerText = l.name; this.els.lay.appendChild(o); }); },

    bindEvents() {
        this.els.scrape.onclick = () => this.scrape();
        this.els.custom.onclick = () => this.enableCustomMode();
        this.els.mobToggle.onclick = () => this.els.sidebar.classList.toggle('open');
        ['A', 'B', 'C'].forEach(v => document.getElementById(`btnVar${v}`).onclick = () => this.switchVar(v));
        this.els.theme.onchange = (e) => { this.state.theme = e.target.value; document.body.className = (e.target.value === 'default' ? '' : e.target.value); this.renderAll(); };
        const up = () => this.renderCard(this.state.active);
        this.els.ti.oninput = (e) => { this.state.data[this.state.active].title = e.target.value; up(); };
        this.els.sub.oninput = (e) => { this.state.data[this.state.active].subtitle = e.target.value; up(); };
        this.els.lay.onchange = (e) => { this.state.data[this.state.active].layout = e.target.value; up(); };
        this.els.iUrl.oninput = (e) => { this.state.data[this.state.active].bg = e.target.value; up(); };
        this.els.blur.oninput = (e) => { this.state.data[this.state.active].blur = e.target.value; up(); };
        this.els.contrast.oninput = (e) => { this.state.data[this.state.active].contrast = e.target.value; up(); };
        document.querySelectorAll('.overlay-btn').forEach(btn => {
            btn.onclick = (e) => {
                if (e.target.classList.contains('active')) return;
                document.querySelectorAll('.overlay-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.data[this.state.active].overlayColor = e.target.dataset.overlay;
                up();
            }
        });
        this.els.iFile.onchange = (e) => {
            if (e.target.files?.[0]) {
                const r = new FileReader();
                r.onload = (ev) => { this.state.data[this.state.active].bg = ev.target.result; up(); this.els.iUrl.value = "(Local Image Loaded)"; };
                r.readAsDataURL(e.target.files[0]);
            }
        };
        this.els.dl.onclick = () => this.downloadHD();
        this.els.cpy.onclick = () => { navigator.clipboard.writeText(this.state.data[this.state.active].caption); toast('Caption copied!'); };
    },

    enableCustomMode() {
        ['A','B','C'].forEach((v, i) => {
            const tags = ['NEWS', 'INFO', 'CLICKBAIT'];
            this.state.data[v].title = `HEADLINE ${v}`; this.state.data[v].subtitle = `Subtitle ${v}`;
            this.state.data[v].tag = tags[i]; this.state.data[v].caption = 'Write your common caption here...';
        });
        this.els.editor.classList.remove('hidden'); this.switchVar('A'); this.renderAll(); toast('Custom mode activated!');
        if(window.innerWidth<=1024) this.els.sidebar.classList.remove('open');
    },

    switchVar(v) {
        this.state.active = v;
        ['A', 'B', 'C'].forEach(x => { document.getElementById(`btnVar${x}`).classList.toggle('active', x === v); document.getElementById(`mock${x}`).classList.toggle('inactive', x !== v); });
        const d = this.state.data[v];
        this.els.ti.value = d.title; this.els.sub.value = d.subtitle; this.els.lay.value = d.layout;
        this.els.cap.innerText = d.caption || 'Waiting...';
        this.els.blur.value = d.blur; this.els.contrast.value = d.contrast;
        document.querySelectorAll('.overlay-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.overlay === d.overlayColor));
        if (!d.bg.startsWith('data:')) this.els.iUrl.value = d.bg;
        this.fitStage();
    },

    renderCard(v, targetId = `card${v}`) {
        const c = document.getElementById(targetId); if (!c) return;
        const d = this.state.data[v];
        const th = THEMES[this.state.theme] || THEMES.default;
        const bgImg = c.querySelector('.card-bg');
        bgImg.src = d.bg; bgImg.style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;
        c.querySelector('.card-overlay').style.background = d.overlayColor === 'white' ? th.overlay_white : th.overlay_black;
        c.querySelector('.card-content').className = `card-content ${d.layout}`;
        c.querySelector('.c-pill').textContent = d.tag;
        const t = c.querySelector('.c-title'); const s = c.querySelector('.c-subtitle');
        t.innerText = d.title; s.innerText = d.subtitle;
        t.style.color = d.overlayColor === 'white' ? '#111' : 'var(--brand)';
        s.style.color = d.overlayColor === 'white' ? '#333' : '#fff';
        if (!targetId.startsWith('hd-')) { this.autoFit(t, 120, 60, 650); this.autoFit(s, 56, 30, 400); }
    },
    renderAll() { ['A', 'B', 'C'].forEach(v => this.renderCard(v)); },
    autoFit(el, max, min, hMax) { let fs = max; el.style.fontSize = fs + 'px'; while (el.scrollHeight > hMax && fs > min) { fs -= 2; el.style.fontSize = fs + 'px'; } },
    fitStage() { ['A','B','C'].forEach(v => { const w = document.getElementById(`mount${v}`); const c = document.getElementById(`card${v}`); if (w && c) c.style.transform = `scale(${Math.min(w.clientWidth / 1080, w.clientHeight / 1350)})`; }); },

    async scrape() {
        const url = this.els.url.value.trim();
        if (!url) { toast('Please enter a URL first.', 'error'); return; }
        this.els.scrape.innerHTML = '<i data-lucide="loader-2" class="spin"></i>'; this.els.scrape.disabled = true; this.els.loadingBar.style.display = 'block'; lucide.createIcons();
        try {
            // ACTUALIZADO: Ya no se envía 'model'
            const res = await fetch('/api/scrape', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url}) });
            const d = await res.json(); if (d.error) throw new Error(d.error);
            
            // Asignar imágenes y tags
            this.state.data.A.bg = d.images.a; this.state.data.A.tag = 'NEWS';
            this.state.data.B.bg = d.images.b; this.state.data.B.tag = 'INFO';
            this.state.data.C.bg = d.images.c; this.state.data.C.tag = 'CLICKBAIT'; // Tag actualizado
            
            if (d.ai_content && d.ai_content.variants) {
                ['A','B','C'].forEach(v => this.state.data[v].caption = d.ai_content.common_caption);
                this.state.data.A.title = d.ai_content.variants.A.title.toUpperCase(); this.state.data.A.subtitle = d.ai_content.variants.A.subtitle;
                this.state.data.B.title = d.ai_content.variants.B.title.toUpperCase(); this.state.data.B.subtitle = d.ai_content.variants.B.subtitle;
                this.state.data.C.title = d.ai_content.variants.C.title.toUpperCase(); this.state.data.C.subtitle = d.ai_content.variants.C.subtitle;
            } else {
                toast('AI failed. Using original text.', 'error');
                ['A','B','C'].forEach(v => { this.state.data[v].title = d.original.title; this.state.data[v].subtitle = d.original.subtitle; });
            }
            this.els.editor.classList.remove('hidden'); this.switchVar('A'); this.renderAll(); toast('Article processed successfully!');
            if(window.innerWidth<=1024) this.els.sidebar.classList.remove('open');
        } catch (e) { toast(e.message, 'error'); } 
        finally { this.els.scrape.innerHTML = '<i data-lucide="sparkles"></i>'; this.els.scrape.disabled = false; this.els.loadingBar.style.display = 'none'; lucide.createIcons(); }
    },

    async downloadHD() {
        const btn = this.els.dl; const og = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> RENDERING...'; btn.disabled = true; lucide.createIcons(); this.els.loadingBar.style.display = 'block';
        try {
            this.renderCard(this.state.active, 'hd-render-card');
            const hd = document.getElementById('hd-render-card');
            const d = this.state.data[this.state.active];
            hd.querySelector('.card-bg').style.filter = `blur(${d.blur}px) contrast(${d.contrast}%)`;
            this.autoFit(hd.querySelector('.c-title'), 140, 70, 700); this.autoFit(hd.querySelector('.c-subtitle'), 56, 30, 400);
            await new Promise(r => { const img = hd.querySelector('.card-bg'); if (img.complete && img.naturalHeight !== 0) r(); else { img.onload = r; img.onerror = r; } setTimeout(r, 2000); });
            await new Promise(r => setTimeout(r, 500));
            const dataUrl = await htmlToImage.toPng(hd, { quality: 1.0, pixelRatio: 1 });
            const a = document.createElement('a'); a.download = `Sentient_${this.state.data[this.state.active].tag}_HD.png`; a.href = dataUrl; a.click(); toast('Export started!');
        } catch (e) { console.error(e); toast('Export failed.', 'error'); } 
        finally { btn.innerHTML = og; btn.disabled = false; lucide.createIcons(); this.els.loadingBar.style.display = 'none'; }
    }
};
App.init();
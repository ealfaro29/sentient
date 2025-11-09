const THEMES = { "default": { overlay: "rgba(0,0,0,0.5)" }, "theme-cyber": { overlay: "rgba(20, 0, 50, 0.7)" }, "theme-elegant": { overlay: "rgba(0,0,0,0.3)" } };
const LAYOUTS = [ { id: 'layout-standard', name: 'Standard' }, { id: 'layout-centered', name: 'Centered' }, { id: 'layout-bold', name: 'Bold Top' } ];

const App = {
    state: {
        active: 'A', theme: 'default',
        data: {
            A: { title: 'READY', subtitle: 'Paste URL...', bg: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080', tag: 'NEWS', layout: 'layout-standard', caption: '' },
            B: { title: 'READY', subtitle: 'Paste URL...', bg: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1080', tag: 'FEATURE', layout: 'layout-centered', caption: '' },
            C: { title: 'READY', subtitle: 'Paste URL...', bg: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?q=80&w=1080', tag: 'VIRAL', layout: 'layout-bold', caption: '' }
        }
    },

    init() {
        this.cacheDOM();
        this.initUI();
        this.bindEvents();
        this.render();
        setTimeout(() => this.fitCards(), 200);
        window.addEventListener('resize', () => this.fitCards());
        lucide.createIcons();
    },

    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            urlIn: $('urlInput'), scrapeBtn: $('scrapeBtn'), editor: $('editorPanel'), dlBtn: $('dlBtn'),
            titleIn: $('titleInput'), subIn: $('subInput'), layoutSel: $('layoutSelector'), themeSel: $('themeSelector'),
            imgUrl: $('imgUrlInput'), imgFile: $('imgFileInput'), imgThumb: $('activeThumb'), captionView: $('captionPreview'),
            copyBtn: $('copyCaptionBtn'), btnA: $('btnVarA'), btnB: $('btnVarB'), btnC: $('btnVarC'),
            mockA: $('mockA'), mockB: $('mockB'), mockC: $('mockC')
        };
    },

    initUI() {
        LAYOUTS.forEach(l => {
            const o = document.createElement('option');
            o.value = l.id;
            o.innerText = l.name;
            this.els.layoutSel.appendChild(o);
        });
    },

    bindEvents() {
        this.els.scrapeBtn.onclick = () => this.scrape();
        ['A', 'B', 'C'].forEach(v => { if (this.els[`btn${v}`]) this.els[`btn${v}`].onclick = () => this.switchVar(v); });
        this.els.themeSel.onchange = (e) => { this.state.theme = e.target.value; document.body.className = e.target.value === 'default' ? '' : e.target.value; this.render(); };
        this.els.titleIn.oninput = (e) => { this.state.data[this.state.active].title = e.target.value; this.render(this.state.active); };
        this.els.subIn.oninput = (e) => { this.state.data[this.state.active].subtitle = e.target.value; this.render(this.state.active); };
        this.els.layoutSel.onchange = (e) => { this.state.data[this.state.active].layout = e.target.value; this.render(this.state.active); };
        this.els.imgUrl.oninput = (e) => { this.state.data[this.state.active].bg = e.target.value; this.render(this.state.active); this.updateThumb(); };
        this.els.imgFile.onchange = (e) => {
            if (e.target.files?.[0]) {
                const r = new FileReader();
                r.onload = (ev) => { this.state.data[this.state.active].bg = ev.target.result; this.render(this.state.active); this.updateThumb(); };
                r.readAsDataURL(e.target.files[0]);
            }
        };
        this.els.dlBtn.onclick = () => this.download(this.state.active);
        this.els.copyBtn.onclick = () => {
            navigator.clipboard.writeText(this.state.data[this.state.active].caption);
            alert('Caption copied!');
        };
    },

    switchVar(v) {
        this.state.active = v;
        ['A', 'B', 'C'].forEach(x => {
            if (this.els[`btn${x}`]) this.els[`btn${x}`].classList.toggle('active', x === v);
            if (this.els[`mock${x}`]) this.els[`mock${x}`].classList.toggle('inactive', x !== v);
        });
        const d = this.state.data[v];
        this.els.titleIn.value = d.title;
        this.els.subIn.value = d.subtitle;
        this.els.layoutSel.value = d.layout;
        this.els.captionView.innerText = d.caption || 'No caption generated yet.';
        this.updateThumb();
    },

    updateThumb() {
        const bg = this.state.data[this.state.active].bg;
        this.els.imgThumb.src = bg;
        this.els.imgUrl.value = bg.startsWith('data:') ? '(Local File)' : bg;
    },

    render(target = null) {
        const theme = THEMES[this.state.theme] || THEMES.default;
        (target ? [target] : ['A', 'B', 'C']).forEach(v => {
            const c = document.getElementById(`card${v}`); if (!c) return;
            const d = this.state.data[v];
            c.querySelector('.card-bg').src = d.bg;
            c.querySelector('.card-overlay').style.background = theme.overlay;
            c.querySelector('.card-content').className = `card-content ${d.layout}`;
            c.querySelector('.c-pill').textContent = d.tag;
            const t = c.querySelector('.c-title'); t.innerText = d.title; this.autoSize(t, 110, 60);
            c.querySelector('.c-subtitle').innerText = d.subtitle;
        });
    },

    autoSize(el, max, min) {
        let fs = max; el.style.fontSize = fs + 'px';
        while (el.scrollHeight > 700 && fs > min) { fs -= 5; el.style.fontSize = fs + 'px'; }
    },

    async scrape() {
        const url = this.els.urlIn.value.trim(); if (!url) return;
        const btn = this.els.scrapeBtn; const og = btn.innerHTML; btn.innerHTML = '⏳';
        try {
            const res = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
            const d = await res.json(); if (d.error) throw new Error(d.error);

            this.state.data.A.bg = d.images.a; this.state.data.A.tag = d.source || 'NEWS';
            this.state.data.B.bg = d.images.b; this.state.data.C.bg = d.images.c;
            
            if (d.ai_variants) {
                ['A', 'B', 'C'].forEach(v => {
                    const variant = d.ai_variants[`variant_${v.toLowerCase()}`];
                    this.state.data[v].title = variant.title.toUpperCase();
                    this.state.data[v].subtitle = variant.subtitle;
                    this.state.data[v].caption = variant.caption;
                });
            } else {
                const t = d.original.title.substring(0, 40).toUpperCase();
                const s = d.original.subtitle.substring(0, 80);
                ['A', 'B', 'C'].forEach(v => { this.state.data[v].title = t; this.state.data[v].subtitle = s; this.state.data[v].caption = 'Manual mode.'; });
            }
            this.els.editor.classList.remove('hidden');
            this.switchVar('A'); this.render();
        } catch (e) { alert(e.message); } finally { btn.innerHTML = og; }
    },

    fitCards() {
        ['mountA', 'mountB', 'mountC'].forEach((id, i) => {
            const m = document.getElementById(id); if (!m) return;
            const s = Math.min(m.clientWidth / 1080, m.clientHeight / 1350);
            document.getElementById(['cardA', 'cardB', 'cardC'][i]).style.transform = `scale(${s})`;
        });
    },

    async download(v) {
        const n = document.getElementById(`card${v}`); const btn = this.els.dlBtn; const og = btn.innerHTML;
        btn.innerHTML = 'SAVING...'; n.style.transform = 'none';
        try {
            const d = await htmlToImage.toPng(n, { width: 1080, height: 1350, style: { transform: 'none' }, useCORS: true, pixelRatio: 1 });
            const a = document.createElement('a'); a.download = `Sentient_V15_${v}.png`; a.href = d; a.click();
        } catch (e) { alert('Error saving'); } finally { this.fitCards(); btn.innerHTML = og; }
    }
};
App.init();
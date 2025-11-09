// --- CONFIGURACIÓN DE TEMAS Y LAYOUTS ---
const THEMES = {
    "default": { overlay: "rgba(0,0,0,0.5)" },
    "theme-cyber": { overlay: "linear-gradient(to bottom, rgba(0,255,249,0.1), rgba(5,1,13,0.9))" },
    "theme-elegant": { overlay: "rgba(0,0,0,0.3)" }
};

// Recuperado: Lista dinámica de layouts para no perder flexibilidad
const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)' },
    { id: 'layout-centered', name: 'Centered (Middle)' },
    { id: 'layout-bold', name: 'Bold (Top Left)' }
];

const App = {
    // Estado centralizado de la aplicación
    state: {
        active: 'A',
        theme: 'default',
        data: {
            A: { title: 'READY', subtitle: 'Paste an article URL to begin...', bg: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080', tag: 'NEWS', layout: 'layout-standard', caption: '' },
            B: { title: 'SET', subtitle: 'Choose your preferred variant...', bg: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1080', tag: 'FEATURE', layout: 'layout-centered', caption: '' },
            C: { title: 'GO', subtitle: 'Customize text and export HD.', bg: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?q=80&w=1080', tag: 'VIRAL', layout: 'layout-bold', caption: '' }
        }
    },

    // Inicialización principal
    init() {
        this.cacheDOM();
        this.initUI(); // Recuperado: Generación de UI dinámica
        this.bindEvents();
        this.renderAll();
        lucide.createIcons();
        this.fitStage();
        // Asegurar re-renderizado cuando carguen las fuentes
        document.fonts.ready.then(() => { this.renderAll(); this.fitStage(); });
        window.addEventListener('resize', () => this.fitStage());
    },

    // Cacheo de referencias al DOM para mejorar rendimiento
    cacheDOM() {
        const $ = (id) => document.getElementById(id);
        this.els = {
            url: $('urlInput'), scrape: $('scrapeBtn'), editor: $('editorPanel'), dl: $('dlBtn'),
            ti: $('titleInput'), sub: $('subInput'), lay: $('layoutSelector'), theme: $('themeSelector'),
            iUrl: $('imgUrlInput'), iFile: $('imgFileInput'), cap: $('captionPreview'), cpy: $('copyBtn')
        };
    },

    // Recuperado: Generación dinámica de opciones de layout
    initUI() {
        this.els.lay.innerHTML = ''; // Limpiar por si acaso
        LAYOUTS.forEach(l => {
            const o = document.createElement('option');
            o.value = l.id;
            o.innerText = l.name;
            this.els.lay.appendChild(o);
        });
    },

    // Asignación de eventos a controles
    bindEvents() {
        this.els.scrape.onclick = () => this.scrape();
        ['A', 'B', 'C'].forEach(v => document.getElementById(`btnVar${v}`).onclick = () => this.switchVar(v));
        
        this.els.theme.onchange = (e) => {
            this.state.theme = e.target.value;
            document.body.className = (e.target.value === 'default' ? '' : e.target.value);
            this.renderAll();
        };
        
        // "Live Binding": actualiza el estado y renderiza al teclear
        const up = () => this.renderCard(this.state.active);
        this.els.ti.oninput = (e) => { this.state.data[this.state.active].title = e.target.value; up(); };
        this.els.sub.oninput = (e) => { this.state.data[this.state.active].subtitle = e.target.value; up(); };
        this.els.lay.onchange = (e) => { this.state.data[this.state.active].layout = e.target.value; up(); };
        this.els.iUrl.oninput = (e) => { this.state.data[this.state.active].bg = e.target.value; up(); };
        
        // Manejo de subida de imagen local
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
            const og = this.els.cpy.innerText;
            this.els.cpy.innerText = 'COPIED!';
            setTimeout(() => this.els.cpy.innerText = og, 2000);
        };
    },

    // Cambio de variante activa (A/B/C)
    switchVar(v) {
        this.state.active = v;
        ['A', 'B', 'C'].forEach(x => {
            document.getElementById(`btnVar${x}`).classList.toggle('active', x === v);
            document.getElementById(`mock${x}`).classList.toggle('inactive', x !== v);
        });
        // Cargar datos en los inputs
        const d = this.state.data[v];
        this.els.ti.value = d.title;
        this.els.sub.value = d.subtitle;
        this.els.lay.value = d.layout;
        this.els.cap.innerText = d.caption || 'Waiting for content generation...';
        if (!d.bg.startsWith('data:')) this.els.iUrl.value = d.bg;
        this.fitStage();
    },

    // Renderizado de una tarjeta específica
    renderCard(v, targetId = `card${v}`) {
        const c = document.getElementById(targetId);
        if (!c) return;
        const d = this.state.data[v];
        const th = THEMES[this.state.theme] || THEMES.default;

        // Aplicar datos al DOM
        c.querySelector('.card-bg').src = d.bg;
        c.querySelector('.card-overlay').style.background = th.overlay;
        c.querySelector('.card-content').className = `card-content ${d.layout}`;
        c.querySelector('.c-pill').textContent = d.tag;
        
        const t = c.querySelector('.c-title');
        const s = c.querySelector('.c-subtitle');
        t.innerText = d.title;
        s.innerText = d.subtitle;
        
        // Auto-fit solo si no es el renderizado HD (que tiene el suyo propio al descargar)
        if (!targetId.startsWith('hd-')) {
            this.autoFit(t, 120, 60, 650);
            this.autoFit(s, 56, 30, 400);
        }
    },

    renderAll() { ['A', 'B', 'C'].forEach(v => this.renderCard(v)); },

    // Ajuste automático de tamaño de texto
    autoFit(el, max, min, hMax) {
        let fs = max;
        el.style.fontSize = fs + 'px';
        while (el.scrollHeight > hMax && fs > min) {
            fs -= 2;
            el.style.fontSize = fs + 'px';
        }
    },

    // Ajuste de escala para la previsualización en pantalla
    fitStage() {
        ['A','B','C'].forEach(v => {
            const w = document.getElementById(`mount${v}`);
            const c = document.getElementById(`card${v}`);
            if (w && c) {
                // Usamos el wrapper para calcular la escala necesaria para 1080x1350
                const scale = Math.min(w.clientWidth / 1080, w.clientHeight / 1350);
                c.style.transform = `scale(${scale})`;
            }
        });
    },

    // Lógica de Scraping + IA
    async scrape() {
        const url = this.els.url.value.trim();
        if (!url) return;
        
        this.els.scrape.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
        lucide.createIcons();

        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url})
            });
            const d = await res.json();
            if (d.error) throw new Error(d.error);
            
            // Actualizar estado con datos nuevos
            this.state.data.A.bg = d.images.a;
            this.state.data.A.tag = d.source || 'NEWS';
            this.state.data.B.bg = d.images.b;
            this.state.data.C.bg = d.images.c;

            if (d.ai_variants) {
                ['A','B','C'].forEach(v => {
                    const vr = d.ai_variants[`variant_${v.toLowerCase()}`];
                    if (vr) {
                        this.state.data[v].title = vr.title.toUpperCase();
                        this.state.data[v].subtitle = vr.subtitle;
                        this.state.data[v].caption = vr.caption;
                    }
                });
            }
            
            this.els.editor.classList.remove('hidden');
            this.switchVar('A');
            this.renderAll();

        } catch (e) {
            alert('Error: ' + e.message);
        } finally {
            this.els.scrape.innerHTML = '<i data-lucide="sparkles"></i>';
            lucide.createIcons();
        }
    },

    // Descarga en HD usando el escenario oculto
    async downloadHD() {
        const btn = this.els.dl;
        const og = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> RENDERING...';
        btn.disabled = true;
        lucide.createIcons();

        try {
            // 1. Preparar escenario HD
            this.renderCard(this.state.active, 'hd-render-card');
            const hd = document.getElementById('hd-render-card');
            this.autoFit(hd.querySelector('.c-title'), 140, 70, 700); // Reflow específico para HD
            
            // 2. Esperar a que las imágenes estén listas
            await new Promise(resolve => {
                const img = hd.querySelector('.card-bg');
                if (img.complete && img.naturalHeight !== 0) resolve();
                else { img.onload = resolve; img.onerror = resolve; }
                setTimeout(resolve, 2000); // Timeout de seguridad
            });
            
            // 3. Pequeña pausa para asegurar renderizado de fuentes
            await new Promise(r => setTimeout(r, 500));

            // 4. Capturar
            const dataUrl = await htmlToImage.toPng(hd, { quality: 1.0, pixelRatio: 1 });
            
            // 5. Descargar
            const a = document.createElement('a');
            a.download = `Sentient_${this.state.data[this.state.active].tag}_HD.png`;
            a.href = dataUrl;
            a.click();

        } catch (e) {
            console.error(e);
            alert('Export failed. Please try again.');
        } finally {
            btn.innerHTML = og;
            btn.disabled = false;
            lucide.createIcons();
        }
    }
};

// Iniciar la aplicación
App.init();
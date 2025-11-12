// ui-manager.js

import { CARD_IDS, LAYOUTS, OVERLAYS } from './utils.js';

export const UIManager = {
    // --- RENDERING CORE ---
    renderCard(app, v, tid = `card${v}`) {
        const c = document.getElementById(tid); if (!c) return;
        const d = app.state.data[v];
        const isChatGPTricks = app.state.theme.id === 'chatgptricks';
        
        const ovs = (app.state.theme && app.state.theme.overlays) 
            ? app.state.theme.overlays 
            : { black: 'rgba(0,0,0,0.5)', white: 'rgba(255,255,255,0.3)' }; 

        if (v === 'D') {
             if (app.els.captionTextD) app.els.captionTextD.innerText = d.caption;
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
            this.autoFit(app, t, isChatGPTricks ? 180 : 140, isChatGPTricks ? 80 : 70, 700); 
            this.autoFit(app, s, 56, 30, 400); 
        }
    },

    renderAll(app) { 
        CARD_IDS.forEach(v => {
            this.renderCard(app, v);
            const d = app.state.data[v];
            const t = document.querySelector(`#card${v} .c-title`);
            const s = document.querySelector(`#card${v} .c-subtitle`);
            const isChatGPTricks = app.state.theme.id === 'chatgptricks';
            
            if (t) t.textContent = d.title;
            if (s) s.textContent = d.subtitle;
            
            const mockEl = document.getElementById(`mock${v}`);
            const isActive = v === app.state.active;
            
            mockEl.classList.toggle('active-stage', isActive); 
            mockEl.classList.toggle('inactive', !isActive && v !== 'D');
            
            if (t && !d.isPlaceholder) this.autoFit(app, t, isChatGPTricks ? 180 : 120, isChatGPTricks ? 80 : 60, 650);
            if (s && !d.isPlaceholder) this.autoFit(app, s, 56, 30, 400);
        }); 
        this.fitStage(app);
    },
    
    autoFit(app, el, maxFs, minFs, maxHeight) { 
        let fs = maxFs; 
        el.style.fontSize = fs + 'px'; 
        while (el.scrollHeight > maxHeight && fs > minFs) { 
            fs -= 2; 
            el.style.fontSize = fs + 'px'; 
        } 
    },
    
    fitStage(app) { 
        CARD_IDS.forEach(v => { 
            const w = document.getElementById(`mount${v}`); 
            const c = document.getElementById(`card${v}`); 
            if (w && c) {
                if (v === 'D') return;

                const scale = Math.min(w.clientWidth / 1080, w.clientHeight / 1350);
                c.style.transform = `scale(${scale})`; 
            }
        }); 
    },

    // --- INPUT HANDLERS (for editable text on card) ---
    handleFocus(app, el, type) {
        const v = el.closest('.mockup').id.replace('mock', '');
        const d = app.state.data[v];
        
        if (d.isPlaceholder) {
            requestAnimationFrame(() => {
                el.textContent = '';
                el.classList.remove('is-placeholder');
                d.isPlaceholder = false;
            });
        }
    },

    handleBlur(app, el, type) {
        const v = el.closest('.mockup').id.replace('mock', '');
        const d = app.state.data[v];
        const currentText = el.textContent; 
        const trimmedText = currentText.trim();
        const isChatGPTricks = app.state.theme.id === 'chatgptricks';

        if (trimmedText === '') {
            d.isPlaceholder = true;
            d.title = d.defaultTitle;
            d.subtitle = d.defaultSubtitle;
            
            if (type === 'title') el.textContent = d.defaultTitle;
            else el.textContent = d.defaultSubtitle;
            
            el.classList.add('is-placeholder');
        } else {
            d.isPlaceholder = false;
            
            if (type === 'title') {
                 this.autoFit(app, el, isChatGPTricks ? 180 : 120, isChatGPTricks ? 80 : 60, 650);
            } else {
                 this.autoFit(app, el, 56, 30, 400);
            }
            if (type === 'title') d.title = currentText;
            if (type === 'subtitle') d.subtitle = currentText;
        }
    },

    updateTextFromCard(app, el, type) {
        const v = el.closest('.mockup').id.replace('mock', '');
        const newText = el.textContent; 
        const isChatGPTricks = app.state.theme.id === 'chatgptricks';

        if (type === 'subtitle' && isChatGPTricks) {
             if (newText.trim() !== app.state.data[v].subtitle) {
                 el.textContent = app.state.data[v].subtitle; 
             }
             return;
        }

        if (type === 'title') {
            app.state.data[v].title = newText;
        } else {
            app.state.data[v].subtitle = newText;
        }
    },
    
    // --- UI/EVENT LOGIC ---

    bindEvents(app) {
        // Landing Page Events
        app.els.scrape.onclick = () => app.animateFusionAndScrape();
        app.els.landingUrl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                app.animateFusionAndScrape();
            }
        };

        // Variant activation from the mockup click
        CARD_IDS.forEach(v => document.getElementById(`mock${v}`).onclick = () => app.switchVar(v));
        
        // --- FIX: Add null check for theme selector (app.els.theme is null) ---
        if (app.els.theme) {
            app.els.theme.onchange = (e) => app.applyTheme(e.target.value);
        }

        const up = () => app.renderCard(app.state.active);
        
        // MOCKUP CONTROL LOGIC (Add null checks for controls)
        if (app.els.layoutBtn) {
            app.els.layoutBtn.onclick = () => {
                const currentLayout = app.state.data[app.state.active].layout;
                const currentIndex = LAYOUTS.findIndex(l => l.id === currentLayout);
                const nextIndex = (currentIndex + 1) % LAYOUTS.length;
                
                app.state.data[app.state.active].layout = LAYOUTS[nextIndex].id;
                app.els.layoutValue.textContent = LAYOUTS[nextIndex].short;
                up();
            };
        }
        
        if (app.els.overlayBtn) {
            app.els.overlayBtn.onclick = () => {
                const currentOverlay = app.state.data[app.state.active].overlayColor;
                const currentIndex = OVERLAYS.findIndex(o => o.id === currentOverlay);
                const nextIndex = (currentIndex + 1) % OVERLAYS.length;
                
                app.state.data[app.state.active].overlayColor = OVERLAYS[nextIndex].id;
                app.els.overlayValue.textContent = OVERLAYS[nextIndex].short;
                up();
            };
        }

        if (app.els.iUrl) app.els.iUrl.oninput = (e) => { 
            app.state.data[app.state.active].bg = e.target.value; 
            up(); 
        };
        if (app.els.blur) app.els.blur.oninput = (e) => { app.state.data[app.state.active].blur = e.target.value; up(); };
        if (app.els.contrast) app.els.contrast.oninput = (e) => { app.state.data[app.state.active].contrast = e.target.value; up(); };

        if (app.els.iFile) {
            app.els.iFile.onchange = (e) => {
                if (e.target.files?.[0]) {
                    const r = new FileReader();
                    r.onload = (ev) => { 
                        app.state.data[app.state.active].bg = ev.target.result; 
                        up(); 
                        app.els.iUrl.value = "(Local Image Loaded)"; 
                    };
                    r.readAsDataURL(e.target.files[0]);
                }
            };
        }
        
        // --- FIX: The obsolete app.els.dl binding is removed. We only rely on the dynamically created download button.
        // The original dl button is the download button inside the sidebar, which is now removed.
        // We ensure a null check is used, just in case (though it should be null).
        if (app.els.dl) {
            app.els.dl.onclick = () => app.downloadHD();
        }
        
        if (app.els.copyBtnD) app.els.copyBtnD.onclick = (e) => {
            e.stopPropagation();
            app.copyCaption();
        }
    },

    switchVar(app, v) {
        app.state.active = v;
        CARD_IDS.forEach(x => { 
            const mockEl = document.getElementById(`mock${x}`);
            const isActive = x === v;
            mockEl.classList.toggle('active-stage', isActive); 
            mockEl.classList.toggle('inactive', !isActive && x !== 'D');
            if (isActive) {
                const mockupEl = document.getElementById(`mock${x}`);
                if (mockupEl) mockupEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        });
        
        const d = app.state.data[v];
        
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

        const isContentCard = (v !== 'D');
        app.els.activeControls.classList.toggle('opacity-0', !isContentCard);
        app.els.activeControls.classList.toggle('pointer-events-none', !isContentCard);
        
        if (isContentCard) {
            const layoutShort = LAYOUTS.find(l => l.id === d.layout)?.short || 'ERR';
            const overlayShort = OVERLAYS.find(o => o.id === d.overlayColor)?.short || 'ERR';

            app.els.layoutValue.textContent = layoutShort;
            app.els.overlayValue.textContent = overlayShort;
            app.els.blur.value = d.blur;
            app.els.contrast.value = d.contrast;
            if (!d.bg.startsWith('data:')) {
                app.els.iUrl.value = d.bg;
            } else {
                app.els.iUrl.value = "(Local Image Loaded)";
            }
        }
        
        this.fitStage(app);
    },
    
    positionControls(app) {
        app.els.stageGrid.style.transform = ''; 
    },
    
    updateTopControlBar(app, url, downloadFn = null) {
        const pill = app.els.loadingPill;
        pill.classList.remove('loading-state');
        pill.classList.add('app-state');
        
        let content = `<span class="url-text" title="${url}">${url}</span>`;
        
        if (downloadFn) {
            content += `<button class="download-btn" id="downloadTopBtn" onclick="App.downloadHD()"><i data-lucide="download"></i> DOWNLOAD</button>`;
        }

        pill.innerHTML = content;
        lucide.createIcons();
    },

    copyCaption(app) {
        const captionToCopy = app.els.captionTextD.innerText;
        navigator.clipboard.writeText(captionToCopy); 
        app.toast('Caption copied to clipboard!'); 
    },
}
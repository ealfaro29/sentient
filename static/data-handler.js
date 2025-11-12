// static/data-handler.js

import { toast, CARD_IDS, setP5State, setAttractionCenter } from './utils.js';

export const DataHandler = {
    async loadInitialPlaceholders(app) {
        try {
            const res = await fetch('/api/initial_images');
            if (!res.ok) throw new Error('Failed to fetch initial images');
            const data = await res.json();
            if (data.A) app.state.data.A.bg = data.A;
            if (data.B) app.state.data.B.bg = data.B;
            if (data.C) app.state.data.C.bg = data.C;
        } catch (e) {
            console.error("Error loading initial placeholders:", e);
        }
    },

    startBinaryAnimation(app) {
        let text = app.els.loadingPill.querySelector('.binary-animation');
        let interval = setInterval(() => {
            if (app.state.mode !== 'LOADING') {
                clearInterval(interval);
                return;
            }
            const randomBinary = Array.from({ length: 30 }, () => Math.round(Math.random())).join('');
            text.textContent = randomBinary;
        }, 100);
    },

    async animateFusionAndScrape(app) {
        const url = app.els.landingUrl.value.trim();
        if (!url) { toast('Please enter a URL first.', 'error'); return; }
        
        // Safety check for critical elements
        if (!app.els.landingUrl || !app.els.scrape || !app.els.appStage || !app.els.landingInputWrapper) {
            app.cacheDOM(); 
        }
        if (!app.els.landingUrl || !app.els.scrape || !app.els.appStage || !app.els.landingInputWrapper) {
            console.error("Landing elements not found in cache even after retry.");
            toast("UI Error: Cannot start, please reload.", "error");
            return;
        }
        
        app.state.url = url;
        const pill = app.els.loadingPill;
        const inputRect = app.els.landingUrl.getBoundingClientRect();
        const btnRect = app.els.scrape.getBoundingClientRect();

        // 1. Posicionamiento INICIAL (Fixed) - NO MOVIMIENTO, SOLO APARICIÓN EN LUGAR
        pill.style.position = 'fixed';
        pill.style.transition = 'opacity 0.3s ease-out, width 0s, height 0s, left 0s, top 0s'; 
        
        const initialWidth = inputRect.width + btnRect.width;
        const initialHeight = inputRect.height;
        const initialLeft = inputRect.left;
        const initialTop = inputRect.top;
        
        pill.style.width = `${initialWidth}px`;
        pill.style.height = `${initialHeight}px`;
        pill.style.left = `${initialLeft}px`;
        pill.style.top = `${initialTop}px`;
        pill.style.transform = 'translate(0, 0)';
        pill.style.borderRadius = `${initialHeight}px`;
        pill.style.background = getComputedStyle(app.els.scrape).backgroundColor;
        pill.innerHTML = `<span class="font-extrabold text-black">ANALYZING...</span>`;
        pill.style.opacity = 0; 

        // Ocultar elementos originales
        app.els.landingInputWrapper.style.opacity = '0'; 
        app.els.scrape.style.opacity = '0';
        app.els.fusionContainer.style.display = 'none'; 

        app.setAppState('LOADING'); 
        
        // 2. Iniciar animación de progreso EN EL MISMO LUGAR
        setTimeout(() => {
            // Habilitar transición de tamaño para la píldora (simula la "fusión")
            pill.style.transition = 'all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)'; 
            pill.style.opacity = 1;

            // Reducir tamaño al tamaño final de la píldora de progreso
            const finalPillWidth = 250;
            const finalPillHeight = 38;
            
            // Recalcular posición para mantenerlo CENTRADO en su espacio original
            const finalLeft = initialLeft + initialWidth / 2 - finalPillWidth / 2; 
            const finalTop = initialTop + initialHeight / 2 - finalPillHeight / 2;
            
            pill.style.width = `${finalPillWidth}px`;
            pill.style.height = `${finalPillHeight}px`;
            pill.style.left = `${finalLeft}px`;
            pill.style.top = `${finalTop}px`;
            
            // 3. Empezar animación de partículas y binario
            setAttractionCenter(window.innerWidth / 2, window.innerHeight / 2);
            setP5State('ATTRACT'); 
            
            setTimeout(() => {
                pill.classList.add('loading-state');
                pill.innerHTML = '<span class="binary-animation">10101010101010101010101010101010</span>';
                this.startBinaryAnimation(app);
                this.scrapeContent(app, url);
            }, 600); // Espera a que termine la animación de "fusión"
        }, 50); // Pequeño retraso para asegurar que la opacidad 0 inicial se aplique
    },

    async scrapeContent(app, url) {
        try {
            const res = await fetch('/api/scrape', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({url}) 
            });
            const d = await res.json(); 
            if (d.error) throw new Error(d.error);

            setP5State('EXPLODE'); 
            
            const pill = app.els.loadingPill;
            pill.classList.remove('loading-state');
            
            // 1. Transición LENTA y SUAVE al TOP (1.2s de subida)
            pill.style.position = 'fixed'; 
            pill.style.transition = 'all 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'; 
            
            // Aplicar clase para la subida. La posición final se define en CSS .app-state
            pill.classList.remove('app-state'); 
            pill.classList.add('app-state'); 
            
            // 2. Transición de estado APP (para que las tarjetas aparezcan)
            await new Promise(resolve => setTimeout(resolve, 500)); // Esperar un poco antes de mostrar tarjetas
            app.setAppState('APP'); 
            
            // 3. Restaurar UI de Landing
            app.els.landingUrl.value = '';
            app.els.fusionContainer.style.display = 'flex'; 
            
            // 4. Preparar Data Structure
            const isChatGPTricks = app.state.theme.id === 'chatgptricks';
            const commonCaption = d.ai_content?.common_caption || d.original.subtitle || 'Caption not found.';
            const variants = d.ai_content?.variants || { A: { title: d.original.title, subtitle: d.original.subtitle }, B: { title: d.original.title, subtitle: d.original.subtitle }, C: { title: d.original.title, subtitle: d.original.subtitle } };

            app.state.data.A.bg = d.images.a; app.state.data.A.tag = 'NEWS';
            app.state.data.B.bg = d.images.b; app.state.data.B.tag = 'STORY';
            app.state.data.C.bg = d.images.c; app.state.data.C.tag = 'BREAKING';
            app.state.data.D.caption = commonCaption;
            
            // 5. Aparición Suave de Tarjetas (una tras otra)
            for (let i = 0; i < CARD_IDS.length; i++) { 
                const v = CARD_IDS[i];
                
                // Card D ya es visible gracias al CSS. No añadir 'visible-card'
                // si ya la tiene.
                const mockEl = document.getElementById(`mock${v}`);
                if (!mockEl) continue;

                // Solo aplicar animación de entrada a A, B, C
                if (v !== 'D') {
                    await new Promise(resolve => setTimeout(resolve, 150)); 
                    mockEl.classList.add('visible-card');
                }

                const cardData = app.state.data[v];
                cardData.isPlaceholder = false; 
                cardData.tag = v === 'D' ? 'CAPTION' : ['NEWS', 'STORY', 'BREAKING'][i];
                cardData.title = v === 'D' ? cardData.defaultTitle : variants[v].title.toUpperCase(); 
                cardData.subtitle = v === 'D' ? cardData.defaultSubtitle : (isChatGPTricks ? '' : variants[v].subtitle);

                app.renderCard(v);
                
                // Si es Card D, ya es visible, pero la renderizamos con el contenido
                if (v === 'D') {
                    mockEl.classList.add('visible-card'); // Asegurar por si acaso
                }
            }


            // 6. Finalización
            app.updateTopControlBar(url, app.downloadHD.bind(app));
            app.switchVar('A'); 
            
            // Se muestra la barra de edición DESPUÉS de que todo ha cargado.
            app.els.activeControls.classList.add('is-visible');
            
            toast('Content processed successfully!');
            setP5State('FREE'); 

        } catch (e) {
            console.error("Scrape error:", e);
            setP5State('FREE'); 
            app.setAppState('LANDING'); 
            
            toast('Link unreachable or scraping failed. Try alternative source.', 'error');
            this.showFallback(app, url);
        }
    },

    async showFallback(app, failedUrl) {
        app.els.topControlBar.classList.add('hidden');
        
        app.els.fbModal.classList.remove('hidden'); 
        app.els.fbModal.style.display = 'flex';
        app.els.fbMsg.innerHTML = 'Scraping failed. Analyzing URL to find similar sources...';
        app.els.fbList.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim);"><i data-lucide="loader-2" class="spin" style="width:32px; height:32px; opacity:0.5;"></i></div>';
        lucide.createIcons();

        try {
            const res = await fetch('/api/search_alternatives', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url: failedUrl})
            });
            const data = await res.json();

            const safeQuery = encodeURIComponent(data.query || 'latest news');
            app.els.fbGoogle.href = `https://www.google.com/search?q=${safeQuery}`;

            if (!data.results || data.results.length === 0) {
                app.els.fbMsg.innerHTML = `Couldn't find direct alternatives for <b>"${data.query}"</b>. Try the Google button below.`;
                app.els.fbList.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.6; font-style:italic;">No matches found.</div>';
                return;
            }

            app.els.fbMsg.innerHTML = `Source blocked. Here are similar articles for: <b style="color:var(--brand)">"${data.query}"</b>`;
            app.els.fbList.innerHTML = ''; 

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
                    app.els.landingUrl.value = r.url; 
                    app.els.fbModal.style.display = 'none';
                    app.els.fbModal.classList.add('hidden'); 
                    toast(`Retrying with new source...`);
                    this.animateFusionAndScrape(app); 
                };
                app.els.fbList.appendChild(item);
            });

        } catch (e) {
            console.error(e);
            app.els.fbMsg.innerText = 'Error during alternative search.';
            app.els.fbList.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">${e.message}</div>`;
        }
    },

    async downloadHD(app) {
        const btn = document.getElementById('downloadTopBtn') || app.els.dl;
        if (!btn) {
            toast('Download button not found.', 'error');
            return;
        }
        
        const ogHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> RENDERING HD...'; 
        btn.disabled = true; 
        lucide.createIcons(); 
        
        try {
            const activeCardData = app.state.data[app.state.active]; 
            if (app.state.active === 'D') {
                 toast('Cannot export the Caption Card (D). Please select a visual card (A, B, or C).', 'error');
                 btn.innerHTML = ogHtml; btn.disabled = false; lucide.createIcons();
                 return;
            }
            
            app.renderCard(app.state.active, 'hd-render-card');
            const hd = document.getElementById('hd-render-card');
            
            hd.querySelector('.c-title').textContent = activeCardData.title;
            hd.querySelector('.c-subtitle').textContent = activeCardData.subtitle;

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
            if (currentBg && !currentBg.startsWith('data:')) {
                 hdImg.src = `/api/proxy_image?url=${encodeURIComponent(currentBg)}`;
            } else if (currentBg) {
                hdImg.src = currentBg;
            }
            
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
            const tag = activeCardData.layout === 'layout-chatgptricks' ? 'TRICKS' : activeCardData.tag;
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
}
// data-handler.js

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
            app.cacheDOM(); // Attempt re-caching
        }
        if (!app.els.landingUrl || !app.els.scrape || !app.els.appStage || !app.els.landingInputWrapper) {
            console.error("Landing elements not found in cache even after retry.");
            toast("UI Error: Cannot start, please reload.", "error");
            return;
        }
        
        app.state.url = url;
        const pill = app.els.loadingPill;
        
        // 1. Get initial positions
        const inputRect = app.els.landingUrl.getBoundingClientRect();
        const btnRect = app.els.scrape.getBoundingClientRect();

        // 2. Initial Fusion Look (Position fixed relative to viewport)
        pill.style.position = 'fixed';
        pill.style.width = `${inputRect.width + btnRect.width}px`;
        pill.style.height = `${inputRect.height}px`;
        pill.style.left = `${inputRect.left}px`;
        pill.style.top = `${inputRect.top}px`;
        pill.style.borderRadius = `${inputRect.height}px`;
        pill.style.background = getComputedStyle(app.els.scrape).backgroundColor;
        pill.innerHTML = `<span class="font-extrabold text-black">ANALYZING...</span>`;
        pill.style.opacity = 1;

        // FIX: Hide the input wrapper (containing the SVG) and the button
        app.els.landingInputWrapper.style.opacity = '0'; 
        app.els.scrape.style.opacity = '0';
        
        app.setAppState('LOADING'); 

        // 3. Animate to screen center and start ATTRACT mode
        setTimeout(() => {
            pill.style.transition = 'all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            pill.style.width = '250px';
            pill.style.height = '38px';
            pill.style.left = '50%';
            pill.style.top = '50%'; 
            pill.style.transform = 'translate(-50%, -50%)'; // FULL CENTERED
            
            // Set particle attraction center to the pill's centered position
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            setAttractionCenter(centerX, centerY);
            setP5State('ATTRACT'); // Start particle orbit
            
            setTimeout(() => {
                pill.classList.add('loading-state');
                pill.innerHTML = '<span class="binary-animation">10101010101010101010101010101010</span>';
                this.startBinaryAnimation(app);
                
                // Start scraping AFTER the pill reaches the center
                this.scrapeContent(app, url);
            }, 600);
        }, 300);
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

            // Phase 3a: Success - Explode particles and start top bar transition
            setP5State('EXPLODE'); 
            
            const pill = app.els.loadingPill;
            pill.classList.remove('loading-state');
            
            // 1. Prepare for APP state transition (Move pill to top bar position)
            pill.style.position = 'absolute'; // Change back to absolute (relative to #topControlBar)
            pill.style.transition = 'all 0.6s ease-in-out'; // Use smoother transition for final move
            pill.style.width = '600px';
            pill.style.height = '48px';
            pill.style.left = '50%';
            pill.style.top = '6px'; 
            pill.style.transform = 'translate(-50%, 0)';

            // Set APP state and data after 300ms (to allow pill to start moving)
            await new Promise(resolve => setTimeout(resolve, 300));
            app.setAppState('APP'); 
            
            // 2. Reset Landing UI (for future use)
            app.els.landingUrl.value = '';
            app.els.landingInputWrapper.style.opacity = '1'; // FIX: Restore opacity for next use
            app.els.scrape.style.opacity = '1'; // Restore button opacity

            // 3. Prepare Data Structure
            const isChatGPTricks = app.state.theme.id === 'chatgptricks';
            const commonCaption = d.ai_content?.common_caption || d.original.subtitle || 'Caption not found.';
            const variants = d.ai_content?.variants || { A: { title: d.original.title, subtitle: d.original.subtitle }, B: { title: d.original.title, subtitle: d.original.subtitle }, C: { title: d.original.title, subtitle: d.original.subtitle } };

            app.state.data.A.bg = d.images.a; app.state.data.A.tag = 'NEWS';
            app.state.data.B.bg = d.images.b; app.state.data.B.tag = 'STORY';
            app.state.data.C.bg = d.images.c; app.state.data.C.tag = 'BREAKING';
            app.state.data.D.caption = commonCaption;
            
            // 4. Sequential Card Fill Animation
            for (let i = 0; i < CARD_IDS.length; i++) {
                const v = CARD_IDS[i];
                await new Promise(resolve => setTimeout(resolve, 300)); // Delay between cards

                const cardData = app.state.data[v];

                if (v === 'D') { // Caption Card Logic
                    cardData.isPlaceholder = false;
                    app.els.captionTextD.innerText = cardData.caption;
                } else { // A, B, C Content Card Logic
                    cardData.isPlaceholder = false; 
                    cardData.tag = ['NEWS', 'STORY', 'BREAKING'][i];
                    cardData.title = variants[v].title.toUpperCase(); 
                    cardData.subtitle = isChatGPTricks ? '' : variants[v].subtitle;
                }

                app.renderCard(v);
                document.getElementById(`mock${v}`).classList.add('visible-card');
            }

            // 5. Update Final Top Bar
            app.updateTopControlBar(url, app.downloadHD.bind(app));

            app.switchVar('A'); // Set A as active stage
            toast('Content processed successfully!');
            setP5State('FREE'); // Return particles to free movement

        } catch (e) {
            console.error("Scrape error:", e);
            setP5State('FREE'); // Return particles to free movement
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
                    app.els.landingUrl.value = r.url; // Use landing URL input for retry
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
        const ogHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> RENDERING HD...'; 
        btn.disabled = true; 
        lucide.createIcons(); 
        
        try {
            const activeCardData = app.state.data[app.state.active]; 
            if (app.state.active === 'D') {
                 toast('Cannot export the Caption Card (D). Please select a visual card (A, B, or C).', 'error');
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
            if (!currentBg.startsWith('data:')) {
                 hdImg.src = `/api/proxy_image?url=${encodeURIComponent(currentBg)}`;
            }
            
            const isChatGPTricks = activeCardData.layout === 'layout-chatgptricks';
            app.autoFit(hd.querySelector('.c-title'), isChatGPTricks ? 180 : 140, isChatGPTricks ? 80 : 70, 700); 
            app.autoFit(hd.querySelector('.c-subtitle'), 56, 30, 400);
            
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
}
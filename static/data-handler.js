// static/data-handler.js
import { toast } from './utils.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const DataHandler = {
  
  // --- INICIO DE CORRECCIÓN ---
  // 1. Restaurada la lógica de carga de placeholders
  async loadInitialPlaceholders(app) {
    try {
      const res = await fetch('/api/initial_images');
      if (!res.ok) throw new Error('Failed /api/initial_images');
      const data = await res.json();
      if (data.A) app.state.data.A.bg = data.A;
      if (data.B) app.state.data.B.bg = data.B;
      if (data.C) app.state.data.C.bg = data.C;
      if (data.D) app.state.data.D.bg = data.D; 
    } catch (e) {
      console.error('[init placeholders]', e);
    }
  },
  // --- FIN DE CORRECCIÓN ---

  // Función para obtener imágenes de Pexels
  async _fetchPexelsImage(query, count = 1) {
    console.log(`[Frontend: Pexels] Solicitando ${count} imágenes para query: ${query}`);
    if (!query) return [];
    try {
      const res = await fetch('/api/search_image', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count })
      });
      if (!res.ok) throw new Error(`Pexels search failed with status ${res.status}.`);
      const data = await res.json();
      console.log(`[Frontend: Pexels] Recibidas ${data.imageUrls.length} URLs de Pexels.`);
      return data.imageUrls || []; 
    } catch (e) {
      console.error('[pexels search error]', e);
      return [];
    }
  },
  
  finalizeUi: async function(app, url, data) {
    
    app.setAppState('APP'); 

    const articleTitle = data.original?.title || 'latest news';
    const primaryImageUrl = data.images?.a;
    const variantsData = data.ai_content?.variants; 

    const keywords = data.ai_content?.image_keywords;
    const fallbackQuery = (Array.isArray(keywords) && keywords.length > 0 ? keywords.join(' ') : articleTitle) || 'latest news';
    
    // --- INICIO DE CORRECCIÓN ---
    // 2. Volver a buscar 4 imágenes (A, B, C, D)
    const pexelsUrls = await this._fetchPexelsImage(fallbackQuery, 4);
    
    const pexelImg1 = pexelsUrls[0] || '';
    const pexelImg2 = pexelsUrls[1] || pexelImg1; 
    const pexelImg3 = pexelsUrls[2] || pexelImg1; 
    const pexelImg4 = pexelsUrls[3] || pexelImg1; // Imagen para D
    
    if (primaryImageUrl) {
        app.state.data.A.bg = primaryImageUrl;
    } else { 
        app.state.data.A.bg = pexelImg1; 
    } 

    app.state.data.B.bg = pexelImg2; 
    app.state.data.C.bg = pexelImg3;
    app.state.data.D.bg = pexelImg4;
    // --- FIN DE CORRECCIÓN ---
    
    const variants = variantsData || { 
      A: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' },
      B: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' },
      C: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' },
      D: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' }
    };
    
    app.state.data.A.tag = 'NEWS';
    app.state.data.B.tag = 'STORY';
    app.state.data.C.tag = 'BREAKING';
    app.state.data.D.tag = 'NERD'; 
    
    app.state.data.D.isPlaceholder = false;

    ['A','B','C','D'].forEach(v => { 
      const cardData = app.state.data[v];
      
      cardData.isPlaceholder = false;
      cardData.title = (variants[v]?.title || cardData.defaultTitle || '').toUpperCase();
      cardData.subtitle = variants[v]?.subtitle || cardData.defaultSubtitle || '';
      app.renderCard(v);
    });

    // --- INICIO DE CORRECCIÓN ---
    // 3. Restaurar la visibilidad de los elementos de la UI
    app.els.breadcrumbs?.classList.add('visible');
    app.els.nextBtn?.classList.add('visible');
    app.els.host?.classList.add('visible');
    // --- FIN DE CORRECCIÓN ---

    await this._reveal(app, 'A');
    await this._reveal(app, 'B');
    await this._reveal(app, 'C');
    await this._reveal(app, 'D'); 

    // --- INICIO DE CORRECCIÓN ---
    // 4. Corregir la llamada a updateTopControlBar
    app.updateTopControlBar(); 
    // 5. Eliminar el toast de éxito y la selección de tarjeta
    // app.switchVar('A');
    // toast('Content processed successfully!');
    // --- FIN DE CORRECCIÓN ---
    
    if (data.ai_error) {
         toast(`Scrape OK, but AI failed: ${data.ai_error}`, 'warn');
    }
  },

  async scrapeContent(app, url) {
    const res = await fetch('/api/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || `scrape failed: ${res.status}`);
    
    return d;
  },

  async _reveal(app, v) {
    const mock = $(`mock${v}`);
    if (!mock) { console.warn('[reveal] missing', v); return; }
    mock.classList.add('visible-card');
    await sleep(160);
  },

  // --- INICIO DE CORRECCIÓN ---
  // 6. Restaurar la lógica de fallback
  async _failToLanding(app, failedUrl, msg) {
    toast(msg || 'Failed.', 'error');
    
    try { 
      await this.showFallback(app, failedUrl); 
    } catch (e) {
      console.error("Error al mostrar fallback:", e);
      app.setAppState('LANDING'); 
    }
  },

  async showFallback(app, failedUrl) {
    app.els.topControlBar?.classList.add('hidden');
    
    app.els.fbModal?.classList.remove('hidden'); 

    if (app.els.fbMsg)   app.els.fbMsg.innerHTML = 'Scraping failed. Analyzing URL to find similar sources...';
    if (app.els.fbList)  app.els.fbList.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim);"><i data-lucide="loader-2" class="spin" style="width:32px; height:32px; opacity:0.5;"></i></div>';
    window.lucide?.createIcons?.();

    try {
      const res = await fetch('/api/search_alternatives', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: failedUrl })
      });
      const data = await res.json();
      const q = data.query || 'latest news';
      if (app.els.fbGoogle) app.els.fbGoogle.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;

      if (!data.results || data.results.length === 0) {
        if (app.els.fbMsg) app.els.fbMsg.innerHTML = `Couldn't find direct alternatives for <b>"${q}"</b>. Try the Google button below.`;
        if (app.els.fbList) app.els.fbList.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.6; font-style:italic;">No matches found.</div>';
        return;
      }

      if (app.els.fbMsg) app.els.fbMsg.innerHTML = `Source blocked. Here are similar articles for: <b style="color:var(--brand)">"${q}"</b>`;
      
      if (app.els.fbList) {
        app.els.fbList.innerHTML = ''; 
        
        data.results.forEach(r => {
          const item = document.createElement('button'); 
          item.className = 'fallback-item fallback-button'; 
          item.innerHTML = `
            <div class="text-sm font-bold mb-1 text-left">${r.title || 'No title'}</div>
            <div class="text-xs opacity-70 mb-2 text-left">${r.snippet || ''}</div>
            <div class="text-xs text-left underline">Use this source</div>
          `;
          
          item.addEventListener('click', (e) => {
            e.preventDefault();
            const newUrl = r.url;
            if (newUrl) {
                app.restartWithUrl(newUrl);
            }
          });
          
          app.els.fbList.appendChild(item);
        });
      }

    } catch (err) {
      console.error('[fallback] error', err);
      if (app.els.fbMsg)  app.els.fbMsg.innerHTML = 'Could not build alternatives. Try Google.';
      if (app.els.fbList) app.els.fbList.innerHTML = '';
    }
  }
  // --- FIN DE CORRECCIÓN ---
};
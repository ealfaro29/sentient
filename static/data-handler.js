// static/data-handler.js
import { toast } from './utils.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const DataHandler = {
  
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

  finalizeUi: async function(app, url, data) {
    
    app.setAppState('APP'); 

    // Poblar data 
    const variants = data.ai_content?.variants || {
      A: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' },
      B: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' },
      C: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' },
      D: { title: data.original?.title || 'UNTITLED', subtitle: data.original?.subtitle || '' }
    };
    app.state.data.A.bg = data.images?.a || app.state.data.A.bg;
    app.state.data.B.bg = data.images?.b || app.state.data.B.bg;
    app.state.data.C.bg = data.images?.c || app.state.data.C.bg;
    app.state.data.D.bg = data.images?.d || data.images?.c || app.state.data.C.bg; 
    
    app.state.data.A.tag = 'NEWS';
    app.state.data.B.tag = 'STORY';
    app.state.data.C.tag = 'BREAKING';
    app.state.data.D.tag = 'NERD'; 
    
    app.state.data.D.isPlaceholder = false;

    // Renderizar tarjetas antes de la animación de revelación
    ['A','B','C','D'].forEach(v => { 
      const cardData = app.state.data[v];
      
      cardData.isPlaceholder = false;
      cardData.title = (variants[v]?.title || cardData.defaultTitle || '').toUpperCase();
      cardData.subtitle = variants[v]?.subtitle || cardData.defaultSubtitle || '';
      app.renderCard(v);
    });

    // Secuencia visible A→B→C→D (Reveal animation)
    await this._reveal(app, 'A');
    await this._reveal(app, 'B');
    await this._reveal(app, 'C');
    await this._reveal(app, 'D'); 

    app.updateTopControlBar(url, app.downloadHD.bind(app));
    app.switchVar('A');

    toast('Content processed successfully!');
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
    
    // ===== INICIO DE LA CORRECCIÓN =====
    // if (app.els.fbModal) app.els.fbModal.style.display = 'flex'; // <-- LÍNEA ELIMINADA (LA CAUSA DEL BUG)
    app.els.fbModal?.classList.remove('hidden'); // <-- Esta línea es la única necesaria
    // ===== FIN DE LA CORRECCIÓN =====

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
};
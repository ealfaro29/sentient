// static/data-handler.js
import { toast } from './utils.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const DataHandler = {
  
  async _fetchPexelsImage(query, count = 1) {
    // (Esta función no cambia)
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
    
    const pexelsUrls = await this._fetchPexelsImage(fallbackQuery, 4);
    
    const pexelImg1 = pexelsUrls[0] || '';
    const pexelImg2 = pexelsUrls[1] || pexelImg1; 
    const pexelImg3 = pexelsUrls[2] || pexelImg1; 
    const pexelImg4 = pexelsUrls[3] || pexelImg1; 
    
    if (primaryImageUrl) {
        app.state.data.A.bg = primaryImageUrl;
        console.log("[Frontend: FINAL] Card A: Usando imagen primaria del artículo.");
    } else { 
        app.state.data.A.bg = pexelImg1; 
        console.log("[Frontend: FINAL] Card A: Usando PexelsImg1 como respaldo.");
    } 

    app.state.data.B.bg = pexelImg2; 
    app.state.data.C.bg = pexelImg3;
    app.state.data.D.bg = pexelImg4;
    
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

    // --- INICIO DE MODIFICACIÓN ---
    // 1. Hacer visibles los breadcrumbs, el botón Next Y el enlace #host
    app.els.breadcrumbs?.classList.add('visible');
    app.els.nextBtn?.classList.add('visible');
    app.els.host?.classList.add('visible');
    // --- FIN DE MODIFICACIÓN ---

    // Secuencia visible A→B→C→D (Reveal animation)
    await this._reveal(app, 'A');
    await this._reveal(app, 'B');
    await this._reveal(app, 'C');
    await this._reveal(app, 'D'); 

    app.updateTopControlBar(url); 
    
    // (Llamada a switchVar eliminada)
    
    // (Toast de éxito eliminado)
    if (data.ai_error) {
         toast(`Scrape OK, but AI failed: ${data.ai_error}`, 'warn');
    }
  },

  async scrapeContent(app, url) {
    // (Esta función no cambia)
    const res = await fetch('/api/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || `scrape failed: ${res.status}`);
    
    return d;
  },

  async _reveal(app, v) {
    // (Esta función no cambia)
    const mock = $(`mock${v}`);
    if (!mock) { console.warn('[reveal] missing', v); return; }
    mock.classList.add('visible-card');
    await sleep(160);
  }
  
};
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
  
  // FUNCIÓN NUEVA: Obtener prompt detallado de ChatGPT (Backend)
  async _fetchImagePrompt(title, subtitle) {
    console.log(`[Frontend: Prompt] Llamando a /api/generate_prompt para Title: ${title}`);
    if (!title) return '';
    try {
      const res = await fetch('/api/generate_prompt', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, subtitle })
      });
      if (!res.ok) throw new Error(`Prompt generation failed with status ${res.status}.`);
      const data = await res.json();
      console.log(`[Frontend: Prompt] Prompt recibido: ${data.prompt.substring(0, 50)}...`);
      return data.prompt || ''; 
    } catch (e) {
      console.error('[Prompt generation error]', e);
      return '';
    }
  },
  
  // FUNCIÓN EXISTENTE: Generación de imágenes para la Card D
  async _fetchGeminiImage(prompt) {
    console.log(`[Frontend: Gemini] Llamando a /api/generate_image con prompt: ${prompt.substring(0, 50)}...`);
    if (!prompt) return '';
    try {
      const res = await fetch('/api/generate_image', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) throw new Error(`Gemini image generation failed with status ${res.status}.`);
      const data = await res.json();
      const imageUrl = data.imageUrl;
      console.log(`[Frontend: Gemini] URL final de Gemini recibida (vacía si falló): ${imageUrl || 'NONE'}`);
      return imageUrl || ''; 
    } catch (e) {
      console.error('[Gemini image error]', e);
      return '';
    }
  },
  
  finalizeUi: async function(app, url, data) {
    
    app.setAppState('APP'); 

    const articleTitle = data.original?.title || 'latest news';
    const primaryImageUrl = data.images?.a;
    const variantsData = data.ai_content?.variants; 

    // Usar las palabras clave refinadas de la IA si están disponibles, sino el título
    const keywords = data.ai_content?.image_keywords;
    const fallbackQuery = (Array.isArray(keywords) && keywords.length > 0 ? keywords.join(' ') : articleTitle) || 'latest news';
    
    // 1. Preparar el prompt para la imagen generativa de Card D (Nerd)
    const d_variant = variantsData?.D || { title: articleTitle, subtitle: '' }; 
    const promptTitle = d_variant.title;
    const promptSubtitle = d_variant.subtitle;
    
    // 2. Ejecutar tareas asíncronas en paralelo (Generar Prompt + Buscar Pexels)
    const detailedPromptPromise = this._fetchImagePrompt(promptTitle, promptSubtitle);
    const pexelsUrlsPromise = this._fetchPexelsImage(fallbackQuery, 3);
    
    // Esperamos ambas tareas
    const [prompt, pexelsUrls] = await Promise.all([detailedPromptPromise, pexelsUrlsPromise]);

    // 3. Generación de Imagen (Solo si el prompt fue exitoso)
    let generatedUrl = '';
    if (prompt) {
        generatedUrl = await this._fetchGeminiImage(prompt);
    } else {
        console.warn("[Frontend: Gemini] No se generó prompt, saltando _fetchGeminiImage.");
    }
    
    // Asignación de imágenes de Pexels
    const pexelImg1 = pexelsUrls[0];
    const pexelImg2 = pexelsUrls[1] || pexelImg1; // Respaldo para C
    
    // 4. Lógica de Asignación de Imágenes
    
    // Card A: Primaria o PexelsImg1
    if (primaryImageUrl) {
        app.state.data.A.bg = primaryImageUrl;
        console.log("[Frontend: FINAL] Card A: Usando imagen primaria del artículo.");
    } else if (pexelImg1) { 
        app.state.data.A.bg = pexelImg1; 
        console.log("[Frontend: FINAL] Card A: Usando PexelsImg1 como respaldo.");
    } 

    // Card B: PexelsImg1
    if (pexelImg1) {
        app.state.data.B.bg = pexelImg1; 
        console.log("[Frontend: FINAL] Card B: Usando PexelsImg1.");
    }
    
    // Card C: PexelsImg2
    if (pexelImg2) {
        app.state.data.C.bg = pexelImg2;
        console.log("[Frontend: FINAL] Card C: Usando PexelsImg2.");
    }
    
    // Card D: ¡IMAGEN GENERADA! (con PexelsImg1 como respaldo)
    if (generatedUrl) {
        app.state.data.D.bg = generatedUrl;
        console.log("[Frontend: FINAL] Card D: Usando imagen generada por Gemini.");
    } else if (pexelImg1) {
        app.state.data.D.bg = pexelImg1;
        console.log("[Frontend: FINAL] Card D: Usando PexelsImg1 como respaldo.");
    } else {
        console.log("[Frontend: FINAL] Card D: No hay imagen generada ni respaldo de Pexels.");
    }
    
    // Poblar títulos y subtítulos
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
};
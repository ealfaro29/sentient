// static/data-handler.js
import { toast, setP5State, setAttractionCenter } from './utils.js';

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
    } catch (e) {
      console.error('[init placeholders]', e);
    }
  },

  _startBinary(app) {
    const pill = app.els.loadingPill;
    if (!pill) return;
    pill.innerHTML = '<span class="binary-animation">101010101010</span>';
    const t = pill.querySelector('.binary-animation');
    const id = setInterval(() => {
      if (app.state.mode !== 'LOADING') { clearInterval(id); return; }
      t.textContent = Array.from({ length: 36 }, () => (Math.random() < 0.5 ? '0' : '1')).join('');
    }, 100);
  },

  async animateFusionAndScrape(app) {
    const url = app.els?.landingUrl?.value?.trim();
    if (!url) { toast('Please enter a URL first.', 'error'); return; }

    // Estado LOADING
    app.setAppState('LOADING');

    // Píldora sobre input
    const pill = app.els.loadingPill;
    const input = app.els.landingUrl;
    const btn   = app.els.scrape;
    const irect = input.getBoundingClientRect();
    const brect = btn.getBoundingClientRect();
    pill.style.position = 'fixed';
    pill.style.display = 'flex';
    pill.style.alignItems = 'center';
    pill.style.justifyContent = 'center';
    pill.style.fontWeight = '900';
    pill.style.letterSpacing = '0.5px';
    pill.style.background = getComputedStyle(btn).backgroundColor || '#ccff00';
    pill.style.color = '#000';
    pill.style.boxShadow = '0 10px 30px -10px rgba(0,0,0,0.6)';
    pill.style.borderRadius = `${irect.height}px`;
    pill.style.width  = `${irect.width + brect.width}px`;
    pill.style.height = `${irect.height}px`;
    pill.style.left   = `${irect.left}px`;
    pill.style.top    = `${irect.top}px`;
    pill.style.opacity = '0';
    pill.innerHTML = '<span class="font-extrabold">ANALYZING...</span>';

    app.els.landingInputWrapper.style.opacity = '0';
    app.els.scrape.style.opacity = '0';
    app.els.fusionContainer.style.display = 'none';

    // Al centro
    await sleep(50);
    pill.style.transition = 'all 0.6s cubic-bezier(0.68,-0.55,0.265,1.55)';
    pill.style.opacity = '1';
    const midW = 260, midH = 40;
    pill.style.width = `${midW}px`;
    pill.style.height = `${midH}px`;
    pill.style.left   = `${(innerWidth - midW) / 2}px`;
    pill.style.top    = `${(innerHeight - midH) / 2}px`;
    pill.style.borderRadius = '999px';

    setAttractionCenter(innerWidth / 2, innerHeight / 2);
    setP5State('ATTRACT');

    await sleep(600);
    this._startBinary(app);
    this.scrapeContent(app, url).catch(err => {
      console.error('[scrapeContent] error', err);
      this._failToLanding(app, url, 'Link unreachable or scraping failed. Try alternative source.');
    });
  },

  async scrapeContent(app, url) {
    const res = await fetch('/api/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);

    // Píldora hacia la barra superior
    setP5State('EXPLODE');
    const pill = app.els.loadingPill;
    const bar  = app.els.topControlBar;
    const dl   = app.els.dl;
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();

    const barRect = bar.getBoundingClientRect();
    pill.style.transition = 'all 1.0s cubic-bezier(0.25,0.46,0.45,0.94)';
    pill.style.width = '220px';
    pill.style.height = '34px';
    pill.style.left = `${barRect.left + 16}px`;
    pill.style.top  = `${barRect.top + (barRect.height - 34) / 2}px`;
    pill.style.opacity = '0.95';

    // Entrar a APP
    await sleep(480);
    app.setAppState('APP');

    // Mostrar URL actual en la píldora y mostrar botón Download **junto a la píldora**
    pill.textContent = host;
    if (dl) dl.style.display = 'inline-flex';

    // Poblar data
    const variants = d.ai_content?.variants || {
      A: { title: d.original?.title || 'UNTITLED', subtitle: d.original?.subtitle || '' },
      B: { title: d.original?.title || 'UNTITLED', subtitle: d.original?.subtitle || '' },
      C: { title: d.original?.title || 'UNTITLED', subtitle: d.original?.subtitle || '' }
    };
    app.state.data.A.bg = d.images?.a || app.state.data.A.bg;
    app.state.data.B.bg = d.images?.b || app.state.data.B.bg;
    app.state.data.C.bg = d.images?.c || app.state.data.C.bg;
    app.state.data.A.tag = 'NEWS';
    app.state.data.B.tag = 'STORY';
    app.state.data.C.tag = 'BREAKING';
    app.state.data.D.caption = d.ai_content?.common_caption || d.original?.subtitle || 'Caption not found.';
    app.state.data.D.isPlaceholder = false;

    // Render previo
    ['A','B','C'].forEach(v => {
      const data = app.state.data[v];
      data.isPlaceholder = false;
      data.title = (variants[v]?.title || data.defaultTitle || '').toUpperCase();
      data.subtitle = variants[v]?.subtitle || data.defaultSubtitle || '';
      app.renderCard(v);
    });
    app.renderCard('D'); // preparar D (caption)

    // Secuencia visible A→B→C→D (D garantizada)
    await this._reveal(app, 'A');
    await this._reveal(app, 'B');
    await this._reveal(app, 'C');
    await this._reveal(app, 'D');

    app.updateTopControlBar(url, app.downloadHD.bind(app));
    app.switchVar('A');
    app.els.activeControls?.classList.add('is-visible');

    setTimeout(() => setP5State('FREE'), 300);
    toast('Content processed successfully!');
  },

  async _reveal(app, v) {
    const mock = $(`mock${v}`);
    if (!mock) { console.warn('[reveal] missing', v); return; }
    mock.classList.add('visible-card');
    await sleep(160);
  },

  async _failToLanding(app, failedUrl, msg) {
    setP5State('FREE');
    app.setAppState('LANDING');
    toast(msg || 'Failed.', 'error');
    try { await this.showFallback(app, failedUrl); } catch {}
  },

  async showFallback(app, failedUrl) {
    app.els.topControlBar?.classList.add('hidden');
    app.els.fbModal?.classList.remove('hidden');
    if (app.els.fbModal) app.els.fbModal.style.display = 'flex';
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
          const item = document.createElement('div');
          item.className = 'fallback-item';
          item.innerHTML = `
            <div class="text-sm font-bold mb-1">${r.title || 'No title'}</div>
            <div class="text-xs opacity-70 mb-2">${r.snippet || ''}</div>
            <a href="${r.url}" target="_blank" class="text-xs underline">Open</a>
          `;
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

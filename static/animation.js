// static/animation.js
import { DataHandler } from './data-handler.js';
import { toast } from './utils.js'; 

let _app; // Referencia a la instancia principal de App

const Animation = {
  
  state: { started: false, apiEnd: 0 },
  
  // Tiempos y física
  API_MS_DEF: 6000, 
  ACCEL_MS: 1900,
  EXP_MS: 1400,
  
  canvasRemoved: false,
  sketch: null,

  // --- Utils ---
  $: (id) => document.getElementById(id),
  rect: (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; },
  hostFrom: (seed) => { try { return new URL(seed).host || seed; } catch { return seed; } },

  // --- Lógica de P5 (partículas) ---
  initSketch: function() {
    const { BASE_G=2600, END_G_MULT=50.0, OMEGA_MIN=0.0002, OMEGA_MAX=0.0002, OMEGA_GAIN=15.0, ACCEL_MS } = this;
    let canvasRemoved = false; 
    
    const sketchHost = document.getElementById('particles');
    if (!sketchHost) return; 
    
    this.sketch = new p5(p => {
      let W=0,H=0, COUNT=300;
      let r,a,vr,x,y,done,vx,vy,w0;
      const EPS=11, VMAX_R=3.2, VMAX_T=100.05;
      let gravityStart=0, gravityEnd=0, mode='ambient', accel=false;
      let explodeStart=0, explodeEnd=0, explodeResolve=null;

      const center = ()=>({x: innerWidth/2, y: innerHeight/2});
      const clamp01=t=>t<0?0:t>1?1:t;
      const easeIn=t=>t*t;
      const gProgress=()=>!gravityStart||!gravityEnd?0:clamp01((performance.now()-gravityStart)/(gravityEnd-gravityStart));

      function alloc(){ r=new Float32Array(COUNT); a=new Float32Array(COUNT); vr=new Float32Array(COUNT);
        w0=new Float32Array(COUNT); x=new Float32Array(COUNT); y=new Float32Array(COUNT);
        done=new Uint8Array(COUNT); vx=new Float32Array(COUNT); vy=new Float32Array(COUNT); }
      function reseed(){
        const c=center(), Rmax=Math.hypot(W,H)*0.55;
        for(let i=0;i<COUNT;i++){
          const u=Math.random();
          r[i]=Math.sqrt(u)*Rmax; a[i]=Math.random()*Math.PI*2;
          w0[i]=OMEGA_MIN+Math.random()*(OMEGA_MAX-OMEGA_MIN);
          vr[i]=0; done[i]=0;
          x[i]=c.x + r[i]*Math.cos(a[i]); y[i]=c.y + r[i]*Math.sin(a[i]);
          vx[i]=0; vy[i]=0;
        }
      }
      function stepAmbient(i,dt){
        a[i]+=w0[i]*dt; const c=center();
        x[i]=c.x + r[i]*Math.cos(a[i]); y[i]=c.y + r[i]*Math.sin(a[i]);
      }
      function stepGravity(i,dt,t){
        if(done[i]) return;
        const c=center(), rr=Math.max(r[i],0.001);
        const G=BASE_G*(1+END_G_MULT*easeIn(t))*(accel?4.0:1.0);
        const ar=-G/(rr*rr+EPS*EPS);
        vr[i]+=ar*dt; if(vr[i]<-VMAX_R) vr[i]=-VMAX_R;
        let w=w0[i]*(1+OMEGA_GAIN*easeIn(t)); if(w>VMAX_T) w=VMAX_T;
        a[i]+=w*dt; r[i]+=vr[i]*dt;
        if(r[i]<=0.8){ r[i]=0; done[i]=1; const cc=center(); x[i]=cc.x; y[i]=cc.y; return }
        x[i]=c.x + r[i]*Math.cos(a[i]); y[i]=c.y + r[i]*Math.sin(a[i]);
      }
      function stepExplode(i,dt){ x[i]+=vx[i]*dt; y[i]+=vy[i]*dt; vx[i]*=0.992; vy[i]*=0.992 }

      p.setup=()=>{
        const cnv=p.createCanvas(innerWidth,innerHeight); 
        cnv.parent(sketchHost); // Adjuntar al div 'particles'
        p.pixelDensity(1); W=p.width; H=p.height; alloc(); reseed(); p.clear();
      };
      p.windowResized=()=>{
        if(canvasRemoved) return;
        p.resizeCanvas(innerWidth,innerHeight); W=p.width; H=p.height; p.clear();
        const c=center(); for(let i=0;i<COUNT;i++){ x[i]=c.x + r[i]*Math.cos(a[i]); y[i]=c.y + r[i]*Math.sin(a[i]) }
      };

      let last=performance.now();
      p.draw=()=>{
        if(canvasRemoved){ p.noLoop(); return }
        const now=performance.now();
        let dt=(now-last)/16.6667; if(dt>3) dt=3; if(dt<0.5) dt=0.5; last=now;
        p.clear(); const t=gProgress();

        if(mode==='ambient' || mode==='gravity'){
          p.noStroke(); p.fill(204,255,0,190);
          for(let i=0;i<COUNT;i++){
            if(mode==='ambient') stepAmbient(i,dt); else stepGravity(i,dt,t);
            p.circle(x[i],y[i],3.2);
          }
        }else if(mode==='explode'){
          const k=(now-explodeStart)/(explodeEnd-explodeStart), alpha=1-Math.max(0,Math.min(1,k));
          p.noStroke(); p.fill(204,255,0,Math.floor(190*alpha));
          for(let i=0;i<COUNT;i++){ stepExplode(i,dt); p.circle(x[i],y[i],3.2) }
          if(now>=explodeEnd){ mode='dead'; if(explodeResolve){ const r=explodeResolve; explodeResolve=null; r() } }
        }
      };

      p.setAmbient=()=>{ mode='ambient' };
      p.startGravity=ms=>{ gravityStart=performance.now(); gravityEnd=gravityStart+ms; mode='gravity'; accel=false };
      p.accelerate=()=>{ accel=true; const now=performance.now(); const prog=(now-gravityStart)/(gravityEnd-gravityStart); gravityStart=now-prog*ACCEL_MS; gravityEnd=now+ACCEL_MS };
      p.explode=ms=>{
        const c=center();
        for(let i=0;i<COUNT;i++){
          x[i]=c.x; y[i]=c.y; r[i]=0; done[i]=1;
          const ang=Math.random()*Math.PI*2, spd=6+Math.random()*12;
          vx[i]=Math.cos(ang)*spd; vy[i]=Math.sin(ang)*spd;
        }
        explodeStart=performance.now(); explodeEnd=explodeStart+ms; mode='explode';
        return new Promise(res=>{ explodeResolve=res });
      };
      p.killNow=()=>{ 
        canvasRemoved = true; 
        p.noLoop(); 
        try{ p.remove() }catch{} 
      };
    });
  },

  particlesAmbient: function() { this.sketch?.setAmbient(); },
  particlesStartGravity: function(ms) { this.sketch?.startGravity(ms); },
  particlesAccelerate: function() { this.sketch?.accelerate(); },
  particlesExplodeThenKill: function(ms) {
    const pill = this.$('morphPill'); if (pill) { pill.style.opacity = '0'; }
    
    if (!this.sketch || this.canvasRemoved) { 
      return new Promise(res => {
        setTimeout(() => {
          if (pill) { pill.style.display = 'none'; }
          res();
        }, ms);
      });
    }

    return this.sketch.explode(ms).then(() => {
      if (this.canvasRemoved) return;
      this.sketch.killNow(); 
      const host = this.$('particles'); 
      if (host) host.innerHTML = ''; // Limpia el canvas
      this.canvasRemoved = true; 
      if (pill) { pill.style.display = 'none'; }
    });
  },

  createAndFlyIcon: function(src, fromRect, targetSizePx, pill) {
    const img = document.createElement('img');
    img.id = 'flyMark'; img.src = src; img.alt = '';
    document.body.appendChild(img);

    const startW = 36, startH = 36;
    img.style.left = (fromRect.left + fromRect.width / 2 - startW / 2) + 'px';
    img.style.top = (fromRect.top + fromRect.height / 2 - startH / 2) + 'px';
    img.style.width = startW + 'px'; img.style.height = startH + 'px';

    void img.offsetWidth;

    const vw = innerWidth, vh = innerHeight;
    const targetLeft = vw / 2 - targetSizePx / 2;
    const targetTop = vh / 2 - targetSizePx / 2;

    img.style.left = targetLeft + 'px';
    img.style.top = targetTop + 'px';
    img.style.width = targetSizePx + 'px';
    img.style.height = targetSizePx + 'px';

    return new Promise(res => {
      img.addEventListener('transitionend', () => {
        if (pill.parentElement) {
            pill.appendChild(img);
            img.classList.add('asEmbed');
        } else {
            img.remove(); 
        }
        res(img);
      }, { once: true });
    });
  },

  runMorph: async function(seed, isFallback = false) {
    _app.state.url = seed; 
    
    const pill = _app.els.morphPill, fusion = _app.els.fusion;
    if (!pill || !fusion) return;

    if (this.canvasRemoved && !isFallback) {
        this.canvasRemoved = false;
        this.initSketch();
    }
    
    _app.setAppState('LOADING'); 

    if (_app.els.logo) { _app.els.logo.style.opacity = '0'; }
    const r = this.rect(fusion);
    pill.style.display = 'flex';
    pill.style.width = r.width + 'px';
    pill.style.height = r.height + 'px';
    pill.style.borderRadius = (r.height / 2) + 'px';
    pill.style.transform = 'translate(-50%,-50%) scale(1)';
    pill.style.aspectRatio = '1/1';
    
    pill.classList.remove('is-pulsing');

    let flyPromise = Promise.resolve();
    
    if (!isFallback) {
      this.particlesAmbient();
      const btnIcon = this.$('btnMark');
      const btnRect = btnIcon ? btnIcon.getBoundingClientRect() : this.rect(_app.els.magic || fusion);
      const targetSize = r.height;
      flyPromise = this.createAndFlyIcon('mark.svg', btnRect, targetSize, pill);
    } 

    fusion.style.visibility = 'hidden';

    if (!isFallback) {
      this.particlesStartGravity(this.API_MS_DEF);
    }

    void pill.offsetWidth;
    const circleDone = new Promise(res => {
      const onEnd = (ev) => { if (ev.propertyName === 'width' || ev.propertyName === 'height') { pill.removeEventListener('transitionend', onEnd); res(); } };
      pill.addEventListener('transitionend', onEnd);
    });
    pill.style.width = r.height + 'px';
    pill.style.height = r.height + 'px';
    pill.style.borderRadius = (r.height / 2) + 'px';

    await Promise.all([circleDone, flyPromise]);

    pill.classList.add('is-pulsing');

    const apiPromise = DataHandler.scrapeContent(_app, seed);

    try {
        const data = await apiPromise; 
        
        pill.classList.remove('is-pulsing'); 

        await this.particlesExplodeThenKill(this.EXP_MS);

        await DataHandler.finalizeUi(_app, seed, data); 
        
        const seedHost = this.hostFrom(seed);
        const hostLabel = _app.els.host; 
        if (hostLabel) {
            hostLabel.textContent = seedHost;
            // --- INICIO DE CORRECCIÓN ---
            // (La visibilidad ahora se controla por la clase .visible en data-handler.js)
            // hostLabel.style.opacity = '1';
            // hostLabel.style.transform = 'translateY(0)';
            // --- FIN DE CORRECCIÓN ---
        }

        if (_app.els.landing) {
            _app.els.landing.style.opacity = '0';
            _app.els.landing.style.pointerEvents = 'none';
            setTimeout(() => { _app.els.landing.style.display = 'none'; }, 320);
        }
        
    } catch (err) {
        // --- INICIO DE CORRECCIÓN ---
        // 2. Error _failToLanding corregido
        console.error('[scrapeContent] error', err);
        pill.classList.remove('is-pulsing'); 
        if (pill) pill.style.display = 'none'; 
        
        // Llamar a la función de fallback original que sí existe
        DataHandler._failToLanding(_app, seed, err.message || 'Link unreachable or scraping failed.');
        // --- FIN DE CORRECCIÓN ---
    } finally {
      this.state.started = false;
    }
  },

  start: function(isFallback = false) { 
    if (this.state.started) return; 
    
    const seed = (_app.els.url?.value || '').trim();
    if (!seed) {
        toast('Please enter a URL first.', 'error');
        return;
    }
    
    this.state.started = true;
    this.runMorph(seed, isFallback); 
  },

  finishNow: function() {
    if (!this.state.started) return;
    const now = performance.now();
    const left = Math.max(0, this.state.apiEnd - now);
    if (left <= this.ACCEL_MS) return;
    this.state.apiEnd = now + this.ACCEL_MS;
    this.particlesAccelerate();
  },

  init: function(appInstance) {
    _app = appInstance; 
    
    if (window.p5) {
        this.initSketch();
    } else {
        console.error("p5.js not loaded!");
        return;
    }

    /* Listeners */
    _app.els.magic?.addEventListener('click', () => this.start(false)); 
    _app.els.url?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'url') {
        e.preventDefault();
        this.start(false); 
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') this.finishNow();
    });
  }
};

export { Animation };
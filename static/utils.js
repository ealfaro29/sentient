// static/utils.js

export const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)', short: 'STD' },
    { id: 'layout-centered', name: 'Centered (Middle)', short: 'CTR' },
    { id: 'layout-bold', name: 'Bold (Top Left)', short: 'BLD' }
];

export const OVERLAYS = [
    { id: 'black', short: 'B' },
    { id: 'white', short: 'W' }
];

export const CARD_IDS = ['A', 'B', 'C', 'D'];

export const toast = (msg, type = 'info') => {
    Toastify({
        text: msg,
        duration: 3000,
        gravity: "top",
        position: "center",
        style: {
            background: type === 'error' ? "#ef4444" : "#CCFF00",
            color: "#000",
            fontWeight: "700",
            borderRadius: "8px",
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }
    }).showToast();
};

// P5.JS SKETCH (BACKGROUND ANIMATION)
let particles = [];
let attractionCenter;
let p5_state = 'FREE'; // 'FREE', 'ATTRACT', 'EXPLODE'
const NUM_PARTICLES = 250;

export const setP5State = (state) => {
    p5_state = state;
    if (state === 'FREE') {
        particles.forEach(p => p.reset());
    } else if (state === 'EXPLODE') {
        particles.forEach(p => p.explode());
        // Clean up particles after explosion animation
        setTimeout(() => particles = [], 1000); 
    }
};

export const setAttractionCenter = (x, y) => {
    attractionCenter = { x, y };
};

export const p5_sketch = (p) => {
    p.setup = () => {
        const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.parent('p5-canvas-container');
        p.background(0); // FIX: Ensure initial background is black
        p.strokeWeight(1);
        p.frameRate(60);
        
        attractionCenter = { x: p.width / 2, y: p.height / 2 };

        for (let i = 0; i < NUM_PARTICLES; i++) {
            particles.push(new Particle(p));
        }
    };

    p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        // Reset particles to new dimensions to avoid concentration
        particles = [];
        for (let i = 0; i < NUM_PARTICLES; i++) {
            particles.push(new Particle(p));
        }
    };

    p.draw = () => {
        // --- CORRECCIÓN DEL FONDO GRIS ---
        // Se cambió de 'p.background(0, 0, 0, 40)' a 'p.background(0);'
        // Esto fuerza un fondo negro opaco en CADA fotograma.
        p.background(0);
        // -----------------------------------
        
        const brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#ccff00';
        p.stroke(brandColor);
        p.fill(brandColor);

        // Update attraction center if in ATTRACT mode
        if (p5_state === 'ATTRACT' && attractionCenter) {
            // p.ellipse(attractionCenter.x, attractionCenter.y, 5); // Visual magnet center (optional)
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update(p, p5_state, attractionCenter);
            particles[i].display(p);
        }
        
        // Reintroduce particles if they exploded and the state is FREE
        if (p5_state === 'FREE' && particles.length < NUM_PARTICLES) {
             particles.push(new Particle(p));
        }
    };

    class Particle {
        constructor(p) {
            this.p = p;
            this.reset();
        }

        reset() {
            this.pos = this.p.createVector(this.p.random(this.p.width), this.p.random(this.p.height));
            this.vel = this.p.createVector(0, 0);
            this.acc = this.p.createVector(0, 0);
            this.maxSpeed = 1;
            this.maxForce = 0.05;
            this.size = this.p.random(1, 3);
            this.exploded = false;
        }
        
        explode() {
            this.exploded = true;
            this.vel = this.p.createVector(this.p.random(-5, 5), this.p.random(-5, 5));
            this.acc = this.p.createVector(0, 0);
        }

        attract(target) {
            const desired = target.copy().sub(this.pos);
            const distance = desired.mag();
            desired.setMag(this.maxSpeed);

            let steer = desired.sub(this.vel);
            steer.limit(this.maxForce * (p5_state === 'ATTRACT' ? 3 : 1)); // Stronger pull when attracting
            return steer;
        }

        update(p, state, attractionPoint) {
            if (this.exploded) {
                this.pos.add(this.vel);
                this.size *= 0.95; // Shrink
                return;
            }
            
            if (state === 'ATTRACT') {
                const attractTarget = p.createVector(attractionPoint.x, attractionPoint.y);
                this.acc.add(this.attract(attractTarget));
                
                // Add tangential force for orbiting effect (perpendicular vector)
                let orbit = attractTarget.copy().sub(this.pos);
                orbit.normalize();
                orbit.rotate(p.HALF_PI); // Rotate 90 degrees for perpendicular movement
                orbit.mult(0.015); // Small orbiting speed
                this.acc.add(orbit);
                
            } else { // FREE state
                // Simple random walk or boundary bounce
                this.acc = p.createVector(p.random(-0.01, 0.01), p.random(-0.01, 0.01));
            }
            
            this.vel.add(this.acc);
            this.vel.limit(this.maxSpeed);
            this.pos.add(this.vel);
            this.acc.mult(0); // Reset acceleration

            // Bounce off edges (subtle)
            if (this.pos.x < 0 || this.pos.x > p.width) this.vel.x *= -0.9;
            if (this.pos.y < 0 || this.pos.y > p.height) this.vel.y *= -0.9;
        }

        display(p) {
            if (this.size > 0.1) {
                p.ellipse(this.pos.x, this.pos.y, this.size);
            }
        }
    }
};
new p5(p5_sketch);
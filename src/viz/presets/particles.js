/**
 * Beat-reactive particle system — Canvas 2D.
 */

const MAX_PARTICLES = 2000;
const BURST_COUNT = 80;
const DRAG = 0.96;

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export class ParticlesPreset {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.hue = 120;
    this._lastBeat = false;
  }

  _emit(bands) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const speed = 2 + bands.bass * 6;
    const sizeBase = 2 + bands.bass * 5;

    for (let i = 0; i < BURST_COUNT; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const angle = Math.random() * Math.PI * 2;
      const s = speed * randRange(0.4, 1.0);
      this.particles.push({
        x: cx + randRange(-20, 20),
        y: cy + randRange(-20, 20),
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life: randRange(40, 90),
        maxLife: 0,
        hue: this.hue + randRange(-30, 30),
        size: sizeBase * randRange(0.5, 1.5),
      });
      this.particles[this.particles.length - 1].maxLife =
        this.particles[this.particles.length - 1].life;
    }
  }

  render(audioData) {
    const { ctx, canvas } = this;
    const { bands, beatInfo } = audioData;
    const w = canvas.width;
    const h = canvas.height;

    // Shift hue with mid energy
    this.hue = (this.hue + 0.3 + bands.mid * 1.5) % 360;

    // Semi-transparent clear for trails
    ctx.fillStyle = `rgba(10, 10, 15, 0.15)`;
    ctx.fillRect(0, 0, w, h);

    // Emit burst on beat
    if (beatInfo.beat && !this._lastBeat) {
      this._emit(bands);
    }
    this._lastBeat = beatInfo.beat;

    // Update and draw
    const alive = [];
    for (const p of this.particles) {
      p.life -= 1;
      if (p.life <= 0) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= DRAG;
      p.vy *= DRAG;

      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
      ctx.fill();

      alive.push(p);
    }
    this.particles = alive;
  }

  resize() {}

  destroy() {}
}

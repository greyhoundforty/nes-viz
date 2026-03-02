/**
 * Beat-reactive particle system — Canvas 2D.
 *
 * Two emission modes run simultaneously:
 *   1. Continuous — emits every frame proportional to bass energy.
 *      Works even when the beat detector misses (dense/heavy drums where the
 *      average stays high and the 1.4x threshold is never crossed).
 *   2. Burst — fires a large burst on a detected beat edge.
 *
 * Additive blending ('lighter') gives the classic laser-show glow without
 * a separate bloom pass.
 */

const MAX_PARTICLES   = 4000;
const DRAG            = 0.97;   // higher = longer trails
const BURST_COUNT     = 150;
const CONTINUOUS_RATE = 18;     // max particles/frame at bass=1.0
const BASS_FLOOR      = 0.08;   // minimum bass to trigger continuous emission

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class ParticlesPreset {
  constructor(canvas) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.particles = [];
    this.hue       = 180;
    this._lastBeat = false;
    this._pool     = []; // object pool to reduce GC pressure
    this._rings    = []; // beat rings
  }

  // ── Particle pool ─────────────────────────────────────────────────────────

  _acquire() {
    return this._pool.length ? this._pool.pop() : {};
  }

  _release(p) {
    this._pool.push(p);
  }

  /**
   * Emit `count` particles radiating from canvas center.
   * @param {object} bands
   * @param {number} count
   * @param {number} speedMult  extra speed multiplier (higher for burst)
   */
  _emit(bands, count, speedMult = 1) {
    const cx        = this.canvas.width  / 2;
    const cy        = this.canvas.height / 2;
    const baseSpeed = (1.5 + bands.bass * 8) * speedMult;
    const sizeBase  = 1.5 + bands.bass * 4;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;

      const angle     = Math.random() * Math.PI * 2;
      const s         = baseSpeed * rand(0.3, 1.0);
      // Slight spiral bias from mid energy gives vortex feel
      const tangAngle = angle + Math.PI * 0.15;
      const spiral    = bands.mid * 1.5;

      const p   = this._acquire();
      p.x       = cx + rand(-30, 30);
      p.y       = cy + rand(-30, 30);
      p.vx      = Math.cos(angle) * s + Math.cos(tangAngle) * spiral;
      p.vy      = Math.sin(angle) * s + Math.sin(tangAngle) * spiral;
      p.life    = rand(50, 110);
      p.maxLife = p.life;
      p.hue     = this.hue + rand(-40, 40);
      p.sat     = 90 + bands.treble * 10;
      p.size    = sizeBase * rand(0.5, 1.8);

      this.particles.push(p);
    }
  }

  // ── Main render ───────────────────────────────────────────────────────────

  render(audioData) {
    const { ctx, canvas } = this;
    const { bands, beatInfo } = audioData;
    const w = canvas.width;
    const h = canvas.height;

    // Hue drifts with treble
    this.hue = (this.hue + 0.4 + bands.treble * 1.2) % 360;

    // Background: semi-transparent fill for motion trails
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(8, 8, 14, 0.18)';
    ctx.fillRect(0, 0, w, h);

    // Continuous emission — fires every frame bass is above floor
    if (bands.bass > BASS_FLOOR) {
      const count = Math.ceil(bands.bass * CONTINUOUS_RATE);
      this._emit(bands, count, 0.6);
    }

    // Beat burst
    if (beatInfo.beat && !this._lastBeat) {
      this._emit(bands, BURST_COUNT, 1.4);
      this._rings.push({ r: 10, life: 30, maxLife: 30, hue: this.hue });
    }
    this._lastBeat = beatInfo.beat;

    // Draw particles with additive blending for glow
    ctx.globalCompositeOperation = 'lighter';

    const alive = [];
    for (const p of this.particles) {
      p.life -= 1;
      if (p.life <= 0) {
        this._release(p);
        continue;
      }

      p.x  += p.vx;
      p.y  += p.vy;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.vy += 0.04; // subtle gravity for weighted feel on heavy hits

      const t     = p.life / p.maxLife; // 1→0
      const alpha = t * t * 0.85;       // quadratic fade
      const r     = p.size * (0.3 + t * 0.7);

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},${p.sat}%,65%,${alpha})`;
      ctx.fill();

      alive.push(p);
    }
    this.particles = alive;

    // Beat rings
    this._drawRings(bands);

    ctx.globalCompositeOperation = 'source-over';
  }

  _drawRings(bands) {
    const { ctx, canvas } = this;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;

    for (let i = this._rings.length - 1; i >= 0; i--) {
      const ring = this._rings[i];
      ring.r    += 18 + bands.bass * 22;
      ring.life -= 1;

      if (ring.life <= 0) {
        this._rings.splice(i, 1);
        continue;
      }

      const alpha = (ring.life / ring.maxLife) * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${ring.hue},100%,70%,${alpha})`;
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
  }

  resize() {}

  destroy() {
    this.particles = [];
    this._pool     = [];
    this._rings    = [];
  }
}

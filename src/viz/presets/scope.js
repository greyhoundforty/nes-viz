/**
 * Oscilloscope / waveform preset — Canvas 2D.
 * Smooth Bezier curve, mirror mode, subtle glow.
 */

export class ScopePreset {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hue = 0;
  }

  render(audioData) {
    const { ctx, canvas } = this;
    const { timeData, bands, beatInfo } = audioData;
    const w = canvas.width;
    const h = canvas.height;
    const len = timeData.length;

    // Black clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // Advance hue
    this.hue = (this.hue + 0.4 + bands.mid * 0.8) % 360;

    const energy = bands.bass * 0.5 + bands.mid * 0.3 + bands.treble * 0.2;
    const ampScale = 0.25 + energy * 0.45;

    // Build points for top half
    const points = [];
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * w;
      const norm = (timeData[i] / 128.0) - 1.0; // -1..1
      const y = h / 2 + norm * (h / 2) * ampScale;
      points.push({ x, y });
    }

    // Draw glow layers
    const glowPasses = [
      { alpha: 0.08, lw: 8 },
      { alpha: 0.15, lw: 5 },
      { alpha: 0.25, lw: 3 },
      { alpha: 0.9,  lw: 1.5 },
    ];

    for (const { alpha, lw } of glowPasses) {
      this._drawCurve(ctx, points, w, alpha, lw, this.hue, bands, false);
      this._drawCurve(ctx, points, w, alpha * 0.7, lw, this.hue, bands, true);
    }

    // Beat flash: bright horizontal line
    if (beatInfo.beat) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = `hsl(${this.hue}, 100%, 80%)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  _drawCurve(ctx, points, w, alpha, lineWidth, baseHue, bands, mirrored) {
    const len = points.length;
    const h = this.canvas.height;

    // Gradient stroke: bass hue on left, treble hue on right
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   `hsla(${baseHue}, 100%, 60%, ${alpha})`);
    grad.addColorStop(0.5, `hsla(${(baseHue + 60) % 360}, 100%, 65%, ${alpha})`);
    grad.addColorStop(1,   `hsla(${(baseHue + 120) % 360}, 100%, 60%, ${alpha})`);

    ctx.save();
    if (mirrored) {
      ctx.translate(0, h);
      ctx.scale(1, -1);
    }

    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';

    // Smooth bezier through points
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < len - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    ctx.lineTo(points[len - 1].x, points[len - 1].y);

    ctx.stroke();
    ctx.restore();
  }

  resize() {}

  destroy() {}
}

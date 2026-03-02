/**
 * Viz manager — rAF loop + preset switching + canvas resize.
 *
 * Uses two canvases stacked in the same position:
 *   - canvasGL  → WebGL2 presets (milkdrop)
 *   - canvas2D  → Canvas 2D presets (particles, scope)
 * A browser canvas cannot serve both context types, so we swap visibility.
 */

import { MilkdropPreset } from './presets/milkdrop.js';
import { ParticlesPreset } from './presets/particles.js';
import { ScopePreset } from './presets/scope.js';

const PRESET_MAP = {
  milkdrop: { Klass: MilkdropPreset, type: 'gl' },
  particles: { Klass: ParticlesPreset, type: '2d' },
  scope:     { Klass: ScopePreset,     type: '2d' },
};

function makeFullscreenCanvas() {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:none;';
  document.body.insertBefore(c, document.body.firstChild);
  return c;
}

export class VizManager {
  constructor() {
    this.canvasGL = makeFullscreenCanvas();
    this.canvas2D = makeFullscreenCanvas();

    this.activePreset = null;
    this.activeName = null;
    this.rafId = null;
    this.audioDataFn = null;

    this._setupResize();
  }

  _setupResize() {
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(document.documentElement);
    this._resize();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === 0 || h === 0) return;

    for (const c of [this.canvasGL, this.canvas2D]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }

    if (this.activePreset?.resize) {
      this.activePreset.resize();
    }
  }

  switchPreset(name) {
    if (this.activeName === name) return;

    if (this.activePreset?.destroy) {
      this.activePreset.destroy();
    }

    const entry = PRESET_MAP[name];
    if (!entry) throw new Error(`Unknown preset: ${name}`);

    const canvas = entry.type === 'gl' ? this.canvasGL : this.canvas2D;
    this.canvasGL.style.display = entry.type === 'gl' ? 'block' : 'none';
    this.canvas2D.style.display = entry.type === '2d' ? 'block' : 'none';

    this.activePreset = new entry.Klass(canvas);
    this.activeName = name;
  }

  /** @param {() => object} fn */
  setAudioDataFn(fn) {
    this.audioDataFn = fn;
  }

  start() {
    if (this.rafId) return;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      if (this.activePreset && this.audioDataFn) {
        const audioData = this.audioDataFn();
        this.activePreset.render(audioData);
      }
    };
    loop();
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

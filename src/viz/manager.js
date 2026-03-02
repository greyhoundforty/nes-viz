/**
 * Viz manager — rAF loop + preset switching + canvas resize.
 *
 * Three dedicated canvases, each with a single context type:
 *   - canvasGL  → WebGL2 (MilkdropPreset)
 *   - canvas2D  → Canvas 2D (ParticlesPreset, ScopePreset)
 *   - canvasBCH → WebGL (ButterchurnPreset — butterchurn owns its context)
 */

import { MilkdropPreset }   from './presets/milkdrop.js';
import { ParticlesPreset }  from './presets/particles.js';
import { ScopePreset }      from './presets/scope.js';
import { ButterchurnPreset } from './presets/butterchurn.js';

const PRESET_MAP = {
  milkdrop:   { Klass: MilkdropPreset,    type: 'gl'  },
  particles:  { Klass: ParticlesPreset,   type: '2d'  },
  scope:      { Klass: ScopePreset,       type: '2d'  },
  butterchurn: { Klass: ButterchurnPreset, type: 'bch' },
};

function makeFullscreenCanvas() {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:none;';
  document.body.insertBefore(c, document.body.firstChild);
  return c;
}

export class VizManager {
  constructor() {
    this.canvasGL  = makeFullscreenCanvas();
    this.canvas2D  = makeFullscreenCanvas();
    this.canvasBCH = makeFullscreenCanvas();

    this.activePreset = null;
    this.activeName   = null;
    this.rafId        = null;
    this.audioDataFn  = null;

    // Set by setAudioNodes() — needed to construct ButterchurnPreset
    this._audioCtx = null;
    this._srcNode  = null;

    this._setupResize();
  }

  /** Called from main.js after first user interaction creates the audio graph. */
  setAudioNodes(audioCtx, srcNode) {
    this._audioCtx = audioCtx;
    this._srcNode  = srcNode;
  }

  _setupResize() {
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(document.documentElement);
    this._resize();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = window.innerWidth;
    const h   = window.innerHeight;
    if (w === 0 || h === 0) return;

    for (const c of [this.canvasGL, this.canvas2D, this.canvasBCH]) {
      c.width  = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }

    if (this.activePreset?.resize) {
      this.activePreset.resize();
    }
  }

  _canvasFor(type) {
    if (type === 'gl')  return this.canvasGL;
    if (type === 'bch') return this.canvasBCH;
    return this.canvas2D;
  }

  switchPreset(name) {
    if (this.activeName === name) return;

    if (this.activePreset?.destroy) {
      this.activePreset.destroy();
    }

    const entry = PRESET_MAP[name];
    if (!entry) throw new Error(`Unknown preset: ${name}`);

    const canvas = this._canvasFor(entry.type);

    // Hide all, show the active one
    this.canvasGL.style.display  = entry.type === 'gl'  ? 'block' : 'none';
    this.canvas2D.style.display  = entry.type === '2d'  ? 'block' : 'none';
    this.canvasBCH.style.display = entry.type === 'bch' ? 'block' : 'none';

    if (entry.type === 'bch') {
      if (!this._audioCtx || !this._srcNode) {
        console.warn('Butterchurn: audio not initialised yet — load a stream first');
        return;
      }
      this.activePreset = new entry.Klass(canvas, this._audioCtx, this._srcNode);
    } else {
      this.activePreset = new entry.Klass(canvas);
    }

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

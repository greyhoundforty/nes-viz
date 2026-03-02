/**
 * Butterchurn preset — real Milkdrop 2 renderer via WebGL.
 *
 * Butterchurn creates its own WebGL context, so this must run on a dedicated
 * canvas (canvasBCH in VizManager, not the shared canvasGL).
 *
 * Preset cycling:
 *   - Auto-advances every CYCLE_INTERVAL ms
 *   - Also transitions on beat if we haven't changed recently
 */

import butterchurn           from 'butterchurn';
import butterchurnPresets    from 'butterchurn-presets';

const CYCLE_INTERVAL     = 25_000; // ms between auto-transitions
const BLEND_TIME         = 2.7;   // seconds for Milkdrop blend transition
const BEAT_COOLDOWN      = 8_000; // ms — min time between beat-triggered transitions

export class ButterchurnPreset {
  /**
   * @param {HTMLCanvasElement} canvas   dedicated canvas for butterchurn
   * @param {AudioContext}      audioCtx Web Audio context from engine
   * @param {AudioNode}         srcNode  MediaElementSourceNode from engine
   */
  constructor(canvas, audioCtx, srcNode) {
    this.canvas   = canvas;
    this.vizr     = null;
    this._presetKeys    = [];
    this._presetIdx     = 0;
    this._lastCycle     = performance.now();
    this._lastBeatCycle = 0;
    this._lastBeat      = false;
    this._ready         = false;

    this._init(audioCtx, srcNode);
  }

  _init(audioCtx, srcNode) {
    const w = this.canvas.width  || window.innerWidth;
    const h = this.canvas.height || window.innerHeight;

    this.vizr = butterchurn.createVisualizer(audioCtx, this.canvas, {
      width:        w,
      height:       h,
      pixelRatio:   window.devicePixelRatio || 1,
      textureRatio: 1,
    });

    // Connect butterchurn's internal analyser to the audio source
    this.vizr.connectSource(srcNode);

    // Load all available presets
    const allPresets = butterchurnPresets.getPresets();
    this._presetKeys  = Object.keys(allPresets);
    this._allPresets  = allPresets;

    // Shuffle for variety on each page load
    this._shuffleKeys();

    // Load first preset immediately (no blend)
    this._loadPreset(0);
    this._ready = true;
  }

  _shuffleKeys() {
    for (let i = this._presetKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._presetKeys[i], this._presetKeys[j]] =
        [this._presetKeys[j], this._presetKeys[i]];
    }
  }

  _loadPreset(idx, blend = false) {
    const key    = this._presetKeys[idx % this._presetKeys.length];
    const preset = this._allPresets[key];
    this.vizr.loadPreset(preset, blend ? BLEND_TIME : 0);
    this._presetIdx = idx % this._presetKeys.length;
  }

  next(blend = true) {
    this._loadPreset(this._presetIdx + 1, blend);
    this._lastCycle     = performance.now();
    this._lastBeatCycle = performance.now();
  }

  render(audioData) {
    if (!this._ready) return;

    const { beatInfo } = audioData;
    const now = performance.now();

    // Auto-cycle on timer
    if (now - this._lastCycle > CYCLE_INTERVAL) {
      this.next(true);
      return;
    }

    // Beat-triggered transition (much less frequent)
    if (
      beatInfo.beat &&
      !this._lastBeat &&
      now - this._lastBeatCycle > BEAT_COOLDOWN
    ) {
      this.next(true);
    }

    this._lastBeat = beatInfo.beat;
    this.vizr.render();
  }

  resize() {
    if (!this.vizr) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w && h) {
      this.vizr.setRendererSize(w, h);
    }
  }

  destroy() {
    // butterchurn has no explicit destroy; just drop the reference
    this.vizr = null;
    this._ready = false;
  }
}

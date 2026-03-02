/**
 * nes-viz — main entry point.
 * Wires together audio engine, beat detector, viz manager, and controls.
 */

import * as engine from './audio/engine.js';
import * as beat from './audio/beat.js';
import { VizManager } from './viz/manager.js';
import { Controls } from './ui/controls.js';

// --- Viz manager (creates its own canvases) ---
const viz = new VizManager();
viz.switchPreset('milkdrop');

// --- Controls (declared before setAudioDataFn closure to avoid TDZ dependency) ---
const controls = new Controls({
  onLoad: async (url) => {
    controls.setStatus('LOADING…', '#ffcc00');
    beat.reset();

    try {
      await engine.loadUrl(url);
      controls.setStatus('PLAYING', '#00ff90');
    } catch (err) {
      console.error('Load failed:', err);
      controls.setStatus('ERROR', '#ff4040');
    }
  },

  onPreset: (name) => {
    viz.switchPreset(name);
  },
});

// --- Audio data supplier ---
viz.setAudioDataFn(() => {
  const freqData = engine.getFrequencyData();
  const timeData = engine.getTimeDomainData();
  const bands = engine.getFrequencyBands();
  const beatInfo = beat.update(bands);

  controls.update(beatInfo);

  return { freqData, timeData, bands, beatInfo };
});

// --- Start render loop ---
viz.start();

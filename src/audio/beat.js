/**
 * Energy-based beat detector.
 * Tracks beats, BPM, and per-band energy levels.
 */

const HISTORY_SIZE = 43; // ~1 second at 60fps
const BEAT_THRESHOLD = 1.4;
const MIN_BEAT_INTERVAL = 300; // ms — clamp max BPM ~200

const energyHistory = new Float32Array(HISTORY_SIZE);
let historyIdx = 0;

let beat = false;
let bpm = 0;
let lastBeatTime = 0;
const beatIntervals = [];
const MAX_INTERVALS = 8;

let bassEnergy = 0;
let midEnergy = 0;
let trebleEnergy = 0;

/**
 * Call once per animation frame with current band values.
 * @param {Object} bands - { bass, mid, treble } each 0–1
 * @returns {{ beat: boolean, bpm: number, bassEnergy: number, midEnergy: number, trebleEnergy: number }}
 */
export function update(bands) {
  bassEnergy = bands.bass;
  midEnergy = bands.mid;
  trebleEnergy = bands.treble;

  // Energy = weighted bass contribution
  const energy = bands.bass * 0.7 + bands.mid * 0.2 + bands.treble * 0.1;

  energyHistory[historyIdx % HISTORY_SIZE] = energy;
  historyIdx++;

  const avg = energyHistory.reduce((s, v) => s + v, 0) / HISTORY_SIZE;

  const now = performance.now();
  beat = energy > BEAT_THRESHOLD * avg && avg > 0.01;

  if (beat && now - lastBeatTime > MIN_BEAT_INTERVAL) {
    const interval = now - lastBeatTime;
    if (lastBeatTime > 0 && interval < 2000) {
      beatIntervals.push(interval);
      if (beatIntervals.length > MAX_INTERVALS) beatIntervals.shift();

      const avgInterval =
        beatIntervals.reduce((s, v) => s + v, 0) / beatIntervals.length;
      bpm = Math.round(60000 / avgInterval);
    }
    lastBeatTime = now;
  }

  return { beat, bpm, bassEnergy, midEnergy, trebleEnergy };
}

export function reset() {
  energyHistory.fill(0);
  historyIdx = 0;
  beat = false;
  bpm = 0;
  lastBeatTime = 0;
  beatIntervals.length = 0;
  bassEnergy = 0;
  midEnergy = 0;
  trebleEnergy = 0;
}

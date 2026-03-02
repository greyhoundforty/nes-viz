/**
 * Audio engine — wraps Web Audio API for streaming + analysis.
 */

let ctx = null;
let analyserFreq = null;
let analyserTime = null;
let audioEl = null;
let source = null;

const FFT_FREQ = 2048;
const FFT_TIME = 1024;

function ensureContext() {
  if (ctx) return;

  audioEl = document.createElement('audio');
  audioEl.crossOrigin = 'anonymous';
  audioEl.preload = 'none';
  document.body.appendChild(audioEl);

  ctx = new AudioContext();

  analyserFreq = ctx.createAnalyser();
  analyserFreq.fftSize = FFT_FREQ;
  analyserFreq.smoothingTimeConstant = 0.8;

  analyserTime = ctx.createAnalyser();
  analyserTime.fftSize = FFT_TIME;
  analyserTime.smoothingTimeConstant = 0.0;

  source = ctx.createMediaElementSource(audioEl);
  source.connect(analyserFreq);
  analyserFreq.connect(analyserTime);
  analyserTime.connect(ctx.destination);
}

export async function loadUrl(url) {
  ensureContext();

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  audioEl.src = url;
  audioEl.load();

  return new Promise((resolve, reject) => {
    const onCanPlay = async () => {
      audioEl.removeEventListener('canplay', onCanPlay);
      audioEl.removeEventListener('error', onError);
      try {
        await audioEl.play();
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    const onError = (e) => {
      audioEl.removeEventListener('canplay', onCanPlay);
      audioEl.removeEventListener('error', onError);
      reject(new Error(`Audio error: ${audioEl.error?.message || 'unknown'}`));
    };
    audioEl.addEventListener('canplay', onCanPlay);
    audioEl.addEventListener('error', onError);
  });
}

export function stop() {
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
  }
}

export function getFrequencyData() {
  if (!analyserFreq) return new Uint8Array(FFT_FREQ / 2);
  const data = new Uint8Array(analyserFreq.frequencyBinCount);
  analyserFreq.getByteFrequencyData(data);
  return data;
}

export function getTimeDomainData() {
  if (!analyserTime) return new Uint8Array(FFT_TIME);
  const data = new Uint8Array(analyserTime.frequencyBinCount);
  analyserTime.getByteTimeDomainData(data);
  return data;
}

/**
 * Returns { bass, mid, treble } each normalized 0–1.
 * Uses a 44100 Hz sample rate assumption for bin mapping.
 */
export function getFrequencyBands() {
  const freq = getFrequencyData();
  const binCount = freq.length;
  const sampleRate = ctx ? ctx.sampleRate : 44100;
  const nyquist = sampleRate / 2;
  const binHz = nyquist / binCount;

  const bassEnd = Math.floor(200 / binHz);
  const midEnd = Math.floor(2000 / binHz);

  let bassSum = 0, midSum = 0, trebleSum = 0;
  let bassCount = 0, midCount = 0, trebleCount = 0;

  for (let i = 0; i < binCount; i++) {
    const v = freq[i] / 255;
    if (i < bassEnd) { bassSum += v; bassCount++; }
    else if (i < midEnd) { midSum += v; midCount++; }
    else { trebleSum += v; trebleCount++; }
  }

  return {
    bass: bassCount ? bassSum / bassCount : 0,
    mid: midCount ? midSum / midCount : 0,
    treble: trebleCount ? trebleSum / trebleCount : 0,
  };
}

export function isPlaying() {
  return audioEl && !audioEl.paused && !audioEl.ended;
}

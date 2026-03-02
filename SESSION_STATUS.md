# nes-viz — Session Status
_Last updated: 2026-03-02_

## What was built

Full implementation of the planned file structure from scratch in an empty Vite project.

```
/
├── index.html                   ✅ Full-viewport HUD, scanline overlay, VT323 font
├── package.json                 ✅ Vite-only, no runtime deps
├── vite.config.js               ✅
└── src/
    ├── main.js                  ✅ App init, wires everything together
    ├── audio/
    │   ├── engine.js            ✅ AudioContext, streaming, freq/time analysis
    │   └── beat.js              ✅ Energy-based beat detector + BPM tracker
    ├── viz/
    │   ├── manager.js           ✅ Dual-canvas rAF loop + preset switching
    │   └── presets/
    │       ├── milkdrop.js      ⚠️  WebGL2 feedback loop built, but needs seeding (see below)
    │       ├── particles.js     ⚠️  Built, but effectively blank without beat fix
    │       └── scope.js         ✅ Oscilloscope waveform renders correctly
    └── ui/
        └── controls.js          ✅ HUD, URL input, preset switcher, VU meters, BPM
```

---

## What is working

- **CORS-enabled icecast streams** load and play (tested live)
- **Web Audio analysis** — frequency + time-domain data flowing each frame
- **Beat detector** — energy vs rolling average, BPM estimation from inter-beat intervals
- **HUD** — URL input, Load button, preset switcher, VU meters, BPM counter all wired
- **Canvas context isolation** — WebGL2 and 2D presets use separate canvases (browser enforces one context type per canvas element; we maintain two stacked canvases and toggle visibility on preset switch)
- **Scope preset** — draws a bezier waveform with HSL gradient and glow passes
- **`vite build`** — clean build, 14KB bundle

---

## What is broken / not working

### 1. Milkdrop looks identical to scope (both just show a waveform)
**Root cause:** The WebGL2 ping-pong feedback loop starts with two black textures. The fragment shader only warps and decays *existing* pixel color — it never injects color from audio. With no seed, the WebGL layer stays solid black forever. The only visible output is the thin waveform line drawn on a separate 2D overlay canvas.

**Fix needed:** Seed the ping-pong texture each frame with audio-reactive content. Best approach: on each render pass, draw FFT frequency bars (or a glowing energy blob) into one framebuffer using a separate "inject" pass before running the warp feedback. Alternatively, draw to a temporary 2D canvas each frame and upload it as a texture.

### 2. Particles preset — blank canvas
**Root cause:** Particles only emit on a beat rising edge (`_lastBeat` guard). The beat threshold (`energy > 1.4 × avg`) won't fire if the stream is quiet or the average hasn't warmed up yet. The semi-transparent clear (`rgba(10,10,15,0.15)`) darkens the canvas to solid black within ~7 frames when no particles are alive.

**Fix needed (two parts):**
- Add a continuous ambient particle trickle (1–3 particles/frame scaled by energy) so the canvas is never blank
- Lower or make the beat threshold adaptive; currently `1.4` may be too aggressive for some streams

### 3. Navidrome streams fail with `Failed to open media`
**Root cause:** Navidrome requires authentication. The `<audio crossOrigin="anonymous">` element doesn't send session cookies, and Navidrome rejects the unauthenticated request before the media bytes are served.

**Fix needed:** Support Subsonic API URL construction — expose `u=`, `t=`/`p=`, `s=` query param fields in the HUD, or detect a Navidrome hostname and append credentials to the stream URL. Alternatively, set `audio.crossOrigin = 'use-credentials'` to include cookies for same-origin Navidrome instances.

---

## Bugs already fixed this session

| Bug | Fix |
|-----|-----|
| Shared canvas can't serve both `webgl2` and `2d` contexts | VizManager creates two stacked canvases; toggles visibility on preset switch |
| Zero-size framebuffer on init before layout | `_resize()` guards `w === 0 \|\| h === 0`; FB creation deferred to first render |
| `getUniformLocation` called every frame | Cached in `_init()` after program link |
| Dead `export let` bindings in `beat.js` | Removed; callers use return value of `update()` |
| `controls` referenced before `const` declaration | Reordered in `main.js` — controls declared before `setAudioDataFn` closure |

---

## Next steps (priority order)

1. **Seed milkdrop framebuffer** — add an inject pass that writes audio-reactive color (FFT bars, energy blobs) into the feedback texture each frame before the warp runs
2. **Fix particles blank canvas** — add ambient trickle mode + tune beat threshold
3. **Navidrome auth** — Subsonic API credential support in the HUD URL builder
4. **Visually differentiate presets** — once milkdrop has a seed, the warp effects will be self-evident; scope could gain a filled mirror mode or spectrum background

---

## Dev setup

```bash
npm install
npm run dev   # starts Vite at localhost:5173
```

Test with any CORS-enabled public Icecast stream URL.

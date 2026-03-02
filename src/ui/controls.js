/**
 * HUD controls — URL input, preset switcher, VU meters, BPM.
 */

export class Controls {
  constructor({ onLoad, onPreset }) {
    this.onLoad   = onLoad;
    this.onPreset = onPreset;

    this.$url     = document.getElementById('stream-url');
    this.$loadBtn = document.getElementById('load-btn');
    this.$bpm     = document.getElementById('bpm-display');
    this.$status  = document.getElementById('status-display');

    this.$meters = {
      bass:   document.getElementById('meter-bass'),
      mid:    document.getElementById('meter-mid'),
      treble: document.getElementById('meter-treble'),
    };

    this.$presetBtns = {
      milkdrop:    document.getElementById('btn-milkdrop'),
      particles:   document.getElementById('btn-particles'),
      scope:       document.getElementById('btn-scope'),
      butterchurn: document.getElementById('btn-butterchurn'),
    };

    this._bind();
  }

  _bind() {
    this.$loadBtn.addEventListener('click', () => {
      const url = this.$url.value.trim();
      if (url) this.onLoad(url);
    });

    this.$url.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = this.$url.value.trim();
        if (url) this.onLoad(url);
      }
    });

    for (const [name, btn] of Object.entries(this.$presetBtns)) {
      btn.addEventListener('click', () => {
        this.setActivePreset(name);
        this.onPreset(name);
      });
    }
  }

  setActivePreset(name) {
    for (const [n, btn] of Object.entries(this.$presetBtns)) {
      btn.classList.toggle('active', n === name);
    }
  }

  update({ bpm, bassEnergy, midEnergy, trebleEnergy }) {
    if (bpm > 0) {
      this.$bpm.textContent = `BPM: ${bpm}`;
    }

    const clamp = (v) => Math.min(100, Math.max(0, v * 100));
    this.$meters.bass.style.width   = `${clamp(bassEnergy)}%`;
    this.$meters.mid.style.width    = `${clamp(midEnergy)}%`;
    this.$meters.treble.style.width = `${clamp(trebleEnergy)}%`;
  }

  setStatus(msg, color = '#00ff90') {
    this.$status.textContent = msg;
    this.$status.style.color = color;
  }
}

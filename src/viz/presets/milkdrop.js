/**
 * Milkdrop-style preset — WebGL2 ping-pong feedback warp.
 */

const VERT_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

uniform sampler2D u_prev;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;
uniform vec2 u_resolution;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 uv = v_uv;

  // Center-relative coords
  vec2 center = uv - 0.5;

  // --- Warp params driven by audio ---
  float warpAmt  = 0.004 + u_bass * 0.018;
  float warpSpeed = 0.8 + u_mid * 1.2;
  float rotSpeed  = 0.003 + u_treble * 0.012;
  float zoomSpeed = 0.0008 + u_mid * 0.002;

  // Warp: sinusoidal UV distortion
  vec2 warped = center;
  warped += sin(uv.yx * 6.0 + u_time * warpSpeed) * warpAmt;

  // Rotation
  float angle = u_time * rotSpeed;
  float cosA = cos(angle), sinA = sin(angle);
  warped = vec2(
    warped.x * cosA - warped.y * sinA,
    warped.x * sinA + warped.y * cosA
  );

  // Zoom toward center
  warped *= (1.0 - zoomSpeed);

  vec2 sampleUV = warped + 0.5;

  // Sample previous frame
  vec3 col = texture(u_prev, sampleUV).rgb;

  // Decay
  col *= 0.978;

  // Beat flash: brief invert/brighten
  if (u_beat > 0.5) {
    col = col * 0.4 + vec3(0.6, 0.9, 1.0) * 0.6;
  }

  outColor = vec4(col, 1.0);
}
`;

function createShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function createProgram(gl, vert, frag) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function createFramebuffer(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { tex, fb };
}

export class MilkdropPreset {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.prog = null;
    this.vao = null;
    this.fbs = [null, null]; // ping-pong
    this.pingIdx = 0;
    this.time = 0;

    // 2D overlay for waveform
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
    document.body.appendChild(this.overlayCanvas);
    this.ctx2d = this.overlayCanvas.getContext('2d');

    this._init();
  }

  _init() {
    const gl = this.canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    const vert = createShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = createShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    this.prog = createProgram(gl, vert, frag);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
       1, -1,  1,  1,  -1, 1,
    ]), gl.STATIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Cache uniform locations — avoids driver round-trips every frame
    this.uniforms = {
      u_prev:       gl.getUniformLocation(this.prog, 'u_prev'),
      u_time:       gl.getUniformLocation(this.prog, 'u_time'),
      u_bass:       gl.getUniformLocation(this.prog, 'u_bass'),
      u_mid:        gl.getUniformLocation(this.prog, 'u_mid'),
      u_treble:     gl.getUniformLocation(this.prog, 'u_treble'),
      u_beat:       gl.getUniformLocation(this.prog, 'u_beat'),
      u_resolution: gl.getUniformLocation(this.prog, 'u_resolution'),
    };

    // Defer framebuffer creation until first resize with valid dimensions
    this.fbs = [null, null];
  }

  _resize() {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    if (this.fbs[0]) {
      gl.deleteTexture(this.fbs[0].tex);
      gl.deleteFramebuffer(this.fbs[0].fb);
      gl.deleteTexture(this.fbs[1].tex);
      gl.deleteFramebuffer(this.fbs[1].fb);
    }

    this.fbs[0] = createFramebuffer(gl, w, h);
    this.fbs[1] = createFramebuffer(gl, w, h);

    // Clear both
    for (const { fb } of this.fbs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
  }

  render(audioData) {
    const { gl, prog, vao, canvas } = this;
    const { freqData, timeData, bands, beatInfo } = audioData;

    this.time += 0.016;

    const ping = this.pingIdx;
    const pong = 1 - ping;

    // --- WebGL pass: warp previous frame into pong ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbs[pong].fb);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);

    // Ensure framebuffers exist (may be deferred if canvas was zero-size at init)
    if (!this.fbs[0]) this._resize();
    if (!this.fbs[0]) return; // still zero-size, skip frame

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbs[ping].tex);

    const uni = this.uniforms;
    gl.uniform1i(uni.u_prev, 0);
    gl.uniform1f(uni.u_time, this.time);
    gl.uniform1f(uni.u_bass, bands.bass);
    gl.uniform1f(uni.u_mid, bands.mid);
    gl.uniform1f(uni.u_treble, bands.treble);
    gl.uniform1f(uni.u_beat, beatInfo.beat ? 1.0 : 0.0);
    gl.uniform2f(uni.u_resolution, canvas.width, canvas.height);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // --- Blit pong to screen ---
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbs[pong].fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, 0, canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.pingIdx = pong;

    // --- 2D overlay: thin waveform ---
    this._drawWaveform(timeData, bands);
  }

  _drawWaveform(timeData, bands) {
    const { ctx2d, overlayCanvas } = this;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    ctx2d.clearRect(0, 0, w, h);

    const len = timeData.length;
    const midY = h * 0.85;
    const amp = 40 + bands.bass * 60;

    ctx2d.beginPath();
    ctx2d.strokeStyle = `hsla(${130 + bands.treble * 60}, 100%, 60%, 0.6)`;
    ctx2d.lineWidth = 1.5;

    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * w;
      const y = midY + ((timeData[i] / 128) - 1) * amp;
      i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
    }
    ctx2d.stroke();
  }

  resize() {
    this._resize();
  }

  destroy() {
    const gl = this.gl;
    if (gl) {
      gl.deleteProgram(this.prog);
      if (this.fbs[0]) {
        gl.deleteTexture(this.fbs[0].tex);
        gl.deleteFramebuffer(this.fbs[0].fb);
        gl.deleteTexture(this.fbs[1].tex);
        gl.deleteFramebuffer(this.fbs[1].fb);
      }
    }
    if (this.overlayCanvas?.parentNode) {
      this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
    }
  }
}

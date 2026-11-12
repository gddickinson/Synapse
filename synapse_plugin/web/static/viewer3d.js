// Raw WebGL point-cloud viewer (no libraries): points, larger centroid markers and lines (bounding box, pair links).
// Drag to rotate, shift-drag or two fingers to pan, wheel / pinch / +/- to zoom, arrow keys rotate, 0 resets.
// Coordinates are given in nm and drawn isotropically (optional z exaggeration, shown in the overlay).
import { esc } from './core.js';
import { fmt } from './fmt.js';

const VS = `attribute vec3 p; attribute vec3 c; uniform mat4 m; uniform float s; varying vec3 vc;
void main(){ gl_Position = m * vec4(p, 1.0); gl_PointSize = s; vc = c; }`;
const FS = `precision mediump float; varying vec3 vc; uniform float r;
void main(){ if (r > 0.5) { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; } gl_FragColor = vec4(vc, 1.0); }`;

const mul = (a, b) => { const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
  return o; };
const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2);
  return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
const trans = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };

export function createViewer(host) {
  host.innerHTML = `<div class="viewer"><canvas tabindex="0" role="img"
    aria-label="3D view of the localisations. Drag or arrow keys to rotate, wheel or plus/minus to zoom, 0 to reset."></canvas>
    <div class="lg"></div><div class="ovl"></div></div>`;
  const canvas = host.querySelector('canvas'), ovl = host.querySelector('.ovl'), lg = host.querySelector('.lg');
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) {
    host.querySelector('.viewer').innerHTML = '<p class="err" style="padding:20px">WebGL is not available in this browser, so the 3D view cannot be shown. The tables below are unaffected.</p>';
    return { set() {}, options() {}, destroy() {} };
  }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const loc = { p: gl.getAttribLocation(prog, 'p'), c: gl.getAttribLocation(prog, 'c'), m: gl.getUniformLocation(prog, 'm'),
    s: gl.getUniformLocation(prog, 's'), r: gl.getUniformLocation(prog, 'r') };
  const layers = { pts: mk(), cen: mk(), lines: mk() };
  function mk() { return { pos: gl.createBuffer(), col: gl.createBuffer(), n: 0 }; }
  const cam = { yaw: -0.6, pitch: -1.0, dist: 2.8, px: 0, py: 0 };
  const opt = { size: 2, zscale: 1 };
  let data = null, frame = 0;

  function upload(layer, xyz, rgb) {
    const n = xyz.length / 3, P = new Float32Array(xyz.length);
    const { c, h } = data.norm;
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P[3 * i + k] = (xyz[3 * i + k] - c[k]) / h * (k === 2 ? opt.zscale : 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, layer.pos); gl.bufferData(gl.ARRAY_BUFFER, P, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, layer.col); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rgb), gl.STATIC_DRAW);
    layer.n = n;
  }
  function boxLines(lo, hi) {
    const v = [], C = (i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) v.push(...C(a), ...C(b));
    return v;
  }
  function rebuild() {
    if (!data) return;
    upload(layers.pts, data.points, data.colors);
    upload(layers.cen, data.centroids || [], data.centroidColors || []);
    const box = boxLines(data.bbox.min, data.bbox.max), lines = [...box, ...(data.lines || [])];
    const lc = [...Array(72).fill(0).map((_, i) => [0.3, 0.38, 0.55][i % 3]), ...(data.lineColors || [])];
    upload(layers.lines, lines, lc);
    const e = data.bbox.max.map((v, k) => v - data.bbox.min[k]);
    ovl.textContent = `box ${e.map(v => fmt(v, 0)).join(' × ')} nm (x × y × z)` + (opt.zscale !== 1 ? ` · z drawn ×${opt.zscale}` : '');
    lg.innerHTML = (data.legend || []).map(([col, t]) => `<div><span class="sw" style="background:${col}"></span>${esc(t)}</div>`).join('');
    draw();
  }
  function draw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
      if (!data) return;
      const m = mul(persp(0.7, w / Math.max(h, 1), 0.05, 50), mul(trans(cam.px, cam.py, -cam.dist), mul(rotX(cam.pitch), rotZ(cam.yaw))));
      gl.uniformMatrix4fv(loc.m, false, m);
      const go = (layer, mode, size, round) => {
        if (!layer.n) return;
        gl.uniform1f(loc.s, size * dpr); gl.uniform1f(loc.r, round);
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.pos); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.col); gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(mode, 0, layer.n);
      };
      go(layers.lines, gl.LINES, 1, 0);
      go(layers.pts, gl.POINTS, opt.size, 1);
      go(layers.cen, gl.POINTS, Math.max(7, opt.size * 3), 1);
    });
  }
  // --- interaction
  const ptrs = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
  canvas.addEventListener('pointerup', e => { ptrs.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const [x0, y0] = ptrs.get(e.pointerId), dx = e.clientX - x0, dy = e.clientY - y0;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) cam.dist = Math.min(20, Math.max(0.3, cam.dist * pinch / d));
      pinch = d;
      cam.px += dx / canvas.clientWidth; cam.py -= dy / canvas.clientHeight;
    } else if (e.shiftKey) {
      cam.px += 2 * dx / canvas.clientWidth * cam.dist / 2.8; cam.py -= 2 * dy / canvas.clientHeight * cam.dist / 2.8;
    } else {
      cam.yaw += dx * 0.01; cam.pitch = Math.max(-Math.PI, Math.min(0, cam.pitch + dy * 0.01));
    }
    draw();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.min(20, Math.max(0.3, cam.dist * Math.exp(e.deltaY * 0.001))); draw(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const k = e.key, step = 0.1;
    if (k === 'ArrowLeft') cam.yaw -= step; else if (k === 'ArrowRight') cam.yaw += step;
    else if (k === 'ArrowUp') cam.pitch = Math.max(-Math.PI, cam.pitch - step); else if (k === 'ArrowDown') cam.pitch = Math.min(0, cam.pitch + step);
    else if (k === '+' || k === '=') cam.dist = Math.max(0.3, cam.dist / 1.15); else if (k === '-') cam.dist = Math.min(20, cam.dist * 1.15);
    else if (k === '0') Object.assign(cam, { yaw: -0.6, pitch: -1.0, dist: 2.8, px: 0, py: 0 });
    else return;
    e.preventDefault(); draw();
  });
  const ro = new ResizeObserver(draw); ro.observe(canvas);

  return {
    // d: { points: xyz nm (flat), colors: rgb (flat), centroids, centroidColors, lines, lineColors, bbox:{min,max}, legend }
    set(d) {
      const c = d.bbox.min.map((v, k) => (v + d.bbox.max[k]) / 2);
      const h = Math.max(...d.bbox.max.map((v, k) => v - d.bbox.min[k])) / 2 || 1;
      data = { ...d, norm: { c, h } }; rebuild();
    },
    options(o) { Object.assign(opt, o); rebuild(); },
    // centre the view on one point (nm) and zoom in
    focus(xyz, zoom = 0.6) {
      if (!data) return;
      const { c, h } = data.norm, p = xyz.map((v, k) => (v - c[k]) / h * (k === 2 ? opt.zscale : 1));
      const m = mul(rotX(cam.pitch), rotZ(cam.yaw)), q = [0, 1, 2].map(j => m[j] * p[0] + m[4 + j] * p[1] + m[8 + j] * p[2]);
      cam.px = -q[0]; cam.py = -q[1]; cam.dist = zoom + q[2]; draw();
    },
    destroy() { ro.disconnect(); cancelAnimationFrame(frame); },
  };
}

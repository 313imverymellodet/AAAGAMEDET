// Tiny WebGL2 renderer: instanced toon primitives, terrain, water, sky, sprites,
// ground decals and an optional bloom post-process. Zero dependencies.
import * as S from './shaders.js';
import * as G from './geometry.js';
import { mat4 } from './mat.js';

const INST_FLOATS = 24; // mat4 + color(4) + ext(4)

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(sh) + '\n' + src.split('\n').slice(0, 4).join('\n'));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

class InstanceList {
  constructor(gl, geom, cap = 64) {
    this.gl = gl;
    this.geom = geom;
    this.cap = cap;
    this.data = new Float32Array(cap * INST_FLOATS);
    this.n = 0;
    this.buf = gl.createBuffer();
    this.vao = gl.createVertexArray();
    this.gpuCap = 0;
    this.dirty = true;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, geom.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geom.ibo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (let i = 0; i < 6; i++) {
      gl.enableVertexAttribArray(2 + i);
      gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, INST_FLOATS * 4, i * 16);
      gl.vertexAttribDivisor(2 + i, 1);
    }
    gl.bindVertexArray(null);
  }
  grow() {
    const nd = new Float32Array(this.cap * 2 * INST_FLOATS);
    nd.set(this.data);
    this.data = nd;
    this.cap *= 2;
  }
  push(m, r, g, b, a, e, sx, sy, sz) {
    if (this.n >= this.cap) this.grow();
    const o = this.n * INST_FLOATS;
    const d = this.data;
    d.set(m, o);
    d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = a;
    d[o + 20] = sx; d[o + 21] = sy; d[o + 22] = sz; d[o + 23] = e;
    this.n++;
    this.dirty = true;
  }
  upload() {
    if (!this.dirty) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.gpuCap < this.cap) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      this.gpuCap = this.cap;
    }
    if (this.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * INST_FLOATS);
    this.dirty = false;
  }
  draw() {
    if (!this.n) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.geom.count, gl.UNSIGNED_SHORT, 0, this.n);
  }
}

export class Renderer {
  constructor(canvas, quality = 'medium') {
    this.canvas = canvas;
    this.quality = quality;
    const gl = canvas.getContext('webgl2', { antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available on this device/browser.');
    this.gl = gl;
    this.scale = 1;
    this.time = 0;
    this.env = {
      sun: normalize([0.45, 0.78, 0.35]), sunCol: [1.0, 0.93, 0.8], sky: [0.55, 0.72, 0.95], ground: [0.34, 0.31, 0.26],
      fog: [0.56, 0.69, 0.86], zenith: [0.16, 0.36, 0.78], fogNear: 95, fogFar: 240,
    };
    this.vp = mat4.create();
    this.view = mat4.create();
    this.proj = mat4.create();
    this.invVP = mat4.create();
    this.camPos = [0, 10, 10];
    this.right = [1, 0, 0];
    this.up = [0, 1, 0];
    this.tint = [1, 0, 0];
    this.tintAmt = 0;
    this.vignette = 0.6;

    this.lit = compile(gl, S.LIT_VS, S.LIT_FS);
    this.terrainP = compile(gl, S.TERRAIN_VS, S.TERRAIN_FS);
    this.waterP = compile(gl, S.WATER_VS, S.WATER_FS);
    this.skyP = compile(gl, S.SKY_VS, S.SKY_FS);
    this.spriteP = compile(gl, S.SPRITE_VS, S.SPRITE_FS);
    this.decalP = compile(gl, S.DECAL_VS, S.DECAL_FS);
    this.brightP = compile(gl, S.POST_VS, S.BRIGHT_FS);
    this.blurP = compile(gl, S.POST_VS, S.BLUR_FS);
    this.compP = compile(gl, S.POST_VS, S.COMPOSITE_FS);
    this.overlayP = compile(gl, S.POST_VS, S.OVERLAY_FS);

    // fullscreen triangle
    this.fsVao = gl.createVertexArray();
    gl.bindVertexArray(this.fsVao);
    const fsb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // geometry registry
    this.geoms = {};
    const reg = (name, g) => this.registerGeometry(name, g);
    reg('box', G.box()); reg('sphere', G.sphere()); reg('cyl', G.cylinder()); reg('cone', G.cone()); reg('limb', G.limb());
    reg('octa', G.octahedron()); reg('torus', G.torus()); reg('blade', G.blade()); reg('quad', G.quad()); reg('arc', G.arc());
    reg('ico', G.icosahedron(0, 0)); reg('rock', G.rock(7)); reg('rock2', G.rock(19)); reg('gem', G.icosahedron(1, 0));
    reg('ring', G.torus(32, 4, 0.03));

    // sprite quad + instance buffer
    this.spriteCap = quality === 'low' ? 1600 : 4000;
    this.spriteData = new Float32Array(this.spriteCap * 12);
    this.spriteN = 0;
    this.spriteVao = gl.createVertexArray();
    gl.bindVertexArray(this.spriteVao);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.spriteBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);

    // decal quad
    this.decalVao = gl.createVertexArray();
    gl.bindVertexArray(this.decalVao);
    const db = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, db);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.decals = [];

    this.terrain = null;
    this.water = null;
    this.post = null;
    this.setQuality(quality);
    this.resize();
  }

  registerGeometry(name, g) {
    const gl = this.gl;
    const inter = new Float32Array((g.pos.length / 3) * 6);
    for (let i = 0; i < g.pos.length / 3; i++) {
      inter.set(g.pos.subarray(i * 3, i * 3 + 3), i * 6);
      inter.set(g.nor.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
    const geom = { vbo, ibo, count: g.idx.length };
    geom.lists = {
      o: new InstanceList(gl, geom), p: new InstanceList(gl, geom), t: new InstanceList(gl, geom),
      so: new InstanceList(gl, geom, 16), sp: new InstanceList(gl, geom, 16),
    };
    this.geoms[name] = geom;
  }

  setQuality(q) {
    this.quality = q;
    this.outlines = q !== 'low';
    this.bloom = q === 'high';
    this.maxRatio = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
    this.post = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxRatio || 1.5) * this.scale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.post = null;
    }
    this.width = w;
    this.height = h;
  }

  // ---------------------------------------------------------------- frame API
  push(name, m, color, alpha = 1, emissive = 0, sx = 1, sy = 1, sz = 1, outline = true) {
    const g = this.geoms[name];
    const list = alpha < 0.999 ? g.lists.t : outline && this.outlines ? g.lists.o : g.lists.p;
    list.push(m, color[0], color[1], color[2], alpha, emissive, sx, sy, sz);
  }
  pushStatic(name, m, color, emissive = 0, sx = 1, sy = 1, sz = 1, outline = true) {
    const g = this.geoms[name];
    (outline ? g.lists.so : g.lists.sp).push(m, color[0], color[1], color[2], 1, emissive, sx, sy, sz);
  }
  clearStatic() {
    for (const g of Object.values(this.geoms)) { g.lists.so.n = 0; g.lists.sp.n = 0; g.lists.so.dirty = g.lists.sp.dirty = true; }
  }

  sprite(x, y, z, size, r, g, b, a, shape = 0, additive = 1, rot = 0, flat = 0, aux = 0) {
    if (this.spriteN >= this.spriteCap) return;
    const o = this.spriteN * 12;
    const d = this.spriteData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a;
    d[o + 8] = rot; d[o + 9] = shape; d[o + 10] = flat; d[o + 11] = Math.floor(aux * 100) + (additive ? 0.99 : 0);
    this.spriteN++;
  }

  decal(type, x, y, z, angle, sx, sz, color, alpha, p0 = 0, p1 = 0, p2 = 0, p3 = 0) {
    this.decals.push({ type, x, y, z, angle, sx, sz, color, alpha, p: [p0, p1, p2, p3] });
  }

  setCamera(eye, target, fovDeg = 60, near = 0.3, far = 420) {
    mat4.perspective(this.proj, (fovDeg * Math.PI) / 180, this.width / this.height, near, far);
    mat4.lookAt(this.view, eye, target, [0, 1, 0]);
    mat4.multiply(this.vp, this.proj, this.view);
    this.camPos = eye;
    const v = this.view;
    this.right = [v[0], v[4], v[8]];
    this.up = [v[1], v[5], v[9]];
    invert(this.invVP, this.vp);
  }

  // ---------------------------------------------------------------- terrain/water setup
  setTerrain(mesh, canvas, mapSize) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    this.terrain = { vao, count: mesh.idx.length, tex, mapSize, idxType: mesh.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  setWater(mesh) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.water = { vao, count: mesh.idx.length };
  }

  // ---------------------------------------------------------------- post-processing targets
  makePost() {
    const gl = this.gl;
    const w = this.width, h = this.height;
    const tex = (tw, th) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const fbo = (t) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return f;
    };
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
    const ms = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    const cr = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, cr);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, cr);
    const dr = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, dr);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dr);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    const sceneTex = tex(w, h);
    const scene = fbo(sceneTex);
    const hw = Math.max(1, w >> 2), hh = Math.max(1, h >> 2);
    const aTex = tex(hw, hh), bTex = tex(hw, hh);
    const a = fbo(aTex), b = fbo(bTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { this.bloom = false; return null; }
    this.post = { ms, scene, sceneTex, a, aTex, b, bTex, hw, hh, w, h };
    return this.post;
  }

  // ---------------------------------------------------------------- render
  render() {
    const gl = this.gl;
    const E = this.env;
    let post = null;
    if (this.bloom) post = this.post && this.post.w === this.width && this.post.h === this.height ? this.post : this.makePost();
    gl.bindFramebuffer(gl.FRAMEBUFFER, post ? post.ms : null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(E.fog[0], E.fog[1], E.fog[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);

    // sky
    gl.useProgram(this.skyP.p);
    gl.uniformMatrix4fv(this.skyP.u.uInvVP, false, this.invVP);
    gl.uniform3fv(this.skyP.u.uSun, E.sun);
    gl.uniform3fv(this.skyP.u.uSky, E.sky);
    gl.uniform3fv(this.skyP.u.uFog, E.fog);
    gl.uniform3fv(this.skyP.u.uZenith, E.zenith);
    gl.depthMask(false);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    // terrain
    if (this.terrain) {
      const p = this.terrainP;
      gl.useProgram(p.p);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      this.envUniforms(p);
      gl.uniform1f(p.u.uMapSize, this.terrain.mapSize);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.terrain.tex);
      gl.uniform1i(p.u.uTex, 0);
      gl.bindVertexArray(this.terrain.vao);
      gl.drawElements(gl.TRIANGLES, this.terrain.count, this.terrain.idxType, 0);
    }

    // decals (ground indicators) — drawn over terrain, under units
    if (this.decals.length) {
      const p = this.decalP;
      gl.useProgram(p.p);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
      gl.uniform1f(p.u.uTime, this.time);
      gl.bindVertexArray(this.decalVao);
      for (const d of this.decals) {
        gl.uniform4f(p.u.uXf, d.x, d.z, d.angle, d.y);
        gl.uniform2f(p.u.uSize, d.sx, d.sz);
        gl.uniform1i(p.u.uType, d.type);
        gl.uniform4f(p.u.uColor, d.color[0], d.color[1], d.color[2], d.alpha);
        gl.uniform4f(p.u.uP, d.p[0], d.p[1], d.p[2], d.p[3]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    this.decals.length = 0;

    // instanced toon geometry
    const lp = this.lit;
    gl.useProgram(lp.p);
    this.envUniforms(lp);
    gl.uniform1f(lp.u.uTime, this.time);
    const geoms = Object.values(this.geoms);
    for (const g of geoms) for (const k of ['o', 'p', 't', 'so', 'sp']) g.lists[k].upload();
    // opaque
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.uniform1f(lp.u.uOutline, 0);
    for (const g of geoms) { g.lists.so.draw(); g.lists.sp.draw(); g.lists.o.draw(); g.lists.p.draw(); }
    // outlines (inverted hull)
    if (this.outlines) {
      gl.cullFace(gl.FRONT);
      gl.uniform1f(lp.u.uOutline, 0.045);
      for (const g of geoms) { g.lists.so.draw(); g.lists.o.draw(); }
      gl.cullFace(gl.BACK);
      gl.uniform1f(lp.u.uOutline, 0);
    }

    // water
    if (this.water) {
      const p = this.waterP;
      gl.useProgram(p.p);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.envUniforms(p);
      gl.uniform1f(p.u.uTime, this.time);
      gl.bindVertexArray(this.water.vao);
      gl.drawElements(gl.TRIANGLES, this.water.count, gl.UNSIGNED_SHORT, 0);
    }

    // transparent instanced
    gl.useProgram(lp.p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (const g of geoms) g.lists.t.draw();

    // sprites
    if (this.spriteN) {
      const p = this.spriteP;
      gl.useProgram(p.p);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
      gl.uniform3fv(p.u.uRight, this.right);
      gl.uniform3fv(p.u.uUp, this.up);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData, 0, this.spriteN * 12);
      gl.bindVertexArray(this.spriteVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.spriteN);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // reset dynamic lists
    for (const g of geoms) { g.lists.o.n = 0; g.lists.p.n = 0; g.lists.t.n = 0; }
    this.spriteN = 0;

    // post
    if (post) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, post.ms);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, post.scene);
      gl.blitFramebuffer(0, 0, post.w, post.h, 0, 0, post.w, post.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(this.fsVao);
      // bright pass -> a
      gl.bindFramebuffer(gl.FRAMEBUFFER, post.a);
      gl.viewport(0, 0, post.hw, post.hh);
      gl.useProgram(this.brightP.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, post.sceneTex);
      gl.uniform1i(this.brightP.u.uTex, 0);
      gl.uniform2f(this.brightP.u.uTexel, 1 / post.w, 1 / post.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(this.blurP.p);
      gl.uniform1i(this.blurP.u.uTex, 0);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, post.b);
        gl.bindTexture(gl.TEXTURE_2D, post.aTex);
        gl.uniform2f(this.blurP.u.uDir, (1 + i) / post.hw, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, post.a);
        gl.bindTexture(gl.TEXTURE_2D, post.bTex);
        gl.uniform2f(this.blurP.u.uDir, 0, (1 + i) / post.hh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.useProgram(this.compP.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, post.sceneTex);
      gl.uniform1i(this.compP.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, post.aTex);
      gl.uniform1i(this.compP.u.uBloom, 1);
      gl.uniform1f(this.compP.u.uBloomStr, 0.75);
      gl.uniform1f(this.compP.u.uVignette, this.vignette);
      gl.uniform3fv(this.compP.u.uTint, this.tint);
      gl.uniform1f(this.compP.u.uTintAmt, this.tintAmt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST);
    } else if (this.vignette > 0 || this.tintAmt > 0) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.overlayP.p);
      gl.uniform3fv(this.overlayP.u.uTint, this.tint);
      gl.uniform1f(this.overlayP.u.uTintAmt, this.tintAmt);
      gl.uniform1f(this.overlayP.u.uVignette, this.vignette);
      gl.bindVertexArray(this.fsVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null);
  }

  envUniforms(p) {
    const gl = this.gl, E = this.env, u = p.u;
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, this.vp);
    if (u.uCam) gl.uniform3fv(u.uCam, this.camPos);
    if (u.uSun) gl.uniform3fv(u.uSun, E.sun);
    if (u.uSunCol) gl.uniform3fv(u.uSunCol, E.sunCol);
    if (u.uSky) gl.uniform3fv(u.uSky, E.sky);
    if (u.uGround) gl.uniform3fv(u.uGround, E.ground);
    if (u.uFog) gl.uniform3fv(u.uFog, E.fog);
    if (u.uFogNear) gl.uniform1f(u.uFogNear, E.fogNear);
    if (u.uFogFar) gl.uniform1f(u.uFogFar, E.fogFar);
  }
}

function normalize(v) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

function invert(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

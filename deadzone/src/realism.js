/* =====================================================================
   DEADZONE · Módulo de realismo
   - Personagens: soldado 3D com esqueleto (skinned mesh) que copia, a cada
     quadro, a pose do esqueleto procedural do jogo (correr, agachar, deitar,
     mirar, paraquedas, morrer...). Assim todas as animações existentes
     continuam funcionando, mas com um corpo humano realista.
   - Vegetação: árvores, pinheiros, arbustos e grama com folhas em alpha.
   - Ambiente: reflexos do céu (PBR), sombras suaves, chão sem repetição,
     água com ondas, reboco das casas.
   ===================================================================== */
(function () {
  'use strict';
  const T = THREE;
  const ASSET = {
    soldier: '%%ASSET:soldier.glb%%',
    grass: '%%ASSET:grass.jpg%%',
    brick: '%%ASSET:brick.jpg%%',
    water: '%%ASSET:waternormals.jpg%%'
  };
  const DZR = window.DZR = { rigs: [], ready: false, water: [], lod: 70 };

  /* ---------- utilidades ---------- */
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const lin = c => new T.Color(c).convertSRGBToLinear();
  function b64ab(u) { const s = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a.buffer; }
  function canvasTex(w, h, fn, srgb) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); if (srgb !== false) t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function imgTex(k, rx, ry) {
    const t = new T.TextureLoader().load(ASSET[k]); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry);
    t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t;
  }
  // geometria "livre" (não indexada) com position/normal/uv/color
  function GB() { return { p: [], n: [], u: [], c: [] }; }
  function gbGeo(b) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(b.u, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(b.c, 3));
    g.computeBoundingSphere(); return g;
  }
  function gbAddGeo(b, geo, m, col) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      b.p.push(P.getX(i), P.getY(i), P.getZ(i)); b.n.push(N.getX(i), N.getY(i), N.getZ(i));
      b.u.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      const k = typeof col === 'function' ? col(P.getY(i)) : col; b.c.push(k, k, k);
    }
  }
  // quad (2 triângulos) centrado em c, eixos a (largura) e v (altura), normal personalizada
  function gbQuad(b, c, a, v, n, col, u0, u1, v0, v1, colTop) {
    const P = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [x, y] of P) {
      b.p.push(c.x + a.x * x + v.x * y, c.y + a.y * x + v.y * y, c.z + a.z * x + v.z * y);
      b.n.push(n.x, n.y, n.z);
      b.u.push(x < 0 ? u0 : u1, y < 0 ? v0 : v1);
      const k = (y > 0 && colTop != null) ? colTop : col; b.c.push(k, k, k);
    }
  }
  const V = (x, y, z) => new T.Vector3(x, y, z);

  /* ---------- texturas procedurais ---------- */
  function leafTex() {
    return canvasTex(256, 256, (g, w, h) => {
      const r = rng(7);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,50,30,.9)'; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(r() * w, r() * h); g.stroke(); }
      for (let i = 0; i < 230; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * .44, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
        g.save(); g.translate(x, y); g.rotate(r() * 6.3);
        const L = 9 + r() * 9, Wd = 4 + r() * 4, hue = 78 + r() * 34, lt = 20 + r() * 22;
        g.fillStyle = 'hsl(' + hue + ',' + (38 + r() * 25) + '%,' + lt + '%)';
        g.beginPath(); g.ellipse(0, 0, L, Wd, 0, 0, 7); g.fill();
        g.strokeStyle = 'hsla(' + hue + ',40%,' + (lt + 12) + '%,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
        g.restore();
      }
    });
  }
  function needleTex() {
    return canvasTex(128, 256, (g, w, h) => {
      const r = rng(11); g.clearRect(0, 0, w, h);
      g.strokeStyle = '#4a3420'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 6); g.stroke();
      for (let y = h - 6; y > 8; y -= 2.2) {
        const f = y / h, L = (8 + 50 * f) * (.75 + r() * .35);
        for (const s of [-1, 1]) {
          const lt = 14 + r() * 16;
          g.strokeStyle = 'hsl(' + (95 + r() * 30) + ',' + (35 + r() * 20) + '%,' + lt + '%)'; g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * L, y - L * (.45 + r() * .3)); g.stroke();
        }
      }
    });
  }
  function grassTex() {
    return canvasTex(256, 128, (g, w, h) => {
      const r = rng(5); g.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = 8 + r() * (w - 16), H = h * (.45 + r() * .55), bend = (r() - .5) * 40, wd = 2 + r() * 3.5;
        const lt = 22 + r() * 24; g.fillStyle = 'hsl(' + (70 + r() * 40) + ',' + (40 + r() * 25) + '%,' + lt + '%)';
        g.beginPath(); g.moveTo(x - wd, h); g.quadraticCurveTo(x + bend * .3, h - H * .6, x + bend, h - H); g.quadraticCurveTo(x + bend * .3 + wd * .3, h - H * .6, x + wd, h); g.fill();
      }
    });
  }
  function barkTex() {
    return canvasTex(128, 256, (g, w, h) => {
      const r = rng(3); g.fillStyle = '#5a4a3c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const x = r() * w, l = 20 + r() * 90; g.fillStyle = 'rgba(' + (r() < .5 ? '20,14,10' : '140,125,110') + ',' + (.15 + r() * .3) + ')'; g.fillRect(x, r() * h, 1 + r() * 3, l); }
      for (let i = 0; i < 1500; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * .15 + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
    });
  }
  function rockTex() {
    return canvasTex(256, 256, (g, w, h) => {
      const r = rng(9); g.fillStyle = '#8a8680'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(' + (r() < .5 ? '40,38,35' : '200,195,185') + ',' + (.05 + r() * .12) + ')'; g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 40, 0, 7); g.fill(); }
      for (let i = 0; i < 5000; i++) { g.fillStyle = 'rgba(' + (r() < .5 ? '0,0,0' : '255,255,255') + ',' + r() * .12 + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      g.strokeStyle = 'rgba(30,28,25,.35)'; for (let i = 0; i < 12; i++) { g.lineWidth = 1 + r() * 2; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 50; y += (r() - .5) * 50; g.lineTo(x, y); } g.stroke(); }
    });
  }
  DZR.plasterTex = function (rx, ry) {
    const t = canvasTex(512, 512, (g, w, h) => {
      const r = rng(21); g.fillStyle = '#efebe3'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(' + (r() < .6 ? '120,110,95' : '255,255,250') + ',' + (.02 + r() * .05) + ')'; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 60, 0, 7); g.fill(); }
      for (let i = 0; i < 14000; i++) { g.fillStyle = 'rgba(' + (r() < .5 ? '0,0,0' : '255,255,255') + ',' + (.02 + r() * .07) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      // escorridos de sujeira
      for (let i = 0; i < 40; i++) { const x = r() * w, l = 30 + r() * 140, gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(70,62,50,.10)'); gr.addColorStop(1, 'rgba(70,62,50,0)'); g.fillStyle = gr; g.save(); g.translate(x, r() * h); g.fillRect(0, 0, 2 + r() * 6, l); g.restore(); }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx || 2, ry || 1); return t;
  };

  /* ---------- construções: telhas e tijolos ---------- */
  DZR.roofMat = function () {
    const t = canvasTex(256, 256, (g, w, h) => {
      const r = rng(13); g.fillStyle = '#2a2624'; g.fillRect(0, 0, w, h);
      const rows = 6, cols = 8, th = h / rows, tw = w / cols;
      for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) {
        const x = i * tw + (j % 2) * tw / 2, y = j * th, l = 62 + r() * 22;
        const gr = g.createLinearGradient(0, y, 0, y + th); gr.addColorStop(0, 'hsl(20,8%,' + (l + 10) + '%)'); gr.addColorStop(.85, 'hsl(20,8%,' + l + '%)'); gr.addColorStop(1, 'hsl(20,8%,' + (l - 25) + '%)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + tw - 2, y); g.quadraticCurveTo(x + tw - 1, y + th * .9, x + tw / 2, y + th - 1); g.quadraticCurveTo(x + 1, y + th * .9, x + 2, y); g.fill();
      }
      for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * .12 + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(16, 5);
    return new T.MeshStandardMaterial({ vertexColors: true, map: t, bumpMap: t, bumpScale: .03, roughness: .85, metalness: 0 });
  };
  DZR.brickMat = function () {
    const t = imgTex('brick', 1, 1);
    const m = new T.MeshStandardMaterial({ vertexColors: true, map: t, roughness: .92, metalness: 0 });
    // UV pelo espaço do mundo: tijolos sempre do mesmo tamanho em qualquer parede
    m.onBeforeCompile = s => {
      s.vertexShader = 'varying vec3 vWPos;varying vec3 vWNrm;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;vWNrm=normalize(mat3(modelMatrix)*objectNormal);');
      s.fragmentShader = 'varying vec3 vWPos;varying vec3 vWNrm;\n' + s.fragmentShader.replace('#include <map_fragment>', 'vec3 an=abs(vWNrm);vec2 bu=an.x>an.z?vWPos.zy:vWPos.xy;if(an.y>.7)bu=vWPos.xz;vec4 texelColor=texture2D(map,bu*vec2(.42,.84));texelColor=mapTexelToLinear(texelColor);diffuseColor*=texelColor;');
    };
    return m;
  };

  /* ---------- materiais de vegetação ---------- */
  let MAT = null;
  function mats() {
    if (MAT) return MAT;
    const bark = barkTex(); bark.wrapS = bark.wrapT = T.RepeatWrapping; bark.repeat.set(2, 3);
    const rock = rockTex(); rock.wrapS = rock.wrapT = T.RepeatWrapping;
    const leaf = leafTex(), needle = needleTex(), grass = grassTex();
    // folhas: os dois lados usam a mesma normal (sem isso o verso fica preto)
    const noFlip = m => { m.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', T.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '')); }; return m; };
    const foliage = (map) => noFlip(new T.MeshStandardMaterial({ map, alphaTest: .42, side: T.DoubleSide, vertexColors: true, roughness: .85, metalness: 0 }));
    MAT = {
      bark: new T.MeshStandardMaterial({ map: bark, vertexColors: true, roughness: .95, metalness: 0 }),
      leaf: foliage(leaf), needle: foliage(needle),
      grass: noFlip(new T.MeshStandardMaterial({ map: grass, alphaTest: .4, side: T.DoubleSide, vertexColors: true, roughness: 1, metalness: 0 })),
      rock: new T.MeshStandardMaterial({ map: rock, bumpMap: rock, bumpScale: .04, roughness: .95, metalness: 0 })
    };
    return MAT;
  }
  DZR.mats = mats;

  /* ---------- árvore de folhas largas ---------- */
  function trunkAndBranches(b, r, H, r0, r1, nBr, brY0, brY1, brL) {
    const m = new T.Matrix4(), q = new T.Quaternion();
    const tg = new T.CylinderGeometry(r1, r0, H, 9, 5, false);
    { const P = tg.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = 1 + (r() - .5) * .12 + (y < -H / 2 + .3 ? .35 : 0); P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); } tg.computeVertexNormals(); }
    m.makeTranslation(0, H / 2, 0); gbAddGeo(b, tg, m, y => .55 + .45 * Math.min(1, (y + .2) / 3));
    for (let i = 0; i < nBr; i++) {
      const a = i / nBr * 6.283 + r() * .8, el = .55 + r() * .45, L = brL * (.8 + r() * .4), y0 = brY0 + r() * (brY1 - brY0);
      const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const g = new T.CylinderGeometry(.035, r1 * .7, L, 6, 1, false); g.translate(0, L / 2, 0);
      q.setFromUnitVectors(V(0, 1, 0), dir); m.compose(V(0, y0, 0), q, V(1, 1, 1)); gbAddGeo(b, g, m, .8);
    }
  }
  DZR.tree = function (seed) {
    const r = rng(seed * 31 + 7), M_ = mats(), wood = GB(), lf = GB();
    const H = 4.4 + r() * .8;
    trunkAndBranches(wood, r, H, .34, .2, 5, 2.6, 3.8, 2.4);
    const CY = 5.8, lobes = [[0, 0, 0, 3.2, 2.3, 3.2]];
    for (let i = 0; i < 6; i++) { const a = r() * 6.283, d = 1.6 + r() * 1.4; lobes.push([Math.cos(a) * d, (r() - .4) * 1.5, Math.sin(a) * d, 1.7 + r() * .8, 1.3 + r() * .7, 1.7 + r() * .8]); }
    const N = 95;
    for (let i = 0; i < N; i++) {
      const L = lobes[i < 30 ? 0 : 1 + Math.floor(r() * (lobes.length - 1))];
      const th = r() * 6.283, ph = Math.acos(2 * r() - 1), rr = .55 + .45 * Math.cbrt(r());
      const lp = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      const c = V(L[0] + lp.x * L[3] * rr, CY + L[1] + lp.y * L[4] * rr, L[2] + lp.z * L[5] * rr);
      const s = 1.05 + r() * .7, nrm = V(r() - .5, r() - .5, r() - .5).normalize();
      const a = new T.Vector3().crossVectors(nrm, Math.abs(nrm.y) > .9 ? V(1, 0, 0) : V(0, 1, 0)).normalize().multiplyScalar(s), v = new T.Vector3().crossVectors(nrm, a).normalize().multiplyScalar(s);
      const out = c.clone().sub(V(0, CY - .6, 0)).normalize(); out.lerp(nrm, .15).normalize();
      const shade = .45 + .55 * Math.min(1, Math.max(0, (c.y - (CY - 2.6)) / 5)) * (.6 + .4 * rr);
      gbQuad(lf, c, a, v, out, shade, 0, 1, 0, 1);
    }
    return [[gbGeo(wood), M_.bark, 1], [gbGeo(lf), M_.leaf, 0]];
  };

  /* ---------- pinheiro ---------- */
  DZR.pine = function (seed, nT, rB) {
    const r = rng(seed * 17 + 3), M_ = mats(), wood = GB(), nd = GB(), m = new T.Matrix4();
    const H = (3 + nT * 3 + 3) * .62, R0 = .22 + nT * .025;
    const tg = new T.CylinderGeometry(.04, R0, H, 8, 6, false);
    { const P = tg.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = 1 + (y < -H / 2 + .25 ? .4 : 0) + (r() - .5) * .08; P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); } tg.computeVertexNormals(); }
    m.makeTranslation(0, H / 2, 0); gbAddGeo(wood, tg, m, y => .55 + .45 * Math.min(1, (y + .2) / 3));
    const y0 = Math.max(1.6, H * .22), nW = 4 + nT * 2;
    for (let w = 0; w < nW; w++) {
      const f = w / (nW - 1), y = y0 + (H - .6 - y0) * f + (r() - .5) * .25;
      const rad = (rB * .62 * (1 - f * .92) + .35) * (.9 + r() * .2), k = 7 + Math.floor(r() * 3), a0 = r() * 6.283;
      const shade = .45 + .55 * f;
      for (let i = 0; i < k; i++) {
        const a = a0 + i / k * 6.283 + (r() - .5) * .4, dr = V(Math.cos(a), 0, Math.sin(a)), droop = -.25 - r() * .3;
        const along = V(dr.x * Math.cos(droop), Math.sin(droop), dr.z * Math.cos(droop)).normalize();
        const side = new T.Vector3().crossVectors(along, V(0, 1, 0)).normalize();
        const up = new T.Vector3().crossVectors(side, along).normalize();
        const L = rad, Wd = rad * .42 + .25;
        const c = V(along.x * L / 2, y + along.y * L / 2, along.z * L / 2);
        const nrm = dr.clone().multiplyScalar(.6).add(V(0, .8, 0)).normalize();
        // a textura tem o "galho" na vertical: u = largura, v = comprimento
        gbQuad(nd, c, side.clone().multiplyScalar(Wd), along.clone().multiplyScalar(L / 2), nrm, shade * .85, 0, 1, 0, 1, shade);
        gbQuad(nd, c, up.clone().multiplyScalar(Wd * .7), along.clone().multiplyScalar(L / 2), nrm, shade * .75, 0, 1, 0, 1, shade);
      }
    }
    for (let i = 0; i < 3; i++) { const a = i * 1.047, s = V(Math.cos(a) * .55, 0, Math.sin(a) * .55); gbQuad(nd, V(0, H + .25, 0), s, V(0, .9, 0), V(0, 1, 0), 1, 0, 1, 0, 1); }
    return [[gbGeo(wood), M_.bark, 1], [gbGeo(nd), M_.needle, 0]];
  };

  /* ---------- arbusto, grama, pedra ---------- */
  DZR.bushGeo = function () {
    const r = rng(77), b = GB();
    for (let i = 0; i < 22; i++) {
      const th = r() * 6.283, ph = Math.acos(2 * r() - 1), rr = .35 + .5 * r();
      const c = V(Math.sin(ph) * Math.cos(th) * rr, Math.cos(ph) * rr * .7, Math.sin(ph) * Math.sin(th) * rr);
      const nrm = V(r() - .5, r() - .5, r() - .5).normalize(), s = .45 + r() * .3;
      const a = new T.Vector3().crossVectors(nrm, V(0, 1, 0)).normalize().multiplyScalar(s), v = new T.Vector3().crossVectors(nrm, a).normalize().multiplyScalar(s);
      gbQuad(b, c, a, v, c.clone().normalize(), .55 + .45 * (c.y + .5), 0, 1, 0, 1);
    }
    return gbGeo(b);
  };
  DZR.grassGeo = function () {
    const b = GB();
    for (let i = 0; i < 3; i++) { const a = i * 1.047; gbQuad(b, V(0, .26, 0), V(Math.cos(a) * .42, 0, Math.sin(a) * .42), V(0, .27, 0), V(0, 1, 0), .65, 0, 1, 0, 1, 1); }
    return gbGeo(b);
  };
  DZR.rockGeo = function () {
    const g = new T.IcosahedronGeometry(1, 2), P = g.attributes.position, r = rng(5), seen = new Map();
    for (let i = 0; i < P.count; i++) {
      const k = P.getX(i).toFixed(3) + P.getY(i).toFixed(3) + P.getZ(i).toFixed(3); let s = seen.get(k); if (s == null) { s = .8 + r() * .35; seen.set(k, s); }
      let y = P.getY(i) * s; if (y < -.2) y = -.2 - (y + .2) * .2; P.setXYZ(i, P.getX(i) * s, y, P.getZ(i) * s);
    }
    g.computeVertexNormals(); return g;
  };

  /* ---------- chão com variação (sem padrão repetido) ---------- */
  DZR.groundMat = function () {
    const map = imgTex('grass', 240, 240);
    const m = new T.MeshStandardMaterial({ map, roughness: 1, metalness: 0, color: lin(0xd6dcc8) });
    m.onBeforeCompile = s => {
      s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `
        vec2 gu=vUv; vec4 tA=texture2D(map,gu); vec4 tB=texture2D(map,gu*.31+vec2(.37,.11));
        vec2 q=gu*.045; float n=sin(q.x*1.7+sin(q.y*1.3))*.5+sin(q.y*2.3+sin(q.x*.9)*1.7)*.5;
        float n2=sin(gu.x*.23+cos(gu.y*.19)*2.)*.5+.5;
        vec4 texelColor=mix(tA,tB,.5+.25*n);
        texelColor.rgb*=mix(vec3(1.08,1.02,.82),vec3(.82,.92,.78),n2);
        texelColor=mapTexelToLinear(texelColor); diffuseColor*=texelColor;`);
    };
    return m;
  };

  /* ---------- ambiente: reflexos do céu, sombras, água ---------- */
  DZR.post = function () {
    try {
      // reflexos do céu para todos os materiais PBR
      // céu em gradiente feito com cores por vértice (MeshBasic é codificado corretamente pelo PMREM)
      const es = new T.Scene(), sg = new T.SphereGeometry(10, 48, 24), P = sg.attributes.position, cols = [], sd = V(55, 90, 30).normalize(), d = new T.Vector3();
      const top = lin(0x3c6fae), hor = lin(0xb8c8d2), gnd = lin(0x4a4c3c);
      for (let i = 0; i < P.count; i++) {
        d.set(P.getX(i), P.getY(i), P.getZ(i)).normalize(); const c = new T.Color();
        if (d.y >= 0) c.copy(hor).lerp(top, Math.pow(d.y, .6)); else c.copy(hor).lerp(gnd, Math.min(1, -d.y * 3));
        const g = Math.pow(Math.max(d.dot(sd), 0), 24) * 3.5; c.r += g; c.g += g * .9; c.b += g * .7;
        cols.push(c.r, c.g, c.b);
      }
      sg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
      es.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
      const pm = new T.PMREMGenerator(ren); const rtE = pm.fromScene(es, .02); DZR.envTex = rtE.texture; pm.dispose();
      DZR.applyQ((typeof CFG !== 'undefined' && CFG.q != null) ? CFG.q : 2);
    } catch (e) { console.warn('DZR.post', e); }
  };
  // qualidade gráfica: Alta = reflexos do céu + sombras suaves; Média/Baixa = mais leve
  DZR.applyQ = function (q) {
    const hi = q >= 2, env = hi ? DZR.envTex || null : null;
    if (sc.environment !== env) { sc.environment = env; sc.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    sc.traverse(o => { if (o.isHemisphereLight && !o.userData.dzLobby) o.intensity = hi ? .45 : .75; });
    ren.shadowMap.type = hi ? T.PCFSoftShadowMap : T.PCFShadowMap;
    const ms = hi ? 2048 : 1024; sun.shadow.mapSize.set(ms, ms); sun.shadow.radius = hi ? 2.5 : 1;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  };
  DZR.waterMat = function (base) {
    const nm = new T.TextureLoader().load(ASSET.water); nm.wrapS = nm.wrapT = T.RepeatWrapping; nm.repeat.set(6, 6);
    base.normalMap = nm; base.normalScale = new T.Vector2(.35, .35); base.roughness = .06; base.metalness = .1; base.color = lin(0x24607f); base.opacity = .9;
    DZR.water.push(nm); return base;
  };

  /* =====================================================================
     PERSONAGEM REALISTA
     ===================================================================== */
  let TPL = null;           // modelo base calibrado
  const _m = new T.Matrix4(), _m2 = new T.Matrix4(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3();
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3(), _e = new T.Vector3();
  const SPINE = ['Spine', 'Spine1', 'Spine2'];
  const MAPPED = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm', 'RightUpLeg', 'RightLeg', 'LeftUpLeg', 'LeftLeg'];
  const PALETTE = [0xffffff, 0xc8d0b0, 0xb9b2a0, 0xa9b4bd, 0xd8c9a8, 0x9fae9a, 0xc0b0a0];

  function bname(o) { return o.name.replace(/^mixamorig[:_]?/, ''); }
  function boneMap(root) { const B = {}; root.traverse(o => { if (o.isBone) B[bname(o)] = o; }); return B; }
  function wq(o) { o.matrixWorld.decompose(_p, _q, _s); return _q.clone(); }
  function wp(o) { return new T.Vector3().setFromMatrixPosition(o.matrixWorld); }

  function calibrate(scene) {
    // o modelo original olha para -Z; o jogo usa +Z como frente
    const wrap = new T.Group(); wrap.rotation.y = Math.PI; wrap.add(scene); wrap.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(scene), h = box.max.y - box.min.y || 1;
    const B = boneMap(scene);
    // escala: quadril a ~0.97 m (mesma altura do esqueleto do jogo)
    const hipY = wp(B.Hips).y - box.min.y, s = .97 / (hipY || h * .53);
    wrap.scale.setScalar(s); wrap.position.y = -box.min.y * s; wrap.updateMatrixWorld(true);
    const rot = (bn, r) => { const b = B[bn]; if (!b) return; const pa = wq(b.parent), na = r.clone().multiply(wq(b)); b.quaternion.copy(pa.invert().multiply(na)); wrap.updateMatrixWorld(true); };
    const aim = (bn, cn, dir) => { const b = B[bn], c = B[cn]; if (!b || !c) return; const v = wp(c).sub(wp(b)).normalize(); rot(bn, new T.Quaternion().setFromUnitVectors(v, dir)); };
    const DN = V(0, -1, 0);
    // pose de repouso igual à do esqueleto do jogo: braços e pernas retos para baixo
    for (const s_ of ['Left', 'Right']) {
      const out = V((s_ === 'Right' ? -1 : 1) * .14, -1, 0).normalize(); // braço levemente afastado do corpo
      aim(s_ + 'Arm', s_ + 'ForeArm', out); aim(s_ + 'ForeArm', s_ + 'Hand', DN);
      if (B[s_ + 'HandMiddle1']) aim(s_ + 'Hand', s_ + 'HandMiddle1', DN);
      aim(s_ + 'UpLeg', s_ + 'Leg', DN); aim(s_ + 'Leg', s_ + 'Foot', DN);
    }
    // postura: cabeça e tronco um pouco para a frente (a pose original olha para cima)
    rot('Neck', new T.Quaternion().setFromAxisAngle(V(1, 0, 0), .2));
    rot('Spine1', new T.Quaternion().setFromAxisAngle(V(1, 0, 0), .06));
    // dedos levemente fechados (segurando a arma)
    for (const s_ of ['Left', 'Right']) {
      const sg = s_ === 'Right' ? 1 : -1;
      for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) rot(s_ + 'Hand' + f + k, new T.Quaternion().setFromAxisAngle(V(0, 0, 1), sg * (k === 1 ? .7 : .8)));
      for (let k = 1; k <= 3; k++) rot(s_ + 'HandThumb' + k, new T.Quaternion().setFromAxisAngle(V(0, 0, 1), sg * .25));
    }
    wrap.updateMatrixWorld(true);
    const D = { s, oy: wrap.position.y, Q0: {}, L0: {}, hips0: wp(B.Hips), hipsParentInv: new T.Matrix4().copy(B.Hips.parent.matrixWorld).invert(), hipsParentQ: wq(B.Hips.parent) };
    for (const k in B) { D.Q0[k] = wq(B[k]); D.L0[k] = B[k].quaternion.clone(); }
    D.armLen = {};
    for (const s_ of ['Left', 'Right']) D.armLen[s_] = [wp(B[s_ + 'ForeArm']).distanceTo(wp(B[s_ + 'Arm'])), wp(B[s_ + 'Hand']).distanceTo(wp(B[s_ + 'ForeArm']))];
    wrap.remove(scene);
    return D;
  }

  function load() {
    if (!window.THREE || !T.GLTFLoader || !ASSET.soldier.startsWith('data:')) return;
    try {
      new T.GLTFLoader().parse(b64ab(ASSET.soldier), '', g => {
        const scene = g.scene; scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) { o.material.envMapIntensity = .8; } } });
        TPL = { scene, D: calibrate(scene) }; DZR.ready = true;
        for (const r of DZR.rigs) attach(r);
      }, e => console.warn('soldier.glb', e));
    } catch (e) { console.warn('DZR.load', e); }
  }

  function attach(rig) {
    if (rig.av || !TPL) return;
    const scn = T.SkeletonUtils.clone(TPL.scene), B = boneMap(scn), D = TPL.D;
    for (const k in B) B[k].quaternion.copy(D.L0[k]);
    const inner = new T.Group(); inner.rotation.y = Math.PI; inner.scale.setScalar(D.s); inner.position.y = D.oy; inner.add(scn);
    const root = new T.Group(); root.scale.set(-1, 1, 1); root.add(inner); // espelho: arma na mão direita
    const meshes = [];
    scn.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); meshes.push(o); } });
    rig.pl.add(root);
    rig.av = { root, inner, B, meshes, tint: -1, near: false };
    root.visible = false;
  }

  DZR.reg = function (rig, lo, CM) {
    rig.CM = CM; rig.lo = lo; rig.pm = [];
    rig.pl.traverse(o => { if (o.isMesh) rig.pm.push(o); });
    rig.seed = Math.floor(Math.random() * PALETTE.length);
    DZR.rigs.push(rig); hook();
    if (TPL) attach(rig);
  };

  // pose do segmento procedural no espaço do avatar (espelhado em X)
  function jq(rig, j, out) { _m.multiplyMatrices(rig.inv, j.matrixWorld); _m.decompose(_p, out, _s); out.set(out.x, -out.y, -out.z, out.w); return out; }
  function jp(rig, j, lx, ly, lz, out) { out.set(lx, ly, lz).applyMatrix4(j.matrixWorld).applyMatrix4(rig.inv); out.x = -out.x; return out; }

  const QH = new T.Quaternion(), QT = new T.Quaternion(), QHd = new T.Quaternion(), QA = {}, QW = {};
  function ikArm(rig, side, j) {
    const B = rig.av.B, D = TPL.D, arm = B[side + 'Arm'], fa = B[side + 'ForeArm'], hd = B[side + 'Hand'];
    if (!arm || !fa || !hd) return;
    // alvo: mão do esqueleto procedural (pegada da arma)
    // peso do IK: mão à frente do tronco = segurando algo
    const gl = _e.set(0, -.31, 0).applyMatrix4(j.el.matrixWorld); rig.tor.worldToLocal(gl);
    const w = Math.max(0, Math.min(1, (gl.z - .06) / .14)); if (w <= .01) return;
    const grip = jp(rig, j.el, 0, -.31, 0, _a), elb = jp(rig, j.el, 0, 0, 0, _b);
    const dir = _c.copy(grip).sub(elb); const dl = dir.length(); if (dl > 1e-4) dir.multiplyScalar(1 / dl);
    const T_ = grip.addScaledVector(dir, -.07);
    // posições atuais do braço do avatar (espaço do avatar)
    const toA = v => { v.applyMatrix4(rig.ainv); return v; };
    const S = toA(_d.setFromMatrixPosition(arm.matrixWorld)), E = toA(new T.Vector3().setFromMatrixPosition(fa.matrixWorld)), H = toA(new T.Vector3().setFromMatrixPosition(hd.matrixWorld));
    const L1 = D.armLen[side][0], L2 = D.armLen[side][1];
    const st = new T.Vector3().subVectors(T_, S); let d = st.length(); if (d < 1e-4) return; st.multiplyScalar(1 / d);
    d = Math.min(d, (L1 + L2) * .999); d = Math.max(d, Math.abs(L1 - L2) + .01);
    const pole = new T.Vector3().subVectors(E, S); pole.addScaledVector(st, -pole.dot(st)); if (pole.lengthSq() < 1e-6) pole.set(0, 0, -1); pole.normalize();
    const ca = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))), sa = Math.sqrt(1 - ca * ca);
    const E2 = new T.Vector3().copy(S).addScaledVector(st, ca * L1).addScaledVector(pole, sa * L1);
    const q1 = new T.Quaternion().setFromUnitVectors(_e.subVectors(E, S).normalize(), new T.Vector3().subVectors(E2, S).normalize());
    const H1 = new T.Vector3().subVectors(H, E).applyQuaternion(q1).add(E2);
    const Tc = new T.Vector3().copy(S).addScaledVector(st, d);
    const q2 = new T.Quaternion().setFromUnitVectors(H1.sub(E2).normalize(), Tc.sub(E2).normalize());
    // aplica: novas rotações absolutas
    const I = new T.Quaternion(); if (w < 1) { q1.slerp(I, 1 - w); q2.slerp(I, 1 - w); }
    const armA = q1.clone().multiply(QA[side + 'Arm']), faA = q2.clone().multiply(q1).multiply(QA[side + 'ForeArm']);
    arm.quaternion.copy(QW[side + 'ArmP'].clone().invert().multiply(armA));
    fa.quaternion.copy(armA.clone().invert().multiply(faA));
  }

  function pose(rig) {
    const av = rig.av, B = av.B, D = TPL.D;
    rig.pl.updateMatrixWorld(true);
    rig.inv = (rig.inv || new T.Matrix4()).copy(rig.pl.matrixWorld).invert();
    jq(rig, rig.hips, QH); jq(rig, rig.tor, QT); jq(rig, rig.head, QHd);
    const tgt = {
      Hips: QH, Spine: QH.clone().slerp(QT, .34), Spine1: QH.clone().slerp(QT, .67), Spine2: QT,
      Neck: QT.clone().slerp(QHd, .5), Head: QHd,
      RightArm: jq(rig, rig.aR.sh, new T.Quaternion()), RightForeArm: jq(rig, rig.aR.el, new T.Quaternion()),
      LeftArm: jq(rig, rig.aL.sh, new T.Quaternion()), LeftForeArm: jq(rig, rig.aL.el, new T.Quaternion()),
      RightUpLeg: jq(rig, rig.lg2.th, new T.Quaternion()), RightLeg: jq(rig, rig.lg2.kn, new T.Quaternion()),
      LeftUpLeg: jq(rig, rig.lg1.th, new T.Quaternion()), LeftLeg: jq(rig, rig.lg1.kn, new T.Quaternion())
    };
    // percorre a hierarquia calculando rotações absolutas (espaço do avatar)
    const W = {};
    const walk = (b, parentA) => {
      const k = bname(b); let A;
      if (tgt[k]) A = tgt[k].clone().multiply(D.Q0[k]); else A = parentA.clone().multiply(D.L0[k] || b.quaternion);
      b.quaternion.copy(parentA.clone().invert().multiply(A));
      W[k] = A; if (k === 'RightArm' || k === 'LeftArm') QW[k + 'P'] = parentA.clone();
      if (k === 'RightArm' || k === 'LeftArm' || k === 'RightForeArm' || k === 'LeftForeArm') QA[k] = A;
      for (const c of b.children) if (c.isBone) walk(c, A);
    };
    // quadril: posição
    const hp = jp(rig, rig.hips, 0, 0, 0, new T.Vector3()), off = D.hips0.clone().sub(V(0, .95, 0));
    // D.hips0 está no espaço "wrap" (escala s); o deslocamento do quadril segue a rotação do quadril
    const hpos = hp.add(off.applyQuaternion(QH));
    const hipsTarget = new T.Vector3().copy(hpos);
    // converte para o espaço local do pai do Hips
    const pInv = D.hipsParentInv;
    const local = hipsTarget.clone();
    // espaço do avatar -> espaço "wrap" usado na calibração (mesma origem/escala do grupo inner)
    local.applyMatrix4(pInv);
    B.Hips.position.copy(local);
    walk(B.Hips, D.hipsParentQ);
    // IK das mãos para segurar a arma exatamente onde ela está
    rig.ainv = (rig.ainv || new T.Matrix4()).copy(av.root.matrixWorld).invert();
    if (rig._dist < 30) { av.inner.updateMatrixWorld(true); ikArm(rig, 'Right', rig.aR); ikArm(rig, 'Left', rig.aL); }
  }

  function effVisible(o) { while (o) { if (!o.visible) return false; if (o.isScene) return true; o = o.parent; } return false; }

  let hooked = false;
  function hook() {
    if (hooked || typeof ren === 'undefined') return; hooked = true;
    const _r = ren.render.bind(ren);
    ren.render = function (s_, c_) {
      try { if (c_ === cam) update(); } catch (e) { if (!DZR._err) { DZR._err = 1; console.warn('DZR', e); } }
      return _r(s_, c_);
    };
  }
  /* ---------- grama densa ao redor do jogador ---------- */
  let GF = null;
  const hsh = (a, b, k) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
  function grassField() {
    if (typeof P === 'undefined' || typeof mode === 'undefined' || typeof FP === 'undefined') return;
    const q = (typeof CFG !== 'undefined' && CFG.q != null) ? CFG.q : 2;
    if (!GF) { const m = new T.InstancedMesh(DZR.grassGeo(), mats().grass, 3200); m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(3200 * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); sc.add(m); GF = { m, cx: 1e9, cz: 1e9, q: -1 }; }
    const on = (mode === 'ground' || mode === 'chute' || mode === 'drive') && q > 0 && Math.abs(P.x) < 1200 && Math.abs(P.z) < 1200 && P.y < 30;
    GF.m.visible = on; if (!on) return;
    const cx = Math.round(P.x / 6) * 6, cz = Math.round(P.z / 6) * 6; if (cx === GF.cx && cz === GF.cz && q === GF.q) return; GF.cx = cx; GF.cz = cz; GF.q = q;
    const Rr = q >= 2 ? 30 : 20, M = GF.m, o = new T.Object3D(), col = new T.Color();
    const fp = FP.filter(b => b.x1 > cx - Rr - 2 && b.x0 < cx + Rr + 2 && b.z1 > cz - Rr - 2 && b.z0 < cz + Rr + 2);
    const rd = RDS.filter(r => r[2] > cx - Rr - 8 && r[0] < cx + Rr + 8 && r[3] > cz - Rr - 8 && r[1] < cz + Rr + 8);
    const lk = LK.filter(l => Math.hypot(l.x - cx, l.z - cz) < l.r + Rr + 9), ct = CITIES.filter(c => Math.abs(c.x - cx) < 95 + Rr && Math.abs(c.z - cz) < 95 + Rr);
    const cs = 1.45; let n = 0;
    for (let gx = Math.floor((cx - Rr) / cs); gx <= Math.ceil((cx + Rr) / cs) && n < 3200; gx++) for (let gz = Math.floor((cz - Rr) / cs); gz <= Math.ceil((cz + Rr) / cs) && n < 3200; gz++) {
      const h1 = hsh(gx, gz, 1), h2 = hsh(gx, gz, 2), h3 = hsh(gx, gz, 3);
      if (h3 < .2) continue;
      const x = (gx + h1) * cs, z = (gz + h2) * cs, d = Math.hypot(x - P.x, z - P.z); if (d > Rr) continue;
      if (ct.some(c => Math.abs(x - c.x) < 95 && Math.abs(z - c.z) < 95)) continue;
      if (rd.some(r => x > r[0] - .6 && x < r[2] + .6 && z > r[1] - .6 && z < r[3] + .6)) continue;
      if (fp.some(b => x > b.x0 - .8 && x < b.x1 + .8 && z > b.z0 - .8 && z < b.z1 + .8)) continue;
      if (lk.some(l => Math.hypot(x - l.x, z - l.z) < l.r + 7.5)) continue;
      let gy = 0; try { gy = GY(x, z, .5); } catch (e) { } if (gy > .05) continue;
      const fade = Math.min(1, (Rr - d) / 6), sc_ = (.75 + h3 * .7) * fade;
      o.position.set(x, 0, z); o.rotation.set(0, h1 * 6.283, 0); o.scale.set(sc_ * (1 + h2 * .4), sc_ * (.8 + h1 * .6), sc_); o.updateMatrix();
      M.setMatrixAt(n, o.matrix); const k = .8 + h2 * .3; col.setRGB(k, k * (.95 + h1 * .1), k * (.75 + h3 * .2)); M.setColorAt(n, col); n++;
    }
    M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  let lastT = 0;
  function update() {
    const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    for (const nm of DZR.water) { nm.offset.x += dt * .012; nm.offset.y += dt * .007; }
    try { grassField(); } catch (e) { if (!DZR._gerr) { DZR._gerr = 1; console.warn('grass', e); } }
    if (!TPL) return;
    const q = (typeof CFG !== 'undefined' && CFG.q != null) ? CFG.q : 2, lod = q === 0 ? 30 : q === 1 ? 50 : DZR.lod;
    const cp = cam.position;
    for (let i = DZR.rigs.length - 1; i >= 0; i--) {
      const rig = DZR.rigs[i]; if (!rig.av) attach(rig); const av = rig.av; if (!av) continue;
      const vis = effVisible(rig.pl);
      if (!vis) { if (!rig.pl.parent && rig.dead_) { DZR.rigs.splice(i, 1); } continue; }
      rig.pl.getWorldPosition(_a); const dist = rig._dist = _a.distanceTo(cp);
      const near = dist < lod;
      if (near !== av.near) { av.near = near; av.root.visible = near; for (const m of rig.pm) m.visible = !near; }
      if (!near) continue;
      // cor da roupa (skins)
      const CM = rig.CM, own = CM && CM.ol && CM.ol.color, tk = own ? CM.ol.color.getHex() : rig.seed;
      if (tk !== av.tint) {
        av.tint = tk; let c;
        if (own) { c = CM.ol.color.clone().convertLinearToSRGB(); c.lerp(new T.Color(0xffffff), .15); c.convertSRGBToLinear(); }
        else c = lin(PALETTE[rig.seed]);
        for (const m of av.meshes) if (m.material && m.material.color && !/visor/i.test(m.name)) m.material.color.copy(c);
      }
      pose(rig);
    }
  }
  DZR.update = update;

  // inicia o carregamento assim que o THREE estiver pronto
  load();
})();

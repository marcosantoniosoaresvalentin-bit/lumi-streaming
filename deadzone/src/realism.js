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
     RELEVO: morros e montanhas fora das cidades, estradas e construções
     ===================================================================== */
  window.TERH = window.TERH || function () { return 0; };
  DZR.terrain = function (spots) {
    const S = 12, N = 201, O = -1200, D = new Float32Array(N * N).fill(1e6);
    const idx = (i, j) => j * N + i, cl = v => Math.max(0, Math.min(N - 1, v));
    const mark = (x0, z0, x1, z1) => { for (let j = cl(Math.floor((z0 - O) / S)); j <= cl(Math.ceil((z1 - O) / S)); j++) for (let i = cl(Math.floor((x0 - O) / S)); i <= cl(Math.ceil((x1 - O) / S)); i++) D[idx(i, j)] = 0; };
    const circ = (x, z, r) => mark(x - r, z - r, x + r, z + r);
    try { for (const r of RDS) mark(r[0] - 4, r[1] - 4, r[2] + 4, r[3] + 4); } catch (e) { }
    try { for (const b of FP) mark(b.x0 - 6, b.z0 - 6, b.x1 + 6, b.z1 + 6); } catch (e) { }
    try { for (const c of CITIES) mark(c.x - 110, c.z - 110, c.x + 110, c.z + 110); } catch (e) { }
    try { for (const l of LK) circ(l.x, l.z, l.r + 14); } catch (e) { }
    for (const s of spots || []) circ(s[0], s[1], 85);
    // transformada de distância (chanfro, 2 passadas)
    const d1 = S, d2 = S * 1.4142;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { let v = D[idx(i, j)]; if (i > 0) v = Math.min(v, D[idx(i - 1, j)] + d1); if (j > 0) { v = Math.min(v, D[idx(i, j - 1)] + d1); if (i > 0) v = Math.min(v, D[idx(i - 1, j - 1)] + d2); if (i < N - 1) v = Math.min(v, D[idx(i + 1, j - 1)] + d2); } D[idx(i, j)] = v; }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { let v = D[idx(i, j)]; if (i < N - 1) v = Math.min(v, D[idx(i + 1, j)] + d1); if (j < N - 1) { v = Math.min(v, D[idx(i, j + 1)] + d1); if (i < N - 1) v = Math.min(v, D[idx(i + 1, j + 1)] + d2); if (i > 0) v = Math.min(v, D[idx(i - 1, j + 1)] + d2); } D[idx(i, j)] = v; }
    // ruído suave (value noise) em várias escalas
    const hh = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf); return (hh(xi, zi) * (1 - u) + hh(xi + 1, zi) * u) * (1 - w) + (hh(xi, zi + 1) * (1 - u) + hh(xi + 1, zi + 1) * u) * w; };
    const fbm = (x, z) => vn(x, z) * .55 + vn(x * 2.1 + 5.2, z * 2.1 + 1.3) * .28 + vn(x * 4.3 + 9.1, z * 4.3 + 3.7) * .17;
    const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = O + i * S, z = O + j * S;
      let h = Math.pow(fbm(x / 380 + 3.1, z / 380 + 7.7), 1.6) * 46 + (fbm(x / 110, z / 110) - .35) * 7;
      const e = Math.max(Math.abs(x), Math.abs(z)), edge = ss(820, 1180, e);
      const ridge = 1 - Math.abs(fbm(x / 160 + 11, z / 160 + 4) * 2 - 1);
      h += edge * (35 + ridge * 45);
      H[idx(i, j)] = Math.max(0, h) * ss(10, 70, D[idx(i, j)]);
    }
    DZR.H = H;
    // mesma triangulação do PlaneGeometry: altura idêntica à malha
    const TERH = function (x, z) {
      let fx = (x - O) / S, fz = (z - O) / S; if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return 0;
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = H[idx(i, j)], b = H[idx(i, j + 1)], c = H[idx(i + 1, j + 1)], d = H[idx(i + 1, j)];
      return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
    };
    window.TERH = TERH;
    // malha do chão com relevo
    try {
      const g = new T.PlaneGeometry(2400, 2400, N - 1, N - 1), P = g.attributes.position;
      for (let k = 0; k < P.count; k++) { const x = P.getX(k), z = -P.getY(k); P.setZ(k, TERH(x, z)); }
      g.computeVertexNormals(); g.computeBoundingSphere();
      gr.geometry.dispose(); gr.geometry = g;
    } catch (e) { console.warn('terreno', e); }
    return TERH;
  };

  /* =====================================================================
     JANELAS DE VIDRO QUEBRÁVEIS
     ===================================================================== */
  const DZW = window.DZW = { cells: new Map(), panes: [], broken: 0 };
  const wkey = (x, z) => Math.floor(x / 32) * 4096 + Math.floor(z / 32);
  let GLM = null;
  DZW.mat = () => GLM || (GLM = new T.MeshStandardMaterial({ color: lin(0x8fb4c8), metalness: .2, roughness: .05, transparent: true, opacity: .42, depthWrite: false, side: T.DoubleSide, envMapIntensity: 1.6 }));
  // g: grupo do prédio (já posicionado); list: [px,py,pz,ry] locais; tamanho da vidraça 1.2 x 1.1
  DZW.add = function (g, list, W_, H_) {
    if (!list.length) return;
    const hw = (W_ || 1.2) / 2, hh_ = (H_ || 1.1) / 2;
    g.updateMatrix(); g.updateMatrixWorld(true);
    const pos = new Float32Array(list.length * 18), nrm = new Float32Array(list.length * 18), m = g.matrixWorld;
    const v = new T.Vector3(), ax = new T.Vector3(), nn = new T.Vector3(), c = new T.Vector3();
    list.forEach((w, k) => {
      const [px, py, pz, ry] = w, cs = Math.cos(ry), sn = Math.sin(ry);
      const lu = [cs, 0, -sn], ln = [sn, 0, cs];
      const Q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      Q.forEach((q, i) => { const o = k * 18 + i * 3; pos[o] = px + lu[0] * hw * q[0]; pos[o + 1] = py + hh_ * q[1]; pos[o + 2] = pz + lu[2] * hw * q[0]; nrm[o] = ln[0]; nrm[o + 1] = 0; nrm[o + 2] = ln[2]; });
      c.set(px, py, pz).applyMatrix4(m); ax.set(lu[0], 0, lu[2]).transformDirection(m); nn.set(ln[0], 0, ln[2]).transformDirection(m);
      const P_ = { c: c.clone(), u: ax.clone(), n: nn.clone(), hw, hh: hh_, k, br: 0 };
      DZW.panes.push(P_); const key = wkey(c.x, c.z); let a = DZW.cells.get(key); if (!a) DZW.cells.set(key, a = []); a.push(P_); list[k] = P_;
    });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nrm, 3)); geo.computeBoundingSphere();
    const me = new T.Mesh(geo, DZW.mat()); me.renderOrder = 2; g.add(me);
    for (const p of list) p.mesh = me;
  };
  function near3(x, z, f) { const i0 = Math.floor(x / 32), j0 = Math.floor(z / 32); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = DZW.cells.get(i * 4096 + j); if (a) for (const p of a) if (f(p)) return true; } return false; }
  // ponto dentro do vão de uma janela quebrada (tiro e visão passam)
  DZW.hole = function (x, y, z) {
    if (!DZW.broken) return false;
    const a = DZW.cells.get(wkey(x, z)); if (!a) return false;
    for (const p of a) { if (!p.br) continue; const dx = x - p.c.x, dy = y - p.c.y, dz = z - p.c.z; if (Math.abs(dy) < p.hh + .05 && Math.abs(dx * p.u.x + dz * p.u.z) < p.hw + .05 && Math.abs(dx * p.n.x + dz * p.n.z) < .5) return true; }
    return false;
  };
  function rayPane(p, o, d) {
    const dn = d.x * p.n.x + d.y * p.n.y + d.z * p.n.z; if (Math.abs(dn) < 1e-4) return 1e9;
    const t = ((p.c.x - o.x) * p.n.x + (p.c.y - o.y) * p.n.y + (p.c.z - o.z) * p.n.z) / dn; if (t <= 0) return 1e9;
    const hx = o.x + d.x * t - p.c.x, hy = o.y + d.y * t - p.c.y, hz = o.z + d.z * t - p.c.z;
    return (Math.abs(hy) < p.hh && Math.abs(hx * p.u.x + hz * p.u.z) < p.hw) ? t : 1e9;
  }
  // tiro: quebra a primeira vidraça intacta no caminho (até "maxT")
  DZW.shoot = function (o, d, maxT) {
    const seen = new Set(); let best = null, bt = Math.min(maxT, 400);
    for (let s = 0; s <= bt + 32; s += 16) {
      const x = o.x + d.x * s, z = o.z + d.z * s;
      near3(x, z, p => { if (p.br || seen.has(p)) return false; seen.add(p); const t = rayPane(p, o, d); if (t < bt) { bt = t; best = p; } return false; });
      if (best && s > bt + 16) break;
    }
    if (!best) return 0;
    const q = Math.max(0, bt - .45);
    try { if (typeof blocked === 'function' && blocked(o.x, o.y, o.z, o.x + d.x * q, o.y + d.y * q, o.z + d.z * q)) return 0; } catch (e) { }
    DZW.breakPane(best, d); return 1;
  };
  DZW.blast = function (x, y, z, r) {
    near3(x, z, p => { if (!p.br && Math.hypot(p.c.x - x, p.c.y - y, p.c.z - z) < r) DZW.breakPane(p, new T.Vector3(p.c.x - x, p.c.y - y, p.c.z - z).normalize()); return false; });
  };
  DZW.breakPane = function (p, dir) {
    if (p.br) return; p.br = 1; DZW.broken++;
    const a = p.mesh.geometry.attributes.position; for (let i = 0; i < 6; i++) a.setXYZ(p.k * 6 + i, 0, -50, 0); a.needsUpdate = true;
    spawnShards(p, dir);
    try { const dd = (typeof P !== 'undefined') ? Math.hypot(p.c.x - P.x, p.c.z - P.z) : 0, k = Math.max(0, 1 - dd / 60); if (k > 0) { sfx(5200, .4 * k, .25, 0); sfx(2600, .3 * k, .55, 0); } } catch (e) { }
  };
  // estilhaços de vidro
  let SHM = null; const SH = [];
  function spawnShards(p, dir) {
    if (!SHM) {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([-.06, -.05, 0, .07, -.04, 0, 0, .08, 0], 3)); g.computeVertexNormals();
      SHM = new T.InstancedMesh(g, new T.MeshStandardMaterial({ color: lin(0xcfe6f2), metalness: .3, roughness: .05, transparent: true, opacity: .8, side: T.DoubleSide }), 400);
      SHM.count = 0; SHM.frustumCulled = false; SHM.instanceMatrix.setUsage(T.DynamicDrawUsage); sc.add(SHM);
    }
    const side = (dir && (dir.x * p.n.x + dir.z * p.n.z) < 0) ? -1 : 1;
    for (let i = 0; i < 18; i++) {
      if (SH.length >= 400) SH.shift();
      const u = (Math.random() * 2 - 1) * p.hw, v = (Math.random() * 2 - 1) * p.hh, sp = 1 + Math.random() * 3;
      SH.push({ x: p.c.x + p.u.x * u, y: p.c.y + v, z: p.c.z + p.u.z * u, vx: p.n.x * side * sp + (Math.random() - .5), vy: Math.random() * 1.5, vz: p.n.z * side * sp + (Math.random() - .5), rx: Math.random() * 6, ry: Math.random() * 6, s: .6 + Math.random() * 1.4, t: 0, gy: null });
    }
  }
  const _o3 = new T.Object3D();
  DZR.shardTick = function (dt) {
    if (!SHM) return; let n = 0;
    for (let i = SH.length - 1; i >= 0; i--) {
      const s = SH[i]; s.t += dt; if (s.t > 6) { SH.splice(i, 1); continue; }
      if (s.gy == null) { let g = 0; try { g = GY(s.x, s.z, s.y); } catch (e) { } s.gy = g; }
      if (s.y > s.gy + .02) { s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.rx += dt * 9; s.ry += dt * 7; if (s.y <= s.gy + .02) { s.y = s.gy + .02; s.vx *= .2; s.vz *= .2; s.rx = Math.PI / 2; } }
    }
    for (const s of SH) { _o3.position.set(s.x, s.y, s.z); _o3.rotation.set(s.rx, s.ry, 0); _o3.scale.setScalar(s.s * (s.t > 5 ? 6 - s.t : 1)); _o3.updateMatrix(); SHM.setMatrixAt(n++, _o3.matrix); }
    SHM.count = n; SHM.instanceMatrix.needsUpdate = true;
  };

  /* =====================================================================
     ILHA FLUTUANTE: rocha orgânica, grama, árvore gigante, pedra e água
     ===================================================================== */
  DZR.islandRock = function (cx, cz, half, topY, depth, seed, holeR) {
    const r = rng(seed), seg = 28, rings = 9, P = [], idxs = [], uv = [];
    // anel do topo (quadrado arredondado) + anéis que afunilam para baixo com ruído
    for (let k = 0; k <= rings; k++) {
      const f = k / rings, y = topY - .2 - Math.pow(f, 1.25) * depth, sc_ = Math.pow(1 - f, .85) * (1 + (k ? (r() - .5) * .08 : 0));
      for (let i = 0; i < seg; i++) {
        const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), m = Math.max(Math.abs(ca), Math.abs(sa)), sq = .55 + .45 / m;
        const ns = k === 0 ? 1.02 : 1 + (r() - .5) * .22, R_ = half * Math.min(sq, 1.38) * sc_ * ns * (k === 0 ? 1 : .98);
        P.push(cx + ca * R_, k === rings ? topY - depth - 6 : y + (k ? (r() - .5) * 1.5 : 0), cz + sa * R_); uv.push(i / seg * 6, f * 4);
      }
    }
    for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) { const a = k * seg + i, b = k * seg + (i + 1) % seg, c = (k + 1) * seg + i, d = (k + 1) * seg + (i + 1) % seg; idxs.push(a, c, b, b, c, d); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idxs); g.computeVertexNormals();
    const tex = mats().rock.map.clone(); tex.needsUpdate = true; tex.repeat.set(1, 1);
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: .08, color: lin(0x9c9284), roughness: .95, side: T.DoubleSide }));
    m.castShadow = false; m.receiveShadow = true;
    // tampa de grama
    let tg;
    if (holeR) { const sh = new T.Shape(); const H2 = half * 1.01; sh.moveTo(-H2, -H2); sh.lineTo(H2, -H2); sh.lineTo(H2, H2); sh.lineTo(-H2, H2); sh.lineTo(-H2, -H2); const ho = new T.Path(); ho.absarc(0, 0, holeR, 0, Math.PI * 2, true); sh.holes.push(ho); tg = new T.ShapeGeometry(sh, 32); const U = tg.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, (U.getX(i) + H2) / (2 * H2), (U.getY(i) + H2) / (2 * H2)); }
    else tg = new T.PlaneGeometry(half * 2.02, half * 2.02, 1, 1);
    const top = new T.Mesh(tg, DZR._islandGrass || (DZR._islandGrass = (() => { const t = imgTex('grass', 6, 6); return new T.MeshStandardMaterial({ map: t, roughness: 1, color: lin(0xd6e0c4) }); })()));
    top.material.map.repeat.set(half / 6, half / 6); top.rotation.x = -Math.PI / 2; top.position.set(cx, topY - .02, cz); top.receiveShadow = true;
    const grp = new T.Group(); grp.add(m, top); return grp;
  };
  // material de pedra/madeira por coordenada do mundo, para as construções de blocos da ilha
  DZR.stoneMat = function () {
    const t = mats().rock.map;
    const m = new T.MeshStandardMaterial({ vertexColors: true, map: t, roughness: .9, metalness: 0 });
    m.onBeforeCompile = s => {
      s.vertexShader = 'varying vec3 vWPos;varying vec3 vWNrm;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;vWNrm=normalize(mat3(modelMatrix)*objectNormal);');
      s.fragmentShader = 'varying vec3 vWPos;varying vec3 vWNrm;\n' + s.fragmentShader.replace('#include <map_fragment>', 'vec3 an=abs(vWNrm);vec2 bu=an.x>an.z?vWPos.zy:vWPos.xy;if(an.y>.7)bu=vWPos.xz;vec4 texelColor=texture2D(map,bu*.35);texelColor=mapTexelToLinear(texelColor);diffuseColor.rgb*=mix(vec3(1.),texelColor.rgb*1.9,.75);');
    };
    return m;
  };
  // cachoeira: faixas que descem
  DZR.fallMat = function () {
    const m = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .75, depthWrite: false });
    const U = { value: 0 }; DZR._fallT = U;
    m.onBeforeCompile = s => {
      s.uniforms.uT = U;
      s.vertexShader = 'varying vec3 vWPos;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;');
      s.fragmentShader = 'uniform float uT;varying vec3 vWPos;\n' + s.fragmentShader.replace('#include <map_fragment>', 'float st=fract((vWPos.y+uT*9.)*.18+sin((vWPos.x+vWPos.z)*3.1)*.3);float fo=smoothstep(.0,.25,st)*smoothstep(1.,.6,st);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),fo*.55);diffuseColor.a*=.55+.45*fo;');
    };
    return m;
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

  // mede a velocidade de deslocamento de cada animação (amplitude do pé / duração)
  function clipSpeeds() {
    const sc_ = TPL.scene, B = boneMap(sc_), D = TPL.D, keep = {};
    for (const k in B) keep[k] = [B[k].quaternion.clone(), B[k].position.clone()];
    const mx = new T.AnimationMixer(sc_), v = new T.Vector3(), h = new T.Vector3();
    for (const nm of ['Walk', 'Run']) {
      const c = TPL.clips[nm]; if (!c) continue; const a = mx.clipAction(c); a.reset().play(); let mn = 1e9, mxv = -1e9;
      for (let i = 0; i <= 40; i++) { mx.setTime(c.duration * i / 40); sc_.updateMatrixWorld(true); v.setFromMatrixPosition(B.LeftFoot.matrixWorld); h.setFromMatrixPosition(B.Hips.matrixWorld); const z = (v.z - h.z) * D.s; mn = Math.min(mn, z); mxv = Math.max(mxv, z); }
      a.stop(); TPL['v' + nm] = Math.max(.6, 2 * (mxv - mn) / c.duration);
    }
    mx.stopAllAction(); mx.uncacheRoot(sc_);
    for (const k in B) { B[k].quaternion.copy(keep[k][0]); B[k].position.copy(keep[k][1]); }
    TPL.vWalk = TPL.vWalk || 1.4; TPL.vRun = TPL.vRun || 4;
  }

  function load() {
    if (!window.THREE || !T.GLTFLoader || !ASSET.soldier.startsWith('data:')) return;
    try {
      new T.GLTFLoader().parse(b64ab(ASSET.soldier), '', g => {
        const scene = g.scene; scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) { o.material.envMapIntensity = .8; } } });
        TPL = { scene, D: calibrate(scene), clips: {} }; DZR.ready = true;
        for (const c of g.animations || []) TPL.clips[c.name] = c;
        try { clipSpeeds(); } catch (e) { console.warn('clipSpeeds', e); }
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
    rig.av = { root, inner, B, meshes, tint: -1, near: false, lw: 0, ph: Math.random() };
    if (TPL.clips.Idle && TPL.clips.Walk && TPL.clips.Run) {
      const mx = new T.AnimationMixer(scn), act = {};
      for (const k of ['Idle', 'Walk', 'Run']) { const a = mx.clipAction(TPL.clips[k]); a.play(); a.setEffectiveWeight(0); act[k] = a; }
      act.Walk.timeScale = act.Run.timeScale = 0; act.Idle.time = Math.random() * TPL.clips.Idle.duration;
      rig.av.mx = mx; rig.av.act = act;
    }
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

  const LOWER = new Set(['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']);
  const UPPER = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
  const ALLB = new Set([...LOWER, ...UPPER]);
  // animações de captura de movimento (parado/andar/correr) misturadas à pose do jogo
  function loco(rig, dt) {
    const av = rig.av, L = rig.loco; if (!av.mx) return null;
    av.lw += (((L && L.w) || 0) - av.lw) * Math.min(1, dt * 8); if (av.lw < .01) return null;
    const sp = Math.max(0, L.sp || 0), A = av.act, cW = TPL.clips.Walk, cR = TPL.clips.Run;
    const wi = Math.max(0, 1 - sp / .7), wr = Math.max(0, Math.min(1, (sp - 2.3) / 1.6)), ww = Math.max(0, 1 - wi - wr);
    A.Idle.setEffectiveWeight(wi); A.Walk.setEffectiveWeight(ww); A.Run.setEffectiveWeight(wr);
    // fase única para andar/correr (os pés não "patinam" na transição)
    const rate = (ww * sp / TPL.vWalk / cW.duration + wr * sp / TPL.vRun / cR.duration) / Math.max(.001, ww + wr);
    av.ph = (av.ph + dt * rate * ((L.fw != null && L.fw < -.3) ? -1 : 1) + 1) % 1;
    A.Walk.time = av.ph * cW.duration; A.Run.time = av.ph * cR.duration;
    av.mx.update(dt);
    const set = L.arm ? LOWER : ALLB, sv = {};
    for (const k of set) if (av.B[k]) sv[k] = av.B[k].quaternion.clone();
    sv._hp = av.B.Hips.position.clone(); sv._set = set; sv._w = av.lw;
    return sv;
  }

  function pose(rig, dt) {
    const sv = loco(rig, dt || .016);
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
      if (sv && sv[k]) A.slerp(parentA.clone().multiply(sv[k]), sv._w);
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
    B.Hips.position.copy(local); if (sv) B.Hips.position.lerp(sv._hp, sv._w);
    walk(B.Hips, D.hipsParentQ);
    // IK das mãos para segurar a arma exatamente onde ela está
    rig.ainv = (rig.ainv || new T.Matrix4()).copy(av.root.matrixWorld).invert();
    if (rig._dist < 30 && !(sv && !rig.loco.arm && sv._w > .5)) { av.inner.updateMatrixWorld(true); ikArm(rig, 'Right', rig.aR); ikArm(rig, 'Left', rig.aL); }
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
      let gy = 0; const th = TERH(x, z); try { gy = GY(x, z, th + .5); } catch (e) { } if (gy > th + .05) continue;
      const fade = Math.min(1, (Rr - d) / 6), sc_ = (.75 + h3 * .7) * fade;
      o.position.set(x, TERH(x, z), z); o.rotation.set(0, h1 * 6.283, 0); o.scale.set(sc_ * (1 + h2 * .4), sc_ * (.8 + h1 * .6), sc_); o.updateMatrix();
      M.setMatrixAt(n, o.matrix); const k = .8 + h2 * .3; col.setRGB(k, k * (.95 + h1 * .1), k * (.75 + h3 * .2)); M.setColorAt(n, col); n++;
    }
    M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  let lastT = 0;
  function update() {
    const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    for (const nm of DZR.water) { nm.offset.x += dt * .012; nm.offset.y += dt * .007; }
    try { DZR.shardTick(dt); if (DZR._fallT) DZR._fallT.value += dt; if (typeof mode !== 'undefined' && mode !== 'plane' && mode !== 'lobby' && cam.position.y < TERH(cam.position.x, cam.position.z) + .45) cam.position.y = TERH(cam.position.x, cam.position.z) + .45; } catch (e) { }
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
      pose(rig, dt);
    }
  }
  DZR.update = update;

  // inicia o carregamento assim que o THREE estiver pronto
  load();
})();

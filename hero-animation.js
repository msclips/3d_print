// ===== HERO 3D PRINTING CANVAS ANIMATION =====
// Per-page themed scenes selected via <body data-hero="home|services|materials">.
// Shared engine: background, ambient glows, grid floor, particles, connection
// lines, projection math. Only the centerpiece scene switches per page.
(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const PAGE = document.body.dataset.hero || 'home';

  let W, H;
  function resize() {
    const hero = canvas.parentElement;
    W = canvas.width = hero.offsetWidth;
    H = canvas.height = hero.offsetHeight;
    syncParticleCount();
  }
  window.addEventListener('resize', resize);

  function isMobile() {
    return W < 768;
  }

  // ----- CONFIGURATION -----
  const CONFIG = {
    bgTop: '#0a0a1a',
    bgBot: '#1a1035',
    gridColor: 'rgba(91,108,255,0.08)',
    gridHighlight: 'rgba(91,108,255,0.18)',
    wireColor: 'rgba(91,108,255,0.6)',
    wireFill: 'rgba(91,108,255,0.03)',
    layerColor: 'rgba(0,194,168,0.5)',
    laserColor: 'rgba(124,77,255,0.9)',
    particleColors: [
      'rgba(91,108,255,0.6)',
      'rgba(124,77,255,0.5)',
      'rgba(0,194,168,0.5)',
      'rgba(255,255,255,0.3)'
    ],
    cubeSize: 100,
    rotationSpeed: 0.003,
    layerSpeed: 0.004,
    numParticles: 60,
    numParticlesMobile: 30,
    numGridLines: 16,
    // grid center (fraction of W) per scene so the floor sits under the action
    gridCx: { home: 0.28, services: 0.5, materials: 0.5 }
  };

  // Palette triplets for per-object tinting
  const BLUE = '91,108,255';
  const PURPLE = '124,77,255';
  const TEAL = '0,194,168';
  const SOFT = '225,232,255';

  // ----- 3D MATH UTILITIES -----
  let angle = 0; // shared slow turntable rotation (grid + home cube)

  function project(x, y, z, cx, cy, scale, rot) {
    const a = rot === undefined ? angle : rot;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Rotate around Y axis
    const rx = x * cos - z * sin;
    const rz = x * sin + z * cos;
    // Slight tilt on X axis
    const tilt = 0.3;
    const ry = y * Math.cos(tilt) - rz * Math.sin(tilt);
    const rz2 = y * Math.sin(tilt) + rz * Math.cos(tilt);
    // Simple perspective
    const perspective = 600;
    const factor = perspective / (perspective + rz2);
    return {
      x: cx + rx * factor * scale,
      y: cy + ry * factor * scale,
      z: rz2
    };
  }

  // ----- GRID FLOOR -----
  function drawGrid(time) {
    const cx = W * (CONFIG.gridCx[PAGE] || 0.28);
    const cy = H * 0.62;
    const scale = Math.min(W, H) * 0.003;
    const size = 180;
    const lines = CONFIG.numGridLines;
    const step = (size * 2) / lines;
    const pulse = Math.sin(time * 0.001) * 0.5 + 0.5;

    ctx.lineWidth = 0.5;

    for (let i = 0; i <= lines; i++) {
      const offset = -size + i * step;
      const p1 = project(offset, 0, -size, cx, cy, scale);
      const p2 = project(offset, 0, size, cx, cy, scale);
      const highlight = (i % 4 === 0);
      ctx.strokeStyle = highlight ? CONFIG.gridHighlight : CONFIG.gridColor;
      ctx.globalAlpha = highlight ? 0.5 + pulse * 0.3 : 0.4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const p3 = project(-size, 0, offset, cx, cy, scale);
      const p4 = project(size, 0, offset, cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ----- SMALL SHARED HELPERS -----
  function drawLabel(text, x, y, rgb, alpha, size) {
    ctx.font = '600 ' + (size || 11) + 'px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(' + rgb + ',' + (alpha === undefined ? 0.5 : alpha) + ')';
    ctx.fillText(text, x, y);
  }

  function glowDot(x, y, r, rgb, strength) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',' + strength + ')');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Project a wireframe mesh and return screen points + bounding box
  function projectMesh(mesh, cx, cy, scale, rot) {
    const pts = new Array(mesh.verts.length);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.verts.length; i++) {
      const v = mesh.verts[i];
      const p = project(v[0], v[1], v[2], cx, cy, scale, rot);
      pts[i] = p;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { pts, minX, maxX, minY, maxY };
  }

  function strokeEdges(mesh, pts) {
    ctx.beginPath();
    for (let i = 0; i < mesh.edges.length; i++) {
      const e = mesh.edges[i];
      ctx.moveTo(pts[e[0]].x, pts[e[0]].y);
      ctx.lineTo(pts[e[1]].x, pts[e[1]].y);
    }
    ctx.stroke();
  }

  // ----- MESH BUILDERS (services page centerpieces) -----
  function meshMerge(target, part) {
    const base = target.verts.length;
    part.verts.forEach(v => target.verts.push(v));
    part.edges.forEach(e => target.edges.push([e[0] + base, e[1] + base]));
    return target;
  }

  // Axis-aligned box: y from yBottom (ground, +y is down) up to yBottom - h
  function makeBox(w, h, d, yBottom) {
    const x = w / 2, z = d / 2;
    const yb = yBottom, yt = yBottom - h;
    return {
      verts: [
        [-x, yb, -z], [x, yb, -z], [x, yb, z], [-x, yb, z],
        [-x, yt, -z], [x, yt, -z], [x, yt, z], [-x, yt, z]
      ],
      edges: [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ]
    };
  }

  // Horizontal rectangle outline at height y
  function makeRectLoop(w, d, y) {
    const x = w / 2, z = d / 2;
    return {
      verts: [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0]]
    };
  }

  // Gear lying flat (axis vertical) with hub boss — spins on the turntable
  function makeGear() {
    const mesh = { verts: [], edges: [] };
    const teeth = 8, R = 48, r = 36, thick = 22;
    const profile = [];
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * Math.PI * 2;
      profile.push([a - 0.16, r], [a - 0.10, R], [a + 0.10, R], [a + 0.16, r]);
    }
    const n = profile.length;
    // rim: profile ring at ground (y=0) and top (y=-thick)
    profile.forEach(p => mesh.verts.push([Math.cos(p[0]) * p[1], 0, Math.sin(p[0]) * p[1]]));
    profile.forEach(p => mesh.verts.push([Math.cos(p[0]) * p[1], -thick, Math.sin(p[0]) * p[1]]));
    for (let i = 0; i < n; i++) {
      mesh.edges.push([i, (i + 1) % n]);
      mesh.edges.push([n + i, n + ((i + 1) % n)]);
      if (i % 2 === 0) mesh.edges.push([i, n + i]);
    }
    // hub boss (octagon, taller than rim)
    const hubBase = mesh.verts.length;
    const hubR = 15, hubH = 34, sides = 8;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      mesh.verts.push([Math.cos(a) * hubR, 0, Math.sin(a) * hubR]);
    }
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      mesh.verts.push([Math.cos(a) * hubR, -hubH, Math.sin(a) * hubR]);
    }
    for (let i = 0; i < sides; i++) {
      mesh.edges.push([hubBase + i, hubBase + ((i + 1) % sides)]);
      mesh.edges.push([hubBase + sides + i, hubBase + sides + ((i + 1) % sides)]);
      if (i % 2 === 0) mesh.edges.push([hubBase + i, hubBase + sides + i]);
    }
    return mesh;
  }

  // Simple two-tier building with antenna and floor lines
  function makeBuilding() {
    const mesh = { verts: [], edges: [] };
    meshMerge(mesh, makeBox(44, 46, 36, 0));
    meshMerge(mesh, makeBox(28, 34, 24, -46));
    meshMerge(mesh, makeRectLoop(44, 36, -16));
    meshMerge(mesh, makeRectLoop(44, 36, -31));
    meshMerge(mesh, makeRectLoop(28, 24, -62));
    // antenna
    const a = mesh.verts.length;
    mesh.verts.push([0, -80, 0], [0, -97, 0]);
    mesh.edges.push([a, a + 1]);
    return mesh;
  }

  // Extruded L-bracket with a mounting slot
  function makeBracket() {
    const mesh = { verts: [], edges: [] };
    const profile = [
      [-20, 0], [20, 0], [20, -13], [-4, -13], [-4, -46], [-20, -46]
    ];
    const dz = 12, n = profile.length;
    profile.forEach(p => mesh.verts.push([p[0], p[1], dz]));
    profile.forEach(p => mesh.verts.push([p[0], p[1], -dz]));
    for (let i = 0; i < n; i++) {
      mesh.edges.push([i, (i + 1) % n]);
      mesh.edges.push([n + i, n + ((i + 1) % n)]);
      mesh.edges.push([i, n + i]);
    }
    // slot on the vertical arm
    const s = mesh.verts.length;
    mesh.verts.push([-16, -24, dz], [-8, -24, dz], [-8, -38, dz], [-16, -38, dz]);
    mesh.edges.push([s, s + 1], [s + 1, s + 2], [s + 2, s + 3], [s + 3, s]);
    return mesh;
  }

  // Electronics enclosure: low box, lid seam, vent slots
  function makeEnclosure() {
    const mesh = { verts: [], edges: [] };
    meshMerge(mesh, makeBox(52, 20, 34, 0));
    meshMerge(mesh, makeRectLoop(52, 34, -14));
    // vents on the lid
    for (let i = -1; i <= 1; i++) {
      const v = mesh.verts.length;
      mesh.verts.push([i * 11, -20, -9], [i * 11, -20, 9]);
      mesh.edges.push([v, v + 1]);
    }
    return mesh;
  }

  // ================================================================
  // SCENE: HOME — wireframe cube + FDM layers (left), SLA laser (right)
  // ================================================================
  function drawWireframeCube(time) {
    const cx = W * 0.28;
    const cy = H * 0.42;
    const s = CONFIG.cubeSize;
    const scale = Math.min(W, H) * 0.003;

    const verts = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]
    ];
    const projected = verts.map(v => project(v[0], v[1], v[2], cx, cy, scale));
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    ctx.fillStyle = CONFIG.wireFill;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    ctx.lineTo(projected[1].x, projected[1].y);
    ctx.lineTo(projected[2].x, projected[2].y);
    ctx.lineTo(projected[3].x, projected[3].y);
    ctx.closePath();
    ctx.fill();

    const pulse = Math.sin(time * 0.002) * 0.2 + 0.8;
    ctx.strokeStyle = CONFIG.wireColor;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = pulse;
    edges.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(projected[a].x, projected[a].y);
      ctx.lineTo(projected[b].x, projected[b].y);
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(91,108,255,0.9)';
    projected.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    return { cx, cy, scale, s };
  }

  let layerProgress = 0;

  function drawFDMLayers(time, cubeInfo) {
    const { cx, cy, scale, s } = cubeInfo;
    layerProgress = (layerProgress + CONFIG.layerSpeed) % 1;

    const numLayers = 12;
    const currentLayer = Math.floor(layerProgress * numLayers);

    for (let i = 0; i <= currentLayer; i++) {
      const t = i / numLayers;
      const y = s - t * 2 * s;
      const alpha = i === currentLayer ? 0.9 : 0.15 + t * 0.2;

      ctx.strokeStyle = CONFIG.layerColor;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = i === currentLayer ? 2 : 0.8;

      const p1 = project(-s, y, -s, cx, cy, scale);
      const p2 = project(s, y, -s, cx, cy, scale);
      const p3 = project(s, y, s, cx, cy, scale);
      const p4 = project(-s, y, s, cx, cy, scale);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.stroke();

      if (i === currentLayer) {
        ctx.fillStyle = 'rgba(0,194,168,0.06)';
        ctx.fill();
      }
    }

    // Active nozzle indicator on current layer
    const nozzleT = (time * 0.002) % 1;
    const ny = s - (currentLayer / numLayers) * 2 * s;
    const nx = -s + nozzleT * 2 * s;
    const nozzlePos = project(nx, ny, -s * 0.3, cx, cy, scale);
    ctx.globalAlpha = 1;
    glowDot(nozzlePos.x, nozzlePos.y, 15, TEAL, 0.8);
    ctx.globalAlpha = 1;
  }

  function drawSLALaser(time) {
    const cx = W * 0.72;
    const cy = H * 0.38;
    const scale = Math.min(W, H) * 0.0025;
    const radius = 80;

    ctx.strokeStyle = 'rgba(124,77,255,0.2)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    const poolP = project(0, 0, 0, cx, cy + 60, scale);
    ctx.beginPath();
    ctx.ellipse(poolP.x, poolP.y, radius * scale * 0.8, radius * scale * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(124,77,255,0.04)';
    ctx.fill();

    const laserAngle = time * 0.003;
    const lx = Math.cos(laserAngle) * radius * 0.6;
    const lz = Math.sin(laserAngle) * radius * 0.6;
    const laserHit = project(lx, 0, lz, cx, cy + 60, scale);
    const laserSource = { x: cx, y: cy - 80 };

    ctx.strokeStyle = CONFIG.laserColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(laserSource.x, laserSource.y);
    ctx.lineTo(laserHit.x, laserHit.y);
    ctx.stroke();

    ctx.globalAlpha = 1;
    const laserGrad = ctx.createRadialGradient(laserHit.x, laserHit.y, 0, laserHit.x, laserHit.y, 20);
    laserGrad.addColorStop(0, 'rgba(124,77,255,0.9)');
    laserGrad.addColorStop(0.3, 'rgba(124,77,255,0.3)');
    laserGrad.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = laserGrad;
    ctx.beginPath();
    ctx.arc(laserHit.x, laserHit.y, 20, 0, Math.PI * 2);
    ctx.fill();

    glowDot(laserSource.x, laserSource.y, 12, PURPLE, 0.8);

    // Cured resin build-up
    const layers = 8;
    const buildProgress = ((time * 0.0005) % 1);
    const visibleLayers = Math.floor(buildProgress * layers);
    for (let i = 0; i < visibleLayers; i++) {
      const layerY = -i * 8;
      const layerAlpha = 0.1 + (i / layers) * 0.15;
      ctx.strokeStyle = 'rgba(124,77,255,0.3)';
      ctx.fillStyle = 'rgba(124,77,255,' + (layerAlpha * 0.3) + ')';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.5;
      const lp = project(0, layerY, 0, cx, cy + 60, scale);
      ctx.beginPath();
      ctx.ellipse(lp.x, lp.y, radius * scale * 0.5, radius * scale * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    drawLabel('SLA', cx, cy + 120, PURPLE);
  }

  function drawHomeScene(time) {
    const cubeInfo = drawWireframeCube(time);
    drawFDMLayers(time, cubeInfo);
    drawLabel('FDM', W * 0.28, H * 0.78, TEAL);
    // On phones the right half sits behind the hero copy — skip the SLA rig
    if (!isMobile()) drawSLALaser(time);
  }

  // ================================================================
  // SCENE: SERVICES — four industry parts printing one after another
  // ================================================================
  const SERVICE_OBJECTS = [
    { label: 'MECHANICAL', rgb: BLUE, mesh: makeGear(), speed: 0.0040, phase: 0.0 },
    { label: 'ARCHITECTURE', rgb: PURPLE, mesh: makeBuilding(), speed: 0.0030, phase: 1.2 },
    { label: 'AUTOMOTIVE', rgb: TEAL, mesh: makeBracket(), speed: 0.0036, phase: 2.4 },
    { label: 'ELECTRONICS', rgb: SOFT, mesh: makeEnclosure(), speed: 0.0033, phase: 3.6 }
  ];

  function drawServicesScene(time) {
    const mob = isMobile();
    const objs = mob ? SERVICE_OBJECTS.slice(0, 2) : SERVICE_OBJECTS;
    const xs = mob ? [0.28, 0.72] : [0.14, 0.38, 0.62, 0.86];
    const cy = H * 0.46;
    const scale = Math.min(W, H) * 0.0026;

    // Build cycle: each part prints in turn, all hold, then reset
    const CYCLE = 16000;
    const t = (time % CYCLE) / CYCLE;
    const slot = 0.78 / objs.length;

    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const cx = W * xs[i];
      const rot = time * o.speed + o.phase;
      const m = projectMesh(o.mesh, cx, cy, scale, rot);
      const progress = Math.max(0, Math.min(1, (t - i * slot) / (slot * 0.8)));
      const buildY = m.maxY - progress * (m.maxY - m.minY);

      // Ghost of the part still to be printed
      ctx.strokeStyle = 'rgba(' + o.rgb + ',0.10)';
      ctx.lineWidth = 1;
      strokeEdges(o.mesh, m.pts);

      // Printed portion, clipped from the bottom up
      if (progress > 0) {
        const pulse = Math.sin(time * 0.002 + i) * 0.15 + 0.75;
        ctx.save();
        ctx.beginPath();
        ctx.rect(m.minX - 24, buildY, (m.maxX - m.minX) + 48, (m.maxY - buildY) + 24);
        ctx.clip();
        ctx.strokeStyle = 'rgba(' + o.rgb + ',' + pulse.toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        strokeEdges(o.mesh, m.pts);
        ctx.fillStyle = 'rgba(' + o.rgb + ',0.9)';
        for (let k = 0; k < m.pts.length; k += 2) {
          ctx.beginPath();
          ctx.arc(m.pts[k].x, m.pts[k].y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Active print scan line + travelling hot end
      if (progress > 0 && progress < 1) {
        ctx.strokeStyle = 'rgba(' + TEAL + ',0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m.minX - 12, buildY);
        ctx.lineTo(m.maxX + 12, buildY);
        ctx.stroke();
        const nt = (time * 0.0025 + i * 0.37) % 1;
        const nx = m.minX + nt * (m.maxX - m.minX);
        glowDot(nx, buildY, 12, TEAL, 0.8);
      }

      drawLabel(o.label, cx, cy + 64 * scale + 26, o.rgb);
    }
  }

  // ================================================================
  // SCENE: MATERIALS — spool unwinding filament into a nozzle that
  // prints a layered test part; material name + colour cycle
  // ================================================================
  const MATERIALS = [
    { name: 'PLA', rgb: TEAL },
    { name: 'ABS', rgb: PURPLE },
    { name: 'PETG', rgb: BLUE },
    { name: 'TPU', rgb: SOFT }
  ];

  function bezierPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    return { x: x, y: y };
  }

  function drawMaterialsScene(time) {
    const mob = isMobile();
    const PHASE = 5200;
    const idx = Math.floor(time / PHASE) % MATERIALS.length;
    const mat = MATERIALS[idx];
    const pt = (time % PHASE) / PHASE;
    const progress = Math.min(1, pt / 0.75);
    const labelAlpha = pt < 0.08 ? pt / 0.08 : pt > 0.92 ? (1 - pt) / 0.08 : 1;

    const dim = Math.min(W, H);
    const sx = W * (mob ? 0.20 : 0.24);
    const sy = H * 0.40;
    const R = dim * 0.085;

    // --- Spool (rotating as it unwinds) ---
    ctx.lineWidth = 1.2;
    // back flange for depth
    ctx.strokeStyle = 'rgba(' + BLUE + ',0.18)';
    ctx.beginPath();
    ctx.ellipse(sx + R * 0.16, sy, R, R * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    // front flange
    ctx.strokeStyle = 'rgba(' + BLUE + ',0.55)';
    ctx.beginPath();
    ctx.arc(sx, sy, R, 0, Math.PI * 2);
    ctx.stroke();
    // hub
    ctx.strokeStyle = 'rgba(' + BLUE + ',0.4)';
    ctx.beginPath();
    ctx.arc(sx, sy, R * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    // wound filament (shrinks slightly as the phase advances)
    const coilOuter = R * (0.82 - pt * 0.08);
    const coils = mob ? 3 : 4;
    for (let i = 0; i < coils; i++) {
      const cr = R * 0.3 + (coilOuter - R * 0.3) * ((i + 1) / coils);
      ctx.strokeStyle = 'rgba(' + mat.rgb + ',' + (0.16 + i * 0.08) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, cr, 0, Math.PI * 2);
      ctx.stroke();
    }
    // rotating spokes
    const spin = -time * 0.0035;
    ctx.strokeStyle = 'rgba(' + BLUE + ',0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = spin + (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * R * 0.22, sy + Math.sin(a) * R * 0.22);
      ctx.lineTo(sx + Math.cos(a) * R * 0.94, sy + Math.sin(a) * R * 0.94);
      ctx.stroke();
    }
    drawLabel('FILAMENT', sx, sy + R + 24, BLUE);

    // --- Test part geometry (tapered layered cylinder) ---
    const ox = W * (mob ? 0.70 : 0.62);
    const numLayers = mob ? 8 : 11;
    const layerH = dim * 0.012;
    const baseR = dim * 0.055;
    const oy = H * 0.62; // part base sits on the grid line
    const partTop = oy - numLayers * layerH;

    // --- Nozzle above the part ---
    const nozY = partTop - dim * 0.055;
    const nozW = dim * 0.026;
    ctx.strokeStyle = 'rgba(' + BLUE + ',0.55)';
    ctx.fillStyle = 'rgba(' + BLUE + ',0.10)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(ox - nozW, nozY - nozW * 1.5, nozW * 2, nozW * 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox - nozW, nozY - nozW * 0.3);
    ctx.lineTo(ox + nozW, nozY - nozW * 0.3);
    ctx.lineTo(ox + nozW * 0.3, nozY + nozW * 0.55);
    ctx.lineTo(ox - nozW * 0.3, nozY + nozW * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- Filament path: spool top → sagging curve → nozzle inlet ---
    const p0 = { x: sx, y: sy - coilOuter };
    const p3 = { x: ox, y: nozY - nozW * 1.5 };
    const sag = Math.sin(time * 0.0011) * 9;
    const p1 = { x: sx + (ox - sx) * 0.32, y: sy - R - dim * 0.10 + sag };
    const p2 = { x: ox - (ox - sx) * 0.22, y: nozY - dim * 0.11 - sag };
    ctx.strokeStyle = 'rgba(' + mat.rgb + ',0.55)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();
    // beads flowing along the filament
    const beads = mob ? 4 : 6;
    for (let i = 0; i < beads; i++) {
      const bt = (time * 0.00012 + i / beads) % 1;
      const b = bezierPoint(p0, p1, p2, p3, bt);
      ctx.fillStyle = 'rgba(' + mat.rgb + ',0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Layered part building up ---
    const visible = Math.floor(progress * numLayers);
    for (let i = 0; i < visible; i++) {
      const taper = 1 - 0.3 * Math.pow(i / numLayers, 2);
      const ry = oy - i * layerH;
      const rx = baseR * taper;
      ctx.strokeStyle = 'rgba(' + mat.rgb + ',' + (0.25 + (i / numLayers) * 0.2) + ')';
      ctx.fillStyle = 'rgba(' + mat.rgb + ',0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ox, ry, rx, rx * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // current layer being extruded
    if (progress < 1 && visible < numLayers) {
      const taper = 1 - 0.3 * Math.pow(visible / numLayers, 2);
      const ry = oy - visible * layerH;
      const rx = baseR * taper;
      ctx.strokeStyle = 'rgba(' + mat.rgb + ',0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ox, ry, rx, rx * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();

      // extrusion strand from nozzle tip down to the layer
      ctx.strokeStyle = 'rgba(' + mat.rgb + ',0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox, nozY + nozW * 0.55);
      ctx.lineTo(ox, ry - rx * 0.32);
      ctx.stroke();
      glowDot(ox, nozY + nozW * 0.55, 11, mat.rgb, 0.85);
      // deposition point orbiting the layer rim
      const da = time * 0.006;
      glowDot(ox + Math.cos(da) * rx, ry + Math.sin(da) * rx * 0.32, 8, mat.rgb, 0.7);
    }

    // material label under the part, fading between phases
    drawLabel(mat.name, ox, oy + 34, mat.rgb, 0.85 * labelAlpha, 14);
    drawLabel('MATERIAL', ox, oy + 52, SOFT, 0.35 * labelAlpha);
  }

  // ================================================================
  // SHARED: particles, connections, ambient glows
  // ================================================================
  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.size = Math.random() * 2.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3 - 0.15;
      this.color = CONFIG.particleColors[Math.floor(Math.random() * CONFIG.particleColors.length)];
      this.life = Math.random();
      this.maxLife = 0.6 + Math.random() * 0.4;
      this.fadeSpeed = 0.0005 + Math.random() * 0.001;
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.life += this.fadeSpeed;

      if (this.life > this.maxLife || this.x < 0 || this.x > W || this.y < 0 || this.y > H) {
        this.reset();
        this.y = H + 10;
        this.life = 0;
      }
    }

    draw() {
      const alpha = this.life < 0.1
        ? this.life / 0.1
        : this.life > this.maxLife - 0.1
          ? (this.maxLife - this.life) / 0.1
          : 1;

      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();

      if (this.size > 1.5) {
        const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 4);
        grd.addColorStop(0, this.color);
        grd.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha * 0.15;
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }
  }

  const particles = [];
  function syncParticleCount() {
    const target = isMobile() ? CONFIG.numParticlesMobile : CONFIG.numParticles;
    while (particles.length < target) particles.push(new Particle());
    if (particles.length > target) particles.length = target;
  }

  function drawConnections() {
    const maxDist = 100;
    ctx.lineWidth = 0.3;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.15;
          ctx.strokeStyle = 'rgba(91,108,255,' + alpha + ')';
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  function drawAmbientGlow(time) {
    const g1r = 200 + Math.sin(time * 0.001) * 30;
    const grd1 = ctx.createRadialGradient(W * 0.15, H * 0.75, 0, W * 0.15, H * 0.75, g1r);
    grd1.addColorStop(0, 'rgba(91,108,255,0.08)');
    grd1.addColorStop(1, 'rgba(91,108,255,0)');
    ctx.fillStyle = grd1;
    ctx.beginPath();
    ctx.arc(W * 0.15, H * 0.75, g1r, 0, Math.PI * 2);
    ctx.fill();

    const g2r = 180 + Math.cos(time * 0.0012) * 25;
    const grd2 = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, g2r);
    grd2.addColorStop(0, 'rgba(124,77,255,0.07)');
    grd2.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = grd2;
    ctx.beginPath();
    ctx.arc(W * 0.8, H * 0.2, g2r, 0, Math.PI * 2);
    ctx.fill();

    const g3r = 250 + Math.sin(time * 0.0008) * 40;
    const grd3 = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, g3r);
    grd3.addColorStop(0, 'rgba(0,194,168,0.03)');
    grd3.addColorStop(1, 'rgba(0,194,168,0)');
    ctx.fillStyle = grd3;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, g3r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ----- SCENE REGISTRY + MAIN LOOP -----
  const scenes = {
    home: drawHomeScene,
    services: drawServicesScene,
    materials: drawMaterialsScene
  };
  const drawScene = scenes[PAGE] || scenes.home;

  resize();

  function animate(time) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, CONFIG.bgTop);
    bgGrad.addColorStop(0.5, '#110e2a');
    bgGrad.addColorStop(1, CONFIG.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    drawAmbientGlow(time);

    angle += CONFIG.rotationSpeed;

    drawGrid(time);
    drawScene(time);

    particles.forEach(p => {
      p.update();
      p.draw();
    });
    drawConnections();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();

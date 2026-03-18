// ===== HERO 3D PRINTING CANVAS ANIMATION =====
(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  function resize() {
    const hero = canvas.parentElement;
    W = canvas.width = hero.offsetWidth;
    H = canvas.height = hero.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

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
    laserGlow: 'rgba(124,77,255,0.15)',
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
    numGridLines: 16
  };

  // ----- 3D MATH UTILITIES -----
  let angle = 0;

  function project(x, y, z, cx, cy, scale) {
    // Simple isometric-ish projection
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
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
    const cx = W * 0.28;
    const cy = H * 0.62;
    const scale = Math.min(W, H) * 0.003;
    const size = 180;
    const lines = CONFIG.numGridLines;
    const step = (size * 2) / lines;
    const pulse = Math.sin(time * 0.001) * 0.5 + 0.5;

    ctx.lineWidth = 0.5;

    for (let i = 0; i <= lines; i++) {
      const offset = -size + i * step;
      // Lines along Z
      const p1 = project(offset, 0, -size, cx, cy, scale);
      const p2 = project(offset, 0, size, cx, cy, scale);
      const highlight = (i % 4 === 0);
      ctx.strokeStyle = highlight
        ? CONFIG.gridHighlight
        : CONFIG.gridColor;
      ctx.globalAlpha = highlight ? 0.5 + pulse * 0.3 : 0.4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Lines along X
      const p3 = project(-size, 0, offset, cx, cy, scale);
      const p4 = project(size, 0, offset, cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ----- WIREFRAME CUBE -----
  function drawWireframeCube(time) {
    const cx = W * 0.28;
    const cy = H * 0.42;
    const s = CONFIG.cubeSize;
    const scale = Math.min(W, H) * 0.003;

    // Cube vertices
    const verts = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]
    ];

    const projected = verts.map(v => project(v[0], v[1], v[2], cx, cy, scale));

    // Edges
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    // Draw faces with subtle fill
    ctx.fillStyle = CONFIG.wireFill;
    // Front face
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    ctx.lineTo(projected[1].x, projected[1].y);
    ctx.lineTo(projected[2].x, projected[2].y);
    ctx.lineTo(projected[3].x, projected[3].y);
    ctx.closePath();
    ctx.fill();

    // Draw edges
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

    // Draw vertices as dots
    ctx.fillStyle = 'rgba(91,108,255,0.9)';
    projected.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    return { cx, cy, scale, s };
  }

  // ----- FDM LAYER LINES -----
  let layerProgress = 0;

  function drawFDMLayers(time, cubeInfo) {
    const { cx, cy, scale, s } = cubeInfo;
    layerProgress = (layerProgress + CONFIG.layerSpeed) % 1;

    const numLayers = 12;
    const currentLayer = Math.floor(layerProgress * numLayers);

    for (let i = 0; i <= currentLayer; i++) {
      const t = i / numLayers;
      const y = s - t * 2 * s; // bottom to top
      const alpha = i === currentLayer ? 0.9 : 0.15 + t * 0.2;

      ctx.strokeStyle = CONFIG.layerColor;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = i === currentLayer ? 2 : 0.8;

      // Draw horizontal layer line across cube
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

      // Fill current layer with glow
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

    // Nozzle glow
    const grad = ctx.createRadialGradient(
      nozzlePos.x, nozzlePos.y, 0,
      nozzlePos.x, nozzlePos.y, 15
    );
    grad.addColorStop(0, 'rgba(0,194,168,0.8)');
    grad.addColorStop(1, 'rgba(0,194,168,0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(nozzlePos.x, nozzlePos.y, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  // ----- SLA LASER EFFECT -----
  function drawSLALaser(time) {
    const cx = W * 0.72;
    const cy = H * 0.38;
    const scale = Math.min(W, H) * 0.0025;
    const radius = 80;

    // Draw resin pool (circle)
    ctx.strokeStyle = 'rgba(124,77,255,0.2)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    // Platform circle
    const poolP = project(0, 0, 0, cx, cy + 60, scale);
    ctx.beginPath();
    ctx.ellipse(poolP.x, poolP.y, radius * scale * 0.8, radius * scale * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle pool fill
    ctx.fillStyle = 'rgba(124,77,255,0.04)';
    ctx.fill();

    // Laser beam sweeping
    const laserAngle = time * 0.003;
    const lx = Math.cos(laserAngle) * radius * 0.6;
    const lz = Math.sin(laserAngle) * radius * 0.6;
    const laserHit = project(lx, 0, lz, cx, cy + 60, scale);

    // Laser source (from above)
    const laserSource = { x: cx, y: cy - 80 };

    // Laser beam line
    ctx.strokeStyle = CONFIG.laserColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(laserSource.x, laserSource.y);
    ctx.lineTo(laserHit.x, laserHit.y);
    ctx.stroke();

    // Laser hit glow
    const laserGrad = ctx.createRadialGradient(
      laserHit.x, laserHit.y, 0,
      laserHit.x, laserHit.y, 20
    );
    laserGrad.addColorStop(0, 'rgba(124,77,255,0.9)');
    laserGrad.addColorStop(0.3, 'rgba(124,77,255,0.3)');
    laserGrad.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = laserGrad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(laserHit.x, laserHit.y, 20, 0, Math.PI * 2);
    ctx.fill();

    // Laser source glow
    const srcGrad = ctx.createRadialGradient(
      laserSource.x, laserSource.y, 0,
      laserSource.x, laserSource.y, 12
    );
    srcGrad.addColorStop(0, 'rgba(124,77,255,0.8)');
    srcGrad.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = srcGrad;
    ctx.beginPath();
    ctx.arc(laserSource.x, laserSource.y, 12, 0, Math.PI * 2);
    ctx.fill();

    // Build-up layers (cured resin)
    const layers = 8;
    const buildProgress = ((time * 0.0005) % 1);
    const visibleLayers = Math.floor(buildProgress * layers);

    for (let i = 0; i < visibleLayers; i++) {
      const layerY = -i * 8;
      const layerAlpha = 0.1 + (i / layers) * 0.15;
      ctx.strokeStyle = 'rgba(124,77,255,0.3)';
      ctx.fillStyle = `rgba(124,77,255,${layerAlpha * 0.3})`;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.5;

      const lp = project(0, layerY, 0, cx, cy + 60, scale);
      ctx.beginPath();
      ctx.ellipse(lp.x, lp.y, radius * scale * 0.5, radius * scale * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Labels
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(124,77,255,0.5)';
    ctx.fillText('SLA', cx, cy + 120);
  }

  // Draw FDM label
  function drawFDMLabel() {
    const cx = W * 0.28;
    const cy = H * 0.78;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,194,168,0.5)';
    ctx.fillText('FDM', cx, cy);
  }

  // ----- PARTICLES -----
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

      // Glow
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
  for (let i = 0; i < CONFIG.numParticles; i++) {
    particles.push(new Particle());
  }

  // ----- CONNECTING LINES (between nearby particles) -----
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
          ctx.strokeStyle = `rgba(91,108,255,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  // ----- AMBIENT GLOW ORBS -----
  function drawAmbientGlow(time) {
    // Bottom-left glow
    const g1x = W * 0.15;
    const g1y = H * 0.75;
    const g1r = 200 + Math.sin(time * 0.001) * 30;
    const grd1 = ctx.createRadialGradient(g1x, g1y, 0, g1x, g1y, g1r);
    grd1.addColorStop(0, 'rgba(91,108,255,0.08)');
    grd1.addColorStop(1, 'rgba(91,108,255,0)');
    ctx.fillStyle = grd1;
    ctx.beginPath();
    ctx.arc(g1x, g1y, g1r, 0, Math.PI * 2);
    ctx.fill();

    // Top-right glow
    const g2x = W * 0.8;
    const g2y = H * 0.2;
    const g2r = 180 + Math.cos(time * 0.0012) * 25;
    const grd2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, g2r);
    grd2.addColorStop(0, 'rgba(124,77,255,0.07)');
    grd2.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = grd2;
    ctx.beginPath();
    ctx.arc(g2x, g2y, g2r, 0, Math.PI * 2);
    ctx.fill();

    // Center accent glow
    const g3x = W * 0.5;
    const g3y = H * 0.5;
    const g3r = 250 + Math.sin(time * 0.0008) * 40;
    const grd3 = ctx.createRadialGradient(g3x, g3y, 0, g3x, g3y, g3r);
    grd3.addColorStop(0, 'rgba(0,194,168,0.03)');
    grd3.addColorStop(1, 'rgba(0,194,168,0)');
    ctx.fillStyle = grd3;
    ctx.beginPath();
    ctx.arc(g3x, g3y, g3r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ----- MAIN ANIMATION LOOP -----
  function animate(time) {
    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, CONFIG.bgTop);
    bgGrad.addColorStop(0.5, '#110e2a');
    bgGrad.addColorStop(1, CONFIG.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Ambient glows
    drawAmbientGlow(time);

    // Rotate
    angle += CONFIG.rotationSpeed;

    // Grid floor
    drawGrid(time);

    // Wireframe cube + FDM layers (left side)
    const cubeInfo = drawWireframeCube(time);
    drawFDMLayers(time, cubeInfo);
    drawFDMLabel();

    // SLA laser (right side)
    drawSLALaser(time);

    // Particles
    particles.forEach(p => {
      p.update();
      p.draw();
    });

    // Connections
    drawConnections();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();

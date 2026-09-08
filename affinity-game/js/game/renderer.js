// All canvas drawing: arenas, the hub island, entities, projectiles, turrets,
// ability effects, and the shrinking storm zone. Pure geometric shapes and
// text so the whole game needs zero image assets.

function drawGroundGrid(ctx, camera, canvas, map) {
  ctx.fillStyle = map.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = map.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  const grid = 80;
  const startX = -((camera.x) % grid);
  const startY = -((camera.y) % grid);
  for (let x = startX; x < canvas.width; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = startY; y < canvas.height; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // map border
  ctx.strokeStyle = '#000000aa';
  ctx.lineWidth = 6;
  ctx.strokeRect(-camera.x, -camera.y, map.width, map.height);
}

function drawObstacles(ctx, camera, map) {
  ctx.fillStyle = map.accent;
  ctx.strokeStyle = '#00000055';
  ctx.lineWidth = 2;
  for (const o of map.obstacles) {
    ctx.fillRect(o.x - camera.x, o.y - camera.y, o.w, o.h);
    ctx.strokeRect(o.x - camera.x, o.y - camera.y, o.w, o.h);
  }
}

function worldToScreen(x, y, camera) { return { x: x - camera.x, y: y - camera.y }; }

const TEAM_COLORS = ['#4fd1ff', '#ff5c5c', '#ffd24f', '#9d6bff', '#5cff9e', '#ff8ac8', '#c0c0c0', '#ff9c3f'];

function isVisibleToViewer(entity, viewerTeam) {
  return entity.team === viewerTeam || !entity.isStealthed;
}

function drawEntity(ctx, entity, camera, viewerTeam, isPlayer) {
  if (!entity.alive) return;
  if (!isVisibleToViewer(entity, viewerTeam)) return;
  const p = worldToScreen(entity.x, entity.y, camera);
  const alpha = entity.isStealthed ? 0.35 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  // team ring
  ctx.beginPath();
  ctx.arc(p.x, p.y, entity.radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = TEAM_COLORS[entity.team % TEAM_COLORS.length];
  ctx.lineWidth = isPlayer ? 4 : 2;
  ctx.stroke();

  // body
  ctx.beginPath();
  ctx.arc(p.x, p.y, entity.radius, 0, Math.PI * 2);
  ctx.fillStyle = entity.sheet.color;
  ctx.fill();
  ctx.strokeStyle = entity.sheet.colorDark;
  ctx.lineWidth = 3;
  ctx.stroke();

  // facing indicator
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(entity.facing) * (entity.radius + 10), p.y + Math.sin(entity.facing) * (entity.radius + 10));
  ctx.strokeStyle = '#ffffffcc';
  ctx.lineWidth = 2;
  ctx.stroke();

  // glyph
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(entity.sheet.glyph, p.x, p.y);

  ctx.restore();

  // health / shield bars
  const barW = 44, barH = 5;
  const bx = p.x - barW / 2, by = p.y - entity.radius - 20;
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = entity.hp / entity.maxHp > 0.3 ? '#4fd15a' : '#e05c3b';
  ctx.fillRect(bx, by, barW * Math.max(0, entity.hp / entity.maxHp), barH);
  if (entity.shield > 0) {
    ctx.fillStyle = '#6fc9ff';
    ctx.fillRect(bx, by - 4, barW * Math.min(1, entity.shield / entity.maxShield), 3);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((isPlayer ? 'You — ' : '') + entity.sheet.displayName, p.x, by - 8);
}

function drawProjectiles(ctx, world, camera) {
  for (const pr of world.projectiles) {
    const p = worldToScreen(pr.x, pr.y, camera);
    const speed = Math.hypot(pr.vx, pr.vy) || 1;
    const trailLen = Math.min(34, speed * 0.05);
    ctx.save();
    // motion trail so fast shots read as movement, not a floating dot
    ctx.strokeStyle = pr.color || '#fff';
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = pr.radius * 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - (pr.vx / speed) * trailLen, p.y - (pr.vy / speed) * trailLen);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = pr.color || '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr.radius, 0, Math.PI * 2);
    ctx.fillStyle = pr.color || '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, pr.radius * 0.45), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}

function drawTurrets(ctx, world, camera) {
  for (const t of world.turrets) {
    const p = worldToScreen(t.x, t.y, camera);
    ctx.beginPath();
    ctx.arc(p.x, p.y, t.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffaa33';
    ctx.fill();
    ctx.strokeStyle = '#7a4713';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawEffects(ctx, world, camera) {
  for (const fx of world.effects) {
    const t = (world.time - fx.createdAt) / fx.life;
    const alpha = Math.max(0, 1 - t);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (fx.type === 'blast') {
      const p = worldToScreen(fx.x, fx.y, camera);
      const r = fx.radius * (fx.ring ? 1 : (0.35 + t * 0.65));
      ctx.shadowColor = fx.color || '#fff';
      ctx.shadowBlur = 18;
      if (!fx.ring) {
        ctx.globalAlpha = alpha * 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fx.color || '#fff';
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = fx.color || '#fff';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (fx.type === 'slash') {
      // Arc sweeps through the swing so the attack reads as a motion.
      const p = worldToScreen(fx.x, fx.y, camera);
      const reach = fx.reach || (fx.big ? 46 : 34);
      const sweep = 1.5;
      const mid = fx.angle - sweep / 2 + sweep * t;
      ctx.strokeStyle = fx.color || '#fff';
      ctx.lineWidth = fx.big ? 8 : 6;
      ctx.lineCap = 'round';
      ctx.shadowColor = fx.color || '#fff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, reach * 0.85, mid - 0.45, mid + 0.45);
      ctx.stroke();
    } else if (fx.type === 'muzzle') {
      const p = worldToScreen(fx.x, fx.y, camera);
      const len = (fx.big ? 40 : 26) * (1 - t * 0.4);
      ctx.fillStyle = fx.color || '#fff';
      ctx.shadowColor = fx.color || '#fff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(fx.angle) * len, p.y + Math.sin(fx.angle) * len);
      ctx.lineTo(p.x + Math.cos(fx.angle + 2.4) * 12, p.y + Math.sin(fx.angle + 2.4) * 12);
      ctx.lineTo(p.x + Math.cos(fx.angle - 2.4) * 12, p.y + Math.sin(fx.angle - 2.4) * 12);
      ctx.closePath();
      ctx.fill();
    } else if (fx.type === 'castring' || fx.type === 'spawnring') {
      const p = worldToScreen(fx.x, fx.y, camera);
      const r = (fx.radius || 46) * (0.25 + t * 0.9);
      ctx.strokeStyle = fx.color || '#fff';
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.shadowColor = fx.color || '#fff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.type === 'hitspark') {
      const p = worldToScreen(fx.x, fx.y, camera);
      ctx.strokeStyle = fx.color || '#fff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + fx.createdAt;
        const inner = 8 + t * 12, outer = inner + 9 * (1 - t);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner);
        ctx.lineTo(p.x + Math.cos(a) * outer, p.y + Math.sin(a) * outer);
        ctx.stroke();
      }
    } else if (fx.type === 'beam') {
      const a = worldToScreen(fx.x1, fx.y1, camera), b = worldToScreen(fx.x2, fx.y2, camera);
      ctx.strokeStyle = fx.color || '#fff';
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.shadowColor = fx.color || '#fff';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (fx.type === 'casttext') {
      const p = worldToScreen(fx.x, fx.y, camera);
      ctx.font = fx.big ? 'bold 20px sans-serif' : 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000000cc';
      ctx.fillStyle = fx.color || '#fff';
      const y = p.y - t * 26;
      ctx.strokeText(fx.text, p.x, y);
      ctx.fillText(fx.text, p.x, y);
    } else if (fx.type === 'damagetext') {
      const p = worldToScreen(fx.x, fx.y, camera);
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000000cc';
      ctx.fillStyle = fx.color || '#fff';
      const y = p.y - t * 34;
      ctx.strokeText(fx.text, p.x, y);
      ctx.fillText(fx.text, p.x, y);
    } else if (fx.type === 'shieldpop') {
      const p = worldToScreen(fx.x, fx.y, camera);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24 + t * 10, 0, Math.PI * 2);
      ctx.strokeStyle = fx.color || '#6fc9ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (fx.type === 'heal') {
      const p = worldToScreen(fx.x, fx.y, camera);
      ctx.strokeStyle = '#7CFF9E';
      ctx.lineWidth = fx.big ? 4 : 3;
      const s = fx.big ? 14 : 10;
      ctx.beginPath(); ctx.moveTo(p.x - s, p.y - (1 - t) * 10); ctx.lineTo(p.x + s, p.y - (1 - t) * 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - s - (1 - t) * 10); ctx.lineTo(p.x, p.y + s - (1 - t) * 10); ctx.stroke();
    } else if (fx.type === 'dashtrail') {
      const a = worldToScreen(fx.x1, fx.y1, camera), b = worldToScreen(fx.x2, fx.y2, camera);
      ctx.strokeStyle = fx.color || '#fff';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (fx.type === 'taunt') {
      const p = worldToScreen(fx.x, fx.y, camera);
      ctx.fillStyle = '#ffde59';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', p.x, p.y - 40 - t * 20);
    }
    ctx.restore();
  }
}

function drawZone(ctx, zone, camera, canvas) {
  if (!zone) return;
  const cx = zone.cx - camera.x, cy = zone.cy - camera.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.arc(cx, cy, zone.radius, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(120,20,20,0.28)';
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(cx, cy, zone.radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ff6b4f';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function renderMatch(ctx, canvas, engine) {
  const { camera, map, world, playerEntity } = engine;
  drawGroundGrid(ctx, camera, canvas, map);
  drawObstacles(ctx, camera, map);
  drawZone(ctx, engine.zone, camera, canvas);
  drawProjectiles(ctx, world, camera);
  drawTurrets(ctx, world, camera);
  for (const e of world.entities) drawEntity(ctx, e, camera, playerEntity.team, e === playerEntity);
  drawEffects(ctx, world, camera);
}

// ---------------- Hub rendering ----------------
function drawDecoration(ctx, d, camera) {
  const p = worldToScreen(d.x, d.y, camera);
  if (d.type === 'tree') {
    ctx.fillStyle = '#5c3a1e'; ctx.fillRect(p.x - 4, p.y - 6, 8, 24);
    ctx.beginPath(); ctx.arc(p.x, p.y - 20, 22, 0, Math.PI * 2); ctx.fillStyle = '#2e7d3d'; ctx.fill();
  } else if (d.type === 'statue') {
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(p.x - 14, p.y - 40, 28, 50);
    ctx.beginPath(); ctx.arc(p.x, p.y - 50, 12, 0, Math.PI * 2); ctx.fill();
  } else if (d.type === 'flag') {
    ctx.fillStyle = '#7a6a4a'; ctx.fillRect(p.x - 2, p.y - 50, 4, 50);
    ctx.fillStyle = '#e0a03b'; ctx.beginPath(); ctx.moveTo(p.x + 2, p.y - 50); ctx.lineTo(p.x + 34, p.y - 40); ctx.lineTo(p.x + 2, p.y - 30); ctx.fill();
  } else if (d.type === 'rock') {
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.moveTo(p.x - 16, p.y + 8); ctx.lineTo(p.x - 8, p.y - 10); ctx.lineTo(p.x + 10, p.y - 8); ctx.lineTo(p.x + 16, p.y + 8); ctx.closePath();
    ctx.fill();
  }
}

function drawPortal(ctx, portal, camera, time, near) {
  const p = worldToScreen(portal.x, portal.y, camera);
  const pulse = 34 + Math.sin(time * 3) * 4;
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
  ctx.fillStyle = portal.color + '55';
  ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
  ctx.strokeStyle = portal.color; ctx.lineWidth = near ? 5 : 3; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(portal.label, p.x, p.y - 42);
  if (near) { ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffde59'; ctx.fillText('Press E / tap E to enter', p.x, p.y + 46); }
  ctx.restore();
}

function drawHubPlayer(ctx, hub, camera) {
  const pl = hub.player;
  const p = worldToScreen(pl.x, pl.y, camera);
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y, pl.radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, pl.radius, 0, Math.PI * 2);
  ctx.fillStyle = pl.sheet.color; ctx.fill();
  ctx.strokeStyle = pl.sheet.colorDark; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pl.sheet.glyph, p.x, p.y);
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(pl.sheet.displayName, p.x, p.y - pl.radius - 14);
}

function renderHub(ctx, canvas, hub) {
  drawGroundGrid(ctx, hub.camera, canvas, hub.map);
  drawObstacles(ctx, hub.camera, hub.map);
  for (const d of hub.map.decorations) drawDecoration(ctx, d, hub.camera);
  for (const portal of hub.map.portals) drawPortal(ctx, portal, hub.camera, hub.time, hub.nearPortal === portal);
  drawHubPlayer(ctx, hub, hub.camera);
}

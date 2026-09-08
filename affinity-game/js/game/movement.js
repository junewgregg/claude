// Shared movement/collision helpers used by both the player controller and AI.

function resolveCircleRect(x, y, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - closestX, dy = y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius || distSq === 0) return { x, y };
  const d = Math.sqrt(distSq) || 0.001;
  const push = radius - d;
  return { x: x + (dx / d) * push, y: y + (dy / d) * push };
}

function clampToMapBounds(x, y, world) {
  const m = world.map;
  return { x: Math.max(20, Math.min(m.width - 20, x)), y: Math.max(20, Math.min(m.height - 20, y)) };
}

// dirX/dirY: desired movement direction, need not be normalized.
function applyMovement(entity, dirX, dirY, dt, world) {
  if (!entity.alive || entity.isStunned) return;
  const len = Math.hypot(dirX, dirY);
  if (len > 0.001) { dirX /= len; dirY /= len; } else { dirX = 0; dirY = 0; }
  const speed = entity.sheet.stats.speed * entity.speedMultiplier;
  let nx = entity.x + dirX * speed * dt;
  let ny = entity.y + dirY * speed * dt;
  for (const obs of world.map.obstacles) {
    const r = resolveCircleRect(nx, ny, entity.radius, obs);
    nx = r.x; ny = r.y;
  }
  const clamped = clampToMapBounds(nx, ny, world);
  entity.x = clamped.x; entity.y = clamped.y;
  if (len > 0.001) entity.facing = Math.atan2(dirY, dirX);
}

// Simple line-of-path obstacle check: is the straight segment from (x,y) toward
// (tx,ty) about to slam into an obstacle within `lookahead` units?
function pathBlocked(x, y, tx, ty, lookahead, world) {
  const ang = Math.atan2(ty - y, tx - x);
  const px = x + Math.cos(ang) * lookahead, py = y + Math.sin(ang) * lookahead;
  for (const obs of world.map.obstacles) {
    if (px > obs.x - 15 && px < obs.x + obs.w + 15 && py > obs.y - 15 && py < obs.y + obs.h + 15) return true;
  }
  return false;
}

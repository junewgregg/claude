// Resolves basic attacks, all ability types, projectiles and turrets.
// `world` is the live match state: { time, map, entities, projectiles,
// turrets, effects, onDeath }.

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function getAllies(entity, world) {
  return world.entities.filter(e => e.alive && e.team === entity.team);
}
function getEnemies(entity, world) {
  return world.entities.filter(e => e.alive && e.team !== entity.team);
}
function visibleEnemies(entity, world) {
  return getEnemies(entity, world).filter(e => !e.isStealthed);
}
function nearestEnemy(entity, world, maxRange = Infinity) {
  let best = null, bestD = maxRange;
  for (const e of visibleEnemies(entity, world)) {
    const d = dist(entity, e);
    if (d <= bestD) { best = e; bestD = d; }
  }
  return best;
}
function lowestHpAlly(entity, world, includeSelf = true, maxRange = Infinity) {
  let best = null, bestRatio = Infinity;
  for (const a of getAllies(entity, world)) {
    if (!includeSelf && a === entity) continue;
    if (dist(entity, a) > maxRange) continue;
    const ratio = a.hp / a.maxHp;
    if (ratio < bestRatio) { bestRatio = ratio; best = a; }
  }
  return best || (includeSelf ? entity : null);
}
function enemiesInRadius(cx, cy, radius, entity, world) {
  return visibleEnemies(entity, world).filter(e => Math.hypot(e.x - cx, e.y - cy) <= radius + e.radius);
}
function alliesInRadius(cx, cy, radius, entity, world) {
  return getAllies(entity, world).filter(a => Math.hypot(a.x - cx, a.y - cy) <= radius + a.radius);
}

function spawnEffect(world, effect) {
  world.effects.push({ createdAt: world.time, ...effect });
}

function clampToMap(x, y, world) {
  const m = world.map;
  return { x: Math.max(20, Math.min(m.width - 20, x)), y: Math.max(20, Math.min(m.height - 20, y)) };
}

// Global damage dial: everyone hits softer than raw kit numbers so fights last
// long enough to react in. AI-controlled fighters take a further handicap so
// they don't out-trade a human on pure cooldown uptime.
const COMBAT_DAMAGE_SCALE = 0.8;
const AI_DAMAGE_SCALE = 0.85;

function dealDamageTo(target, amount, source, world) {
  let dmg = amount * (source.damageMultiplier || 1) * COMBAT_DAMAGE_SCALE;
  if (source.isAI) dmg *= AI_DAMAGE_SCALE;
  const applied = target.takeDamage(dmg, source, world);
  if (applied > 0) {
    spawnEffect(world, {
      type: 'hitspark', x: target.x, y: target.y, life: 0.28,
      color: (source.sheet && source.sheet.color) || '#ffffff'
    });
    // Damage numbers only for hits the player is part of, so the screen stays readable.
    const pe = world.playerEntity;
    if (pe && (source === pe || target === pe)) {
      spawnEffect(world, {
        type: 'damagetext', x: target.x + (Math.random() - 0.5) * 16, y: target.y - 16,
        text: String(Math.round(applied)), life: 0.9,
        color: source === pe ? '#ffd24f' : '#ff7a6b'
      });
    }
  }
  return applied;
}

// Every ability and ultimate gets a visible tell: an expanding ring at the
// caster, plus a floating name so you can read what just went off. Enemy
// ability names are left off to avoid burying the screen in text, but their
// ultimates still announce themselves.
function spawnCastVfx(entity, ability, world, isUltimate) {
  const color = isUltimate ? '#f4c542' : entity.sheet.color;
  spawnEffect(world, {
    type: 'castring', x: entity.x, y: entity.y, color,
    radius: isUltimate ? 130 : 52, life: isUltimate ? 0.75 : 0.4
  });
  const isPlayer = world.playerEntity === entity;
  if (isPlayer || isUltimate) {
    spawnEffect(world, {
      type: 'casttext', x: entity.x, y: entity.y - 40,
      text: ability.name || ability.base, color, life: 1.3, big: isUltimate
    });
  }
}

// ---------------- basic attack ----------------
function useBasicAttack(entity, aimX, aimY, world) {
  if (!entity.alive || entity.isStunned || entity.attackCooldownRemaining > 0) return false;
  const speedBuff = entity.buffs.attackSpeed;
  const cdMult = speedBuff && speedBuff.until > world.time ? (1 - speedBuff.amount) : 1;
  entity.attackCooldownRemaining = entity.sheet.stats.attackCooldown * cdMult;
  entity.stealthUntil = -1; // attacking breaks stealth
  const dmg = entity.sheet.stats.attackDamage;
  const range = entity.sheet.stats.attackRange;
  entity.facing = Math.atan2(aimY - entity.y, aimX - entity.x);

  if (entity.sheet.attackType === 'melee') {
    const target = nearestEnemy(entity, world, range);
    // The swing always shows, hit or miss, so an attack never feels swallowed.
    spawnEffect(world, {
      type: 'slash', x: entity.x, y: entity.y, angle: entity.facing,
      life: 0.25, color: entity.sheet.color, reach: range
    });
    if (target) dealDamageTo(target, dmg, entity, world);
    return true;
  }
  // ranged / heal basic attacks both fire a small projectile
  const ang = Math.atan2(aimY - entity.y, aimX - entity.x);
  spawnEffect(world, { type: 'muzzle', x: entity.x, y: entity.y, angle: ang, color: entity.sheet.color, life: 0.14 });
  world.projectiles.push({
    x: entity.x, y: entity.y, vx: Math.cos(ang) * entity.sheet.stats.projectileSpeed,
    vy: Math.sin(ang) * entity.sheet.stats.projectileSpeed, damage: dmg, owner: entity,
    radius: 7, traveled: 0, maxRange: range, color: entity.sheet.color, basic: true
  });
  return true;
}

// ---------------- ability dispatch ----------------
// Each handler returns true if the ability was successfully cast.
const ABILITY_HANDLERS = {
  shield_self(entity, ab, aimX, aimY, world) {
    entity.shield = Math.min(entity.maxShield, entity.shield + entity.maxHp * ab.value);
    if (ab.taunt) spawnEffect(world, { type: 'taunt', x: entity.x, y: entity.y, life: 1.5 });
    spawnEffect(world, { type: 'shieldpop', x: entity.x, y: entity.y, life: 0.4, color: entity.sheet.color });
    return true;
  },
  melee_strike(entity, ab, aimX, aimY, world) {
    const target = nearestEnemy(entity, world, ab.range);
    entity.facing = Math.atan2(aimY - entity.y, aimX - entity.x);
    spawnEffect(world, { type: 'slash', x: entity.x, y: entity.y, angle: entity.facing, life: 0.2, color: entity.sheet.color, big: true, reach: ab.range });
    // A whiff shows the swing but doesn't burn the cooldown.
    if (!target) return false;
    let dmg = ab.damage;
    if (ab.executeBonus && target.hp / target.maxHp > 0.5) dmg *= (1 + ab.executeBonus);
    dealDamageTo(target, dmg, entity, world);
    if (ab.stun) target.applyStatus('stun', ab.stun, world.time);
    return true;
  },
  projectile(entity, ab, aimX, aimY, world) {
    const ang = Math.atan2(aimY - entity.y, aimX - entity.x);
    spawnEffect(world, { type: 'muzzle', x: entity.x, y: entity.y, angle: ang, color: entity.sheet.color, life: 0.18, big: true });
    world.projectiles.push({
      x: entity.x, y: entity.y, vx: Math.cos(ang) * entity.sheet.stats.projectileSpeed * 1.1,
      vy: Math.sin(ang) * entity.sheet.stats.projectileSpeed * 1.1, damage: ab.damage, owner: entity,
      radius: 8, traveled: 0, maxRange: ab.range, pierce: !!ab.pierce, color: entity.sheet.color
    });
    return true;
  },
  projectile_slow(entity, ab, aimX, aimY, world) {
    const ang = Math.atan2(aimY - entity.y, aimX - entity.x);
    spawnEffect(world, { type: 'muzzle', x: entity.x, y: entity.y, angle: ang, color: '#8ecbff', life: 0.18, big: true });
    world.projectiles.push({
      x: entity.x, y: entity.y, vx: Math.cos(ang) * entity.sheet.stats.projectileSpeed,
      vy: Math.sin(ang) * entity.sheet.stats.projectileSpeed, damage: ab.damage, owner: entity,
      radius: 8, traveled: 0, maxRange: ab.range, color: entity.sheet.color,
      onHit: (target) => target.applyStatus('slow', ab.slowDuration, world.time, { amount: ab.slow })
    });
    return true;
  },
  aoe_damage(entity, ab, aimX, aimY, world) {
    let cx = entity.x, cy = entity.y;
    if (!ab.originSelf) {
      const ang = Math.atan2(aimY - entity.y, aimX - entity.x);
      const d = Math.min(ab.range || 300, Math.hypot(aimX - entity.x, aimY - entity.y));
      cx = entity.x + Math.cos(ang) * d; cy = entity.y + Math.sin(ang) * d;
    }
    spawnEffect(world, { type: 'blast', x: cx, y: cy, radius: ab.radius, life: 0.35, color: entity.sheet.color });
    for (const t of enemiesInRadius(cx, cy, ab.radius, entity, world)) {
      dealDamageTo(t, ab.damage, entity, world);
      if (ab.slow) t.applyStatus('slow', 2, world.time, { amount: ab.slow });
      if (ab.stun) t.applyStatus('stun', ab.stun, world.time);
      if (ab.knockback) {
        const ang = Math.atan2(t.y - cy, t.x - cx);
        const p = clampToMap(t.x + Math.cos(ang) * 60, t.y + Math.sin(ang) * 60, world);
        t.x = p.x; t.y = p.y;
      }
    }
    return true;
  },
  aoe_damage_selfheal(entity, ab, aimX, aimY, world) {
    ABILITY_HANDLERS.aoe_damage(entity, ab, entity.x, entity.y, world);
    entity.heal(entity.maxHp * ab.healPct, entity);
    return true;
  },
  aoe_damage_summon(entity, ab, aimX, aimY, world) {
    ABILITY_HANDLERS.aoe_damage(entity, ab, entity.x, entity.y, world);
    for (let i = 0; i < ab.turrets; i++) spawnTurret(entity, world, i);
    return true;
  },
  dash(entity, ab, aimX, aimY, world) {
    let ang = Math.atan2(aimY - entity.y, aimX - entity.x);
    if (ab.backward) ang += Math.PI;
    const dest = clampToMap(entity.x + Math.cos(ang) * ab.distance, entity.y + Math.sin(ang) * ab.distance, world);
    spawnEffect(world, { type: 'dashtrail', x1: entity.x, y1: entity.y, x2: dest.x, y2: dest.y, life: 0.25, color: entity.sheet.color });
    entity.x = dest.x; entity.y = dest.y;
    if (ab.damage) {
      for (const t of enemiesInRadius(dest.x, dest.y, 60, entity, world)) {
        dealDamageTo(t, ab.damage, entity, world);
        if (ab.stun) t.applyStatus('stun', ab.stun, world.time);
      }
    }
    return true;
  },
  dash_aoe(entity, ab, aimX, aimY, world) {
    ABILITY_HANDLERS.dash(entity, ab, aimX, aimY, world);
    ABILITY_HANDLERS.aoe_damage(entity, { ...ab, originSelf: true }, entity.x, entity.y, world);
    return true;
  },
  stealth(entity, ab, aimX, aimY, world) {
    entity.stealthUntil = world.time + ab.duration;
    spawnEffect(world, { type: 'shieldpop', x: entity.x, y: entity.y, life: 0.3, color: '#ffffff' });
    return true;
  },
  summon_turret(entity, ab, aimX, aimY, world) {
    spawnTurret(entity, world, 0, ab);
    return true;
  },
  buff_self(entity, ab, aimX, aimY, world) {
    entity.applyBuff(ab.stat, ab.amount, ab.duration, world.time);
    return true;
  },
  buff_team(entity, ab, aimX, aimY, world) {
    for (const a of alliesInRadius(entity.x, entity.y, ab.radius, entity, world)) {
      a.applyBuff(ab.stat, ab.amount, ab.duration, world.time);
    }
    spawnEffect(world, { type: 'blast', x: entity.x, y: entity.y, radius: ab.radius, life: 0.4, color: entity.sheet.color, ring: true });
    return true;
  },
  buff_ally(entity, ab, aimX, aimY, world) {
    const target = lowestHpAlly(entity, world, false, 400) || entity;
    if (ab.stat === 'speed_damage') {
      target.applyBuff('speed', ab.amount, ab.duration, world.time);
      target.applyBuff('damage', ab.amount, ab.duration, world.time);
    } else {
      target.applyBuff(ab.stat, ab.amount, ab.duration, world.time);
    }
    return true;
  },
  buff_team_shield(entity, ab, aimX, aimY, world) {
    for (const a of alliesInRadius(entity.x, entity.y, ab.radius, entity, world)) {
      a.shield = Math.min(a.maxShield, a.shield + a.maxHp * ab.shield);
      a.applyBuff('damage', ab.damage, ab.duration, world.time);
    }
    spawnEffect(world, { type: 'blast', x: entity.x, y: entity.y, radius: ab.radius, life: 0.5, color: entity.sheet.color, ring: true });
    return true;
  },
  heal_ally(entity, ab, aimX, aimY, world) {
    const target = lowestHpAlly(entity, world, true, 500);
    if (target) { target.heal(target.maxHp * ab.value, entity); spawnEffect(world, { type: 'heal', x: target.x, y: target.y, life: 0.4 }); }
    return true;
  },
  heal_ally_shield(entity, ab, aimX, aimY, world) {
    const target = lowestHpAlly(entity, world, true, 500);
    if (target) {
      target.heal(target.maxHp * ab.value, entity);
      target.shield = Math.min(target.maxShield, target.shield + target.maxHp * ab.shield);
      spawnEffect(world, { type: 'heal', x: target.x, y: target.y, life: 0.5, big: true });
    }
    return true;
  },
  shield_ally(entity, ab, aimX, aimY, world) {
    const target = lowestHpAlly(entity, world, true, 500);
    if (target) { target.shield = Math.min(target.maxShield, target.shield + target.maxHp * ab.value); spawnEffect(world, { type: 'shieldpop', x: target.x, y: target.y, life: 0.4, color: entity.sheet.color }); }
    return true;
  },
  cleanse_ally(entity, ab, aimX, aimY, world) {
    const target = lowestHpAlly(entity, world, true, 500);
    if (target) {
      for (const k of ['slow', 'burn', 'weaken', 'stun', 'mark']) delete target.statuses[k];
      target.heal(target.maxHp * ab.value, entity);
      spawnEffect(world, { type: 'heal', x: target.x, y: target.y, life: 0.3 });
    }
    return true;
  },
  heal_aoe(entity, ab, aimX, aimY, world) {
    for (const a of alliesInRadius(entity.x, entity.y, ab.radius, entity, world)) {
      a.heal(a.maxHp * ab.value, entity);
      if (ab.cleanse) for (const k of ['slow', 'burn', 'weaken', 'stun', 'mark']) delete a.statuses[k];
    }
    spawnEffect(world, { type: 'blast', x: entity.x, y: entity.y, radius: ab.radius, life: 0.5, color: '#7CFF9E', ring: true });
    return true;
  },
  mark(entity, ab, aimX, aimY, world) {
    const target = nearestEnemy(entity, world, ab.range);
    if (!target) return false;
    target.applyStatus('mark', ab.duration, world.time, { amount: ab.amount });
    spawnEffect(world, { type: 'beam', x1: entity.x, y1: entity.y, x2: target.x, y2: target.y, color: '#ff6b4f', life: 0.4 });
    spawnEffect(world, { type: 'castring', x: target.x, y: target.y, color: '#ff6b4f', radius: 40, life: 0.5 });
    return true;
  },
  mark_and_strike(entity, ab, aimX, aimY, world) {
    const target = nearestEnemy(entity, world, ab.range);
    if (!target) return false; // don't waste the ultimate on empty air
    target.applyStatus('mark', ab.markDuration, world.time, { amount: ab.markAmount });
    dealDamageTo(target, ab.damage, entity, world);
    spawnEffect(world, { type: 'slash', x: entity.x, y: entity.y, angle: entity.facing, life: 0.25, color: '#e03b3b', big: true, reach: ab.range });
    return true;
  },
  debuff_area(entity, ab, aimX, aimY, world) {
    const ang = Math.atan2(aimY - entity.y, aimX - entity.x);
    const d = Math.min(ab.range, Math.hypot(aimX - entity.x, aimY - entity.y));
    const cx = entity.x + Math.cos(ang) * d, cy = entity.y + Math.sin(ang) * d;
    for (const t of enemiesInRadius(cx, cy, ab.radius, entity, world)) t.applyStatus('weaken', ab.duration, world.time, { amount: ab.amount });
    spawnEffect(world, { type: 'blast', x: cx, y: cy, radius: ab.radius, life: ab.duration, color: '#b9a7d6' });
    return true;
  }
};

function spawnTurret(owner, world, index, ab) {
  const angle = (index / 3) * Math.PI * 2 + Math.random() * 0.5;
  const pos = clampToMap(owner.x + Math.cos(angle) * 40, owner.y + Math.sin(angle) * 40, world);
  world.turrets.push({
    id: 'turret_' + Math.random().toString(36).slice(2),
    owner, team: owner.team, x: pos.x, y: pos.y, radius: 12,
    hp: 40, maxHp: 40, range: 260, damage: (ab && ab.damage) || 4,
    fireCooldown: 0, expiresAt: world.time + ((ab && ab.duration) || 8)
  });
}

function useAbility(entity, index, aimX, aimY, world) {
  if (!entity.alive || entity.isStunned) return false;
  const ab = entity.sheet.abilities[index];
  const cd = entity.cooldowns[index];
  if (cd.remaining > 0) return false;
  const handler = ABILITY_HANDLERS[ab.type];
  if (!handler) return false;
  const ok = handler(entity, ab, aimX, aimY, world);
  if (ok) {
    cd.remaining = cd.max;
    spawnCastVfx(entity, ab, world, false);
  }
  return ok;
}

function useUltimate(entity, aimX, aimY, world) {
  if (!entity.alive || entity.isStunned) return false;
  const ab = entity.sheet.ultimate;
  if (entity.ultCooldown.remaining > 0) return false;
  const handler = ABILITY_HANDLERS[ab.type];
  if (!handler) return false;
  const ok = handler(entity, ab, aimX, aimY, world);
  if (ok) {
    entity.ultCooldown.remaining = entity.ultCooldown.max;
    spawnCastVfx(entity, ab, world, true);
  }
  return ok;
}

// ---------------- world tick: projectiles & turrets ----------------
function updateProjectiles(world, dt) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    const step = Math.hypot(p.vx, p.vy) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.traveled += step;
    let hit = false;
    for (const e of visibleEnemies(p.owner, world)) {
      if (Math.hypot(e.x - p.x, e.y - p.y) <= p.radius + e.radius) {
        dealDamageTo(e, p.damage, p.owner, world);
        if (p.onHit) p.onHit(e);
        hit = true;
        if (!p.pierce) break;
      }
    }
    const outOfMap = p.x < 0 || p.y < 0 || p.x > world.map.width || p.y > world.map.height;
    if ((hit && !p.pierce) || p.traveled >= p.maxRange || outOfMap) world.projectiles.splice(i, 1);
  }
}

function updateTurrets(world, dt) {
  for (let i = world.turrets.length - 1; i >= 0; i--) {
    const t = world.turrets[i];
    t.fireCooldown = Math.max(0, t.fireCooldown - dt);
    if (world.time >= t.expiresAt || t.hp <= 0) { world.turrets.splice(i, 1); continue; }
    let target = null, bestD = t.range;
    for (const e of world.entities) {
      if (!e.alive || e.team === t.team || e.isStealthed) continue;
      const d = dist(t, e);
      if (d < bestD) { bestD = d; target = e; }
    }
    if (target && t.fireCooldown <= 0) {
      t.fireCooldown = 1.1;
      const ang = Math.atan2(target.y - t.y, target.x - t.x);
      world.projectiles.push({
        x: t.x, y: t.y, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380,
        damage: t.damage, owner: { sheet: { color: '#ffaa33', passive: null, displayName: 'a turret' }, team: t.team, damageMultiplier: 1, kills: 0 },
        radius: 5, traveled: 0, maxRange: t.range, color: '#ffaa33'
      });
    }
  }
}

function updateEffects(world) {
  world.effects = world.effects.filter(fx => world.time - fx.createdAt < fx.life);
}

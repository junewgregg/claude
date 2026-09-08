// AI controller. Tuned to play at roughly "competent average player" level:
// it reacts on a short human-like delay, aims with a little imprecision,
// uses cooldowns sensibly, and follows its role, but doesn't play perfectly
// (no pixel-perfect kiting, no frame-perfect combos).

const AI_AWARENESS_RANGE = 620;

function newAiState() {
  return {
    nextDecision: Math.random() * 0.2,
    moveDirX: 0, moveDirY: 0,
    aimX: 0, aimY: 0,
    targetId: null,
    aimError: 0
  };
}

function aiPickTarget(entity, world) {
  const enemies = visibleEnemies(entity, world).filter(e => dist(entity, e) < AI_AWARENESS_RANGE);
  if (!enemies.length) return null;
  // Prefer low-hp targets, but weight by distance so AI doesn't beeline across the map.
  let best = null, bestScore = -Infinity;
  for (const e of enemies) {
    const hpRatio = e.hp / e.maxHp;
    const d = dist(entity, e);
    const score = (1 - hpRatio) * 120 - d * 0.15;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function aiDefensiveAbilityIndex(entity) {
  const defensiveTypes = ['shield_self', 'heal_ally', 'heal_ally_shield', 'cleanse_ally', 'shield_ally'];
  return entity.sheet.abilities.findIndex((a, i) =>
    defensiveTypes.includes(a.type) && entity.cooldowns[i].remaining <= 0);
}

function aiOffensiveAbilityIndex(entity, target, world) {
  let bestIdx = -1, bestDamage = -1;
  entity.sheet.abilities.forEach((a, i) => {
    if (entity.cooldowns[i].remaining > 0) return;
    const dealsDamage = typeof a.damage === 'number' && a.damage > 0;
    if (!dealsDamage) return;
    const range = a.range || (a.radius ? a.radius + 80 : entity.sheet.stats.attackRange);
    if (target && dist(entity, target) > range + 40) return;
    if (a.damage > bestDamage) { bestDamage = a.damage; bestIdx = i; }
  });
  return bestIdx;
}

function aiUtilityAbilityIndex(entity, world) {
  // healer/support: proactively buff or heal an ally that isn't full.
  const idx = entity.sheet.abilities.findIndex((a, i) => {
    if (entity.cooldowns[i].remaining > 0) return false;
    return ['heal_ally', 'heal_aoe', 'shield_ally', 'cleanse_ally', 'buff_team', 'buff_ally', 'buff_self'].includes(a.type);
  });
  return idx;
}

function aiDecide(entity, world, st) {
  const target = aiPickTarget(entity, world);
  st.targetId = target ? target.id : null;
  st.aimError = (Math.random() - 0.5) * 40; // a little imprecision, not laser-perfect

  const hpRatio = entity.hp / entity.maxHp;
  const role = entity.sheet.role;

  // 1. Emergency defense.
  if (hpRatio < 0.35) {
    const di = aiDefensiveAbilityIndex(entity);
    if (di >= 0) {
      const ab = entity.sheet.abilities[di];
      const aim = ['heal_ally', 'heal_ally_shield', 'cleanse_ally', 'shield_ally'].includes(ab.type)
        ? pointOf(lowestHpAlly(entity, world, true, 500) || entity) : pointOf(entity);
      useAbility(entity, di, aim.x, aim.y, world);
    }
  }

  // 2. Healer role: keep the weakest ally topped up proactively.
  if (role === 'healer') {
    const weakAlly = lowestHpAlly(entity, world, false, 550);
    if (weakAlly && weakAlly.hp / weakAlly.maxHp < 0.85) {
      const ui = aiUtilityAbilityIndex(entity, world);
      if (ui >= 0) {
        const p = pointOf(weakAlly);
        useAbility(entity, ui, p.x, p.y, world);
      }
    }
  } else if (Math.random() < 0.5) {
    // Non-healers occasionally still pop team buffs (tank rally cries, scholar's team isn't the only support).
    const ui = aiUtilityAbilityIndex(entity, world);
    if (ui >= 0 && ['buff_team', 'buff_self'].includes(entity.sheet.abilities[ui].type)) {
      useAbility(entity, ui, entity.x, entity.y, world);
    }
  }

  // 3. Ultimate when a fight is on.
  if (target && entity.ultCooldown.remaining <= 0) {
    const nearbyEnemies = enemiesInRadius(entity.x, entity.y, 260, entity, world).length;
    if (nearbyEnemies > 0 || role === 'healer') {
      const aim = pointOf(target);
      useUltimate(entity, aim.x + st.aimError, aim.y + st.aimError, world);
    }
  }

  // 4. Offensive ability on cooldown.
  if (target) {
    const oi = aiOffensiveAbilityIndex(entity, target, world);
    if (oi >= 0 && Math.random() < 0.85) {
      const aim = pointOf(target);
      useAbility(entity, oi, aim.x + st.aimError, aim.y + st.aimError, world);
    }
  }

  // 5. Movement decision.
  if (target) {
    const range = entity.sheet.stats.attackRange;
    const d = dist(entity, target);
    const isRanged = entity.sheet.attackType === 'ranged';
    let dx = target.x - entity.x, dy = target.y - entity.y;
    if (isRanged && d < range * 0.55) { dx = -dx; dy = -dy; } // kite away when too close
    else if (d < range * 0.85 && isRanged) {
      // strafe sideways around the target instead of standing still
      const perp = Math.random() < 0.5 ? 1 : -1;
      dx = -(target.y - entity.y) * perp;
      dy = (target.x - entity.x) * perp;
    }
    if (pathBlocked(entity.x, entity.y, entity.x + dx, entity.y + dy, 70, world)) {
      const t = dx; dx = -dy * 0.7; dy = t * 0.7; // steer around
    }
    st.moveDirX = dx; st.moveDirY = dy;
    st.aimX = target.x + st.aimError; st.aimY = target.y + st.aimError;
  } else {
    // No target: wander gently toward map center / random point.
    if (!st.wanderX || Math.random() < 0.02) {
      st.wanderX = 60 + Math.random() * (world.map.width - 120);
      st.wanderY = 60 + Math.random() * (world.map.height - 120);
    }
    st.moveDirX = st.wanderX - entity.x; st.moveDirY = st.wanderY - entity.y;
    st.aimX = entity.x + st.moveDirX; st.aimY = entity.y + st.moveDirY;
  }
}

function pointOf(e) { return { x: e.x, y: e.y }; }

function updateAI(entity, world, dt) {
  if (!entity.alive) return;
  if (!entity.aiState) entity.aiState = newAiState();
  const st = entity.aiState;
  st.nextDecision -= dt;
  if (st.nextDecision <= 0) {
    aiDecide(entity, world, st);
    st.nextDecision = 0.18 + Math.random() * 0.22; // ~180-400ms reaction cadence
  }
  applyMovement(entity, st.moveDirX, st.moveDirY, dt, world);

  // Auto basic-attack whenever a target is in range, independent of the decision tick
  // so it doesn't feel like it's missing free damage between "thinks".
  const target = world.entities.find(e => e.id === st.targetId && e.alive);
  if (target && dist(entity, target) <= entity.sheet.stats.attackRange + 10) {
    useBasicAttack(entity, target.x + st.aimError, target.y + st.aimError, world);
  }
}

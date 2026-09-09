// AI controller. Tuned to play at roughly "competent average player" level:
// it reacts on a short human-like delay, aims with a little imprecision,
// uses cooldowns sensibly, and follows its role, but doesn't play perfectly
// (no pixel-perfect kiting, no frame-perfect combos).

const AI_AWARENESS_RANGE = 620;
// Difficulty dials. These are deliberately human-ish: an average player doesn't
// react in 200ms, doesn't hit every shot, and doesn't dump four abilities the
// instant they come off cooldown. Both teams run this same controller, so
// allies are exactly as capable as opponents.
const AI_REACTION_MIN = 0.35;      // seconds between decisions
const AI_REACTION_SPREAD = 0.4;
const AI_ABILITY_CHANCE = 0.55;    // chance to use an available offensive ability
const AI_ULTIMATE_CHANCE = 0.6;
const AI_ABILITY_GAP = 1.5;        // min seconds between an AI's ability casts
const AI_AIM_ERROR = 46;           // pixels of aim scatter
const AI_ATTACK_CHANCE = 0.9;      // chance to take an available basic attack

function newAiState() {
  return {
    nextDecision: Math.random() * 0.3,
    nextAbilityAt: 0,
    moveDirX: 0, moveDirY: 0,
    aimX: 0, aimY: 0,
    targetId: null,
    aimError: 0
  };
}

// Can this AI cast anything right now? Gating all casts behind one shared timer
// stops the "four abilities in one frame" burst that made fights unsurvivable.
function aiCanCast(entity, world, st) {
  return world.time >= st.nextAbilityAt;
}
function aiNoteCast(world, st) {
  st.nextAbilityAt = world.time + AI_ABILITY_GAP * (0.75 + Math.random() * 0.5);
}

function aiPickTarget(entity, world) {
  const enemies = visibleEnemies(entity, world).filter(e => dist(entity, e) < AI_AWARENESS_RANGE);
  if (!enemies.length) return null;
  // Prefer low-hp targets, but weight by distance so AI doesn't beeline across the map.
  let best = null, bestScore = -Infinity;
  for (const e of enemies) {
    const hpRatio = e.hp / e.maxHp;
    const d = dist(entity, e);
    // Weaker pull toward low-health targets than before, plus per-AI jitter, so
    // the whole enemy team doesn't collapse onto whoever is hurt (usually you).
    const score = (1 - hpRatio) * 70 - d * 0.15 + Math.random() * 40;
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
  st.aimError = (Math.random() - 0.5) * AI_AIM_ERROR;

  const hpRatio = entity.hp / entity.maxHp;
  const role = entity.sheet.role;
  // At most one cast per decision, and never two casts closer than AI_ABILITY_GAP.
  let casting = aiCanCast(entity, world, st);

  // 1. Emergency defense.
  if (casting && hpRatio < 0.35) {
    const di = aiDefensiveAbilityIndex(entity);
    if (di >= 0) {
      const ab = entity.sheet.abilities[di];
      const aim = ['heal_ally', 'heal_ally_shield', 'cleanse_ally', 'shield_ally'].includes(ab.type)
        ? pointOf(lowestHpAlly(entity, world, true, 500) || entity) : pointOf(entity);
      if (useAbility(entity, di, aim.x, aim.y, world)) { aiNoteCast(world, st); casting = false; }
    }
  }

  // 2. Healer role: keep the weakest ally topped up proactively.
  if (casting && role === 'healer') {
    const weakAlly = lowestHpAlly(entity, world, false, 550);
    if (weakAlly && weakAlly.hp / weakAlly.maxHp < 0.85) {
      const ui = aiUtilityAbilityIndex(entity, world);
      if (ui >= 0) {
        const p = pointOf(weakAlly);
        if (useAbility(entity, ui, p.x, p.y, world)) { aiNoteCast(world, st); casting = false; }
      }
    }
  } else if (casting && Math.random() < 0.35) {
    // Non-healers occasionally pop team buffs (tank rally cries and the like).
    const ui = aiUtilityAbilityIndex(entity, world);
    if (ui >= 0 && ['buff_team', 'buff_self'].includes(entity.sheet.abilities[ui].type)) {
      if (useAbility(entity, ui, entity.x, entity.y, world)) { aiNoteCast(world, st); casting = false; }
    }
  }

  // 3. Ultimate when a fight is on.
  if (casting && target && entity.ultCooldown.remaining <= 0 && Math.random() < AI_ULTIMATE_CHANCE) {
    const nearbyEnemies = enemiesInRadius(entity.x, entity.y, 260, entity, world).length;
    if (nearbyEnemies > 0 || role === 'healer') {
      const aim = pointOf(target);
      if (useUltimate(entity, aim.x + st.aimError, aim.y + st.aimError, world)) { aiNoteCast(world, st); casting = false; }
    }
  }

  // 4. Offensive ability, sometimes.
  if (casting && target) {
    const oi = aiOffensiveAbilityIndex(entity, target, world);
    if (oi >= 0 && Math.random() < AI_ABILITY_CHANCE) {
      const aim = pointOf(target);
      if (useAbility(entity, oi, aim.x + st.aimError, aim.y + st.aimError, world)) { aiNoteCast(world, st); casting = false; }
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
    // No target in sight: regroup rather than wander off alone. Teammates head
    // for the squad's center of mass (and stay near the human player), which
    // keeps allies useful instead of scattered across the map.
    const dest = aiRegroupPoint(entity, world, st);
    st.moveDirX = dest.x - entity.x; st.moveDirY = dest.y - entity.y;
    st.aimX = entity.x + st.moveDirX; st.aimY = entity.y + st.moveDirY;
  }
}

// Where an AI heads when it has nobody to fight.
function aiRegroupPoint(entity, world, st) {
  const allies = getAllies(entity, world).filter(a => a !== entity);
  const human = allies.find(a => !a.isAI);
  if (human) return { x: human.x + (Math.random() - 0.5) * 120, y: human.y + (Math.random() - 0.5) * 120 };
  if (allies.length) {
    const cx = allies.reduce((s, a) => s + a.x, 0) / allies.length;
    const cy = allies.reduce((s, a) => s + a.y, 0) / allies.length;
    return { x: cx + (Math.random() - 0.5) * 140, y: cy + (Math.random() - 0.5) * 140 };
  }
  // Solo (free-for-all): drift toward the middle where the action is, not a corner.
  if (!st.wanderX || Math.random() < 0.05) {
    st.wanderX = world.map.width * (0.3 + Math.random() * 0.4);
    st.wanderY = world.map.height * (0.3 + Math.random() * 0.4);
  }
  return { x: st.wanderX, y: st.wanderY };
}

function pointOf(e) { return { x: e.x, y: e.y }; }

function updateAI(entity, world, dt) {
  if (!entity.alive) return;
  if (!entity.aiState) entity.aiState = newAiState();
  const st = entity.aiState;
  st.nextDecision -= dt;
  if (st.nextDecision <= 0) {
    aiDecide(entity, world, st);
    st.nextDecision = AI_REACTION_MIN + Math.random() * AI_REACTION_SPREAD;
  }
  applyMovement(entity, st.moveDirX, st.moveDirY, dt, world);

  // Basic attacks happen between decisions so the AI isn't idle mid-think, but
  // it passes on some openings rather than achieving perfect uptime.
  const target = world.entities.find(e => e.id === st.targetId && e.alive);
  if (target && dist(entity, target) <= entity.sheet.stats.attackRange + 10 && Math.random() < AI_ATTACK_CHANCE) {
    useBasicAttack(entity, target.x + st.aimError, target.y + st.aimError, world);
  }
}

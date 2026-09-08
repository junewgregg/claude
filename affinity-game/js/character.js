// Turns an (affinity, teknik) pair into a full character sheet: stats, a
// styled basic attack, four named abilities, and an ultimate. This is what
// makes all 120 affinity/teknik combinations feel distinct without hand
// authoring 120 bespoke kits: the teknik supplies the mechanical shape of the
// kit, the affinity supplies the name, color, small stat lean, and passive.

function pickDescriptor(affinity, seedStr) {
  // Deterministic-ish pick between the affinity's two flavor words based on
  // the ability id, so the same ability always gets the same flavor word.
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  return affinity.words[hash % affinity.words.length];
}

function nameAbility(affinity, ability) {
  return `${pickDescriptor(affinity, ability.id)} ${ability.base}`;
}

function buildAbility(affinity, ability, statMods) {
  const named = { ...ability, name: nameAbility(affinity, ability) };
  // Scale numeric damage/heal/shield values slightly by role-agnostic power lean.
  const scale = statMods.power || 1.0;
  for (const key of ['damage', 'value', 'healPct']) {
    if (typeof named[key] === 'number') named[key] = named[key] * scale;
  }
  named.remaining = 0;
  named.maxCooldown = ability.cooldown;
  return named;
}

function createCharacterSheet({ affinityId, teknikId, name, isAI = false, team = null }) {
  const affinity = AFFINITY_BY_ID[affinityId];
  const teknik = TEKNIK_BY_ID[teknikId];
  if (!affinity || !teknik) throw new Error('Unknown affinity/teknik combo');

  const mods = affinity.statMods;
  const base = teknik.baseStats;
  const stats = {
    maxHp: Math.round(base.hp * mods.hp),
    armor: +(base.armor * mods.armor).toFixed(1),
    speed: Math.round(base.speed * mods.speed),
    attackRange: base.attackRange,
    attackDamage: +(base.attackDamage).toFixed(1),
    attackCooldown: base.attackCooldown * (mods.cdr || 1),
    projectileSpeed: 460
  };

  const abilities = teknik.abilities.map(a => buildAbility(affinity, a, mods));
  const ultimate = buildAbility(affinity, teknik.ultimate, mods);

  return {
    displayName: name || `${affinity.name} ${teknik.name}`,
    affinity, teknik, role: teknik.role,
    isAI, team,
    color: affinity.color, colorDark: affinity.colorDark,
    glyph: affinity.glyph, weaponGlyph: teknik.weaponGlyph,
    attackType: teknik.attackType,
    stats,
    abilities, ultimate,
    passive: affinity.passive
  };
}

function randomCharacterSheet(name, isAI, team) {
  const affinity = AFFINITIES[Math.floor(Math.random() * AFFINITIES.length)];
  const teknik = TEKNIKS[Math.floor(Math.random() * TEKNIKS.length)];
  return createCharacterSheet({ affinityId: affinity.id, teknikId: teknik.id, name, isAI, team });
}

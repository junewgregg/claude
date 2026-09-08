// Runtime combat entity: wraps a character sheet with live match state
// (position, health, shield, status effects, ability cooldowns).

class Entity {
  constructor(sheet, x, y, world) {
    this.sheet = sheet;
    this.id = Entity.nextId++;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 0; // radians
    this.radius = 18;
    this.maxHp = sheet.stats.maxHp;
    this.hp = this.maxHp;
    this.maxShield = this.maxHp * 0.6;
    this.shield = 0;
    this.alive = true;
    this.respawnAt = null;
    this.team = sheet.team;
    this.isAI = sheet.isAI;
    this.kills = 0;
    this.deaths = 0;
    this.spawnX = x; this.spawnY = y;
    this.statuses = {}; // type -> { until, ...extra }
    this.buffs = {}; // stat -> { until, amount }
    this.cooldowns = sheet.abilities.map(a => ({ id: a.id, remaining: 0, max: a.maxCooldown }));
    this.ultCooldown = { id: sheet.ultimate.id, remaining: 0, max: sheet.ultimate.maxCooldown };
    this.attackCooldownRemaining = 0;
    this.lastDamagedAt = -999;
    this.combatStartedAt = null;
    this.stealthUntil = -1;
    this.world = world;
    this.aiState = null; // populated by ai.js
  }

  get isStunned() {
    const s = this.statuses.stun;
    return !!s && s.until > this.world.time;
  }
  get isIntangible() {
    const s = this.statuses.intangible;
    return !!s && s.until > this.world.time;
  }
  get isStealthed() {
    return this.stealthUntil > this.world.time;
  }
  get speedMultiplier() {
    let mult = 1;
    const slow = this.statuses.slow;
    if (slow && slow.until > this.world.time) mult *= (1 - slow.amount);
    const buff = this.buffs.speed;
    if (buff && buff.until > this.world.time) mult *= (1 + buff.amount);
    return mult;
  }
  get damageMultiplier() {
    let mult = 1;
    const weak = this.statuses.weaken;
    if (weak && weak.until > this.world.time) mult *= (1 - weak.amount);
    const buff = this.buffs.damage;
    if (buff && buff.until > this.world.time) mult *= (1 + buff.amount);
    const mark = this.statuses.mark;
    return mult;
  }
  get armorValue() {
    let armor = this.sheet.stats.armor;
    const buff = this.buffs.armor;
    if (buff && buff.until > this.world.time) armor *= (1 + buff.amount);
    return armor;
  }
  get cdrMultiplier() {
    const passive = this.sheet.passive;
    if (passive && passive.cdrMultiplier) return passive.cdrMultiplier(this);
    return 1;
  }

  applyStatus(type, duration, now, extra = {}) {
    this.statuses[type] = { until: now + duration, ...extra };
  }
  applyBuff(stat, amount, duration, now) {
    this.buffs[stat] = { until: now + duration, amount };
  }

  heal(amount, source) {
    if (!this.alive || amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  takeDamage(amount, source, world) {
    if (!this.alive || this.isIntangible) return 0;
    let dmg = amount;
    const mark = this.statuses.mark;
    if (mark && mark.until > world.time) dmg *= (1 + mark.amount);
    const passive = this.sheet.passive;
    if (passive && passive.onTakeDamage) dmg = passive.onTakeDamage(this, dmg, source, world);
    dmg = Math.max(0, dmg - this.armorValue * 0.6);
    // shield absorbs first
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    this.lastDamagedAt = world.time;
    if (source && source.sheet && source.sheet.passive && source.sheet.passive.onDealDamage) {
      source.sheet.passive.onDealDamage(source, amount, this, world);
    }
    if (this.hp <= 0 && this.alive) {
      this.hp = 0;
      this.alive = false;
      if (source) source.kills++;
      world.onDeath && world.onDeath(this, source);
    }
    return dmg;
  }

  tickStatuses(dt, world) {
    const burn = this.statuses.burn;
    if (burn && burn.until > world.time) {
      this.hp -= burn.dps * dt;
      if (this.hp <= 0 && this.alive) {
        this.hp = 0; this.alive = false;
        world.onDeath && world.onDeath(this, burn.source || null);
      }
    }
  }

  tickCooldowns(dt) {
    const mult = this.cdrMultiplier;
    for (const cd of this.cooldowns) cd.remaining = Math.max(0, cd.remaining - dt * mult);
    this.ultCooldown.remaining = Math.max(0, this.ultCooldown.remaining - dt * mult);
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - dt * mult);
  }

  // Brought back to life at (x, y) after the respawn timer elapses. Ability
  // cooldowns reset, but the ultimate keeps ticking so dying isn't a way to
  // refresh it. A short spell of intangibility prevents spawn camping.
  respawnNow(x, y, world) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.hp = this.maxHp;
    this.shield = 0;
    this.alive = true;
    this.respawnAt = null;
    this.statuses = {};
    this.buffs = {};
    this.lastDamagedAt = -999;
    this.combatStartedAt = null;
    this.stealthUntil = -1;
    this.attackCooldownRemaining = 0;
    for (const cd of this.cooldowns) cd.remaining = 0;
    this.applyStatus('intangible', 1.5, world.time);
    this.aiState = null;
  }

  update(dt, world) {
    // Cooldowns keep recovering while dead so respawns aren't dead weight.
    if (!this.alive) { this.tickCooldowns(dt); return; }
    this.tickStatuses(dt, world);
    this.tickCooldowns(dt);
    const passive = this.sheet.passive;
    if (passive && passive.onUpdate) passive.onUpdate(this, dt, world);
  }
}
Entity.nextId = 1;

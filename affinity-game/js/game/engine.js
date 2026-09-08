// Drives a single match: owns the world, steps AI/physics/combat each frame,
// tracks the match clock, kill scores, respawns, the shrinking storm zone for
// battle-royale modes, and the camera.
//
// Match rules: every mode is a timed deathmatch. The clock runs down from
// mode.duration; whoever has the most kills when it hits zero wins. Nobody is
// ever eliminated for good — fallen fighters respawn after mode.respawnDelay.

function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

class MatchEngine {
  constructor({ map, mode, roster, playerSheet, input, canvas, onEnd, onKillFeed }) {
    this.map = map;
    this.mode = mode;
    this.input = input;
    this.canvas = canvas;
    this.onEnd = onEnd;
    this.onKillFeed = onKillFeed || (() => {});
    this.ended = false;
    this.camera = { x: 0, y: 0 };

    this.duration = mode.duration || 120;
    this.timeRemaining = this.duration;
    this.respawnDelay = mode.respawnDelay || 5;

    this.world = {
      time: 0, map, entities: [], projectiles: [], turrets: [], effects: [],
      onDeath: (entity, killer) => this.handleDeath(entity, killer)
    };

    assignSpawnPositions(roster, map, mode);
    this.world.entities = roster.map(sheet => new Entity(sheet, sheet.x, sheet.y, this.world));
    this.playerEntity = this.world.entities.find(e => e.sheet === playerSheet);
    // Combat VFX uses this to decide which damage numbers are worth showing.
    this.world.playerEntity = this.playerEntity;

    // Kill/death tallies per team, and a readable name for each team.
    this.scores = {};
    this.deaths = {};
    this.teamNames = {};
    for (const e of this.world.entities) {
      if (this.scores[e.team] === undefined) { this.scores[e.team] = 0; this.deaths[e.team] = 0; }
      if (!this.teamNames[e.team]) {
        if (e.team === this.playerEntity.team) this.teamNames[e.team] = mode.teamSize === 1 ? 'You' : 'Your Team';
        else this.teamNames[e.team] = mode.teamSize === 1 ? e.sheet.displayName : e.sheet.displayName.replace(/\s+\d+$/, '');
      }
    }

    this.zone = mode.zone ? {
      cx: map.width / 2, cy: map.height / 2,
      startRadius: Math.max(map.width, map.height) * 0.72,
      radius: Math.max(map.width, map.height) * 0.72,
      endRadius: 320, duration: this.duration, elapsed: 0, nextDamageTick: 1
    } : null;

    this._lastPlayerX = this.playerEntity.x;
    this._lastPlayerY = this.playerEntity.y;
  }

  update(dt) {
    if (this.ended) return;
    this.world.time += dt;
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    this.updateCamera();
    this.handlePlayerInput(dt);
    for (const e of this.world.entities) {
      if (e.isAI && e.alive) updateAI(e, this.world, dt);
    }
    for (const e of this.world.entities) e.update(dt, this.world);
    this.updateRespawns();
    updateProjectiles(this.world, dt);
    updateTurrets(this.world, dt);
    updateEffects(this.world);
    if (this.zone) this.updateZone(dt);
    if (this.timeRemaining <= 0) this.endMatch();
  }

  handlePlayerInput(dt) {
    const pe = this.playerEntity;
    if (!pe.alive) { this.input.clearFrame(); return; }
    const move = this.input.getMove();
    applyMovement(pe, move.x, move.y, dt, this.world);

    const screenAim = this.input.getAimPoint(pe.x - this.camera.x, pe.y - this.camera.y);
    const worldAim = { x: screenAim.x + this.camera.x, y: screenAim.y + this.camera.y };
    this.lastAim = worldAim;
    pe.facing = Math.atan2(worldAim.y - pe.y, worldAim.x - pe.x);

    // One click, one swing. Touch players hold the aim stick to keep attacking.
    if (this.input.consumePending('attack') || this.input.isTouchFiring()) {
      useBasicAttack(pe, worldAim.x, worldAim.y, this.world);
    }
    for (let i = 0; i < 4; i++) {
      if (this.input.consumePending('ability' + (i + 1))) useAbility(pe, i, worldAim.x, worldAim.y, this.world);
    }
    if (this.input.consumePending('ultimate')) useUltimate(pe, worldAim.x, worldAim.y, this.world);
    this.input.clearFrame();
  }

  updateRespawns() {
    for (const e of this.world.entities) {
      if (e.alive || e.respawnAt === null) continue;
      if (this.world.time >= e.respawnAt) {
        const p = this.safeSpawnPoint(e);
        e.respawnNow(p.x, p.y, this.world);
        spawnEffect(this.world, { type: 'spawnring', x: p.x, y: p.y, color: e.sheet.color, life: 0.8 });
      }
    }
  }

  // Respawn on the fighter's original spawn point, unless the storm has already
  // swallowed it — then drop them somewhere safe inside the circle instead.
  safeSpawnPoint(entity) {
    let x = entity.spawnX, y = entity.spawnY;
    if (this.zone) {
      const d = Math.hypot(x - this.zone.cx, y - this.zone.cy);
      if (d > this.zone.radius * 0.8) {
        const ang = Math.random() * Math.PI * 2;
        const r = this.zone.radius * 0.55 * Math.random();
        x = this.zone.cx + Math.cos(ang) * r;
        y = this.zone.cy + Math.sin(ang) * r;
      }
    }
    return clampToMapBounds(x, y, this.world);
  }

  updateZone(dt) {
    const z = this.zone;
    z.elapsed += dt;
    const t = Math.min(1, z.elapsed / z.duration);
    z.radius = z.startRadius + (z.endRadius - z.startRadius) * t;
    z.nextDamageTick -= dt;
    if (z.nextDamageTick <= 0) {
      z.nextDamageTick = 1;
      for (const e of this.world.entities) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - z.cx, e.y - z.cy);
        if (d > z.radius) e.takeDamage(e.maxHp * 0.05, null, this.world);
      }
    }
  }

  updateCamera() {
    const pe = this.playerEntity;
    if (pe.alive) { this._lastPlayerX = pe.x; this._lastPlayerY = pe.y; }
    const focusX = this._lastPlayerX, focusY = this._lastPlayerY;
    this.camera.x = clampNum(focusX - this.canvas.width / 2, 0, Math.max(0, this.map.width - this.canvas.width));
    this.camera.y = clampNum(focusY - this.canvas.height / 2, 0, Math.max(0, this.map.height - this.canvas.height));
  }

  handleDeath(entity, killer) {
    entity.respawnAt = this.world.time + this.respawnDelay;
    entity.deaths++;
    this.deaths[entity.team] = (this.deaths[entity.team] || 0) + 1;
    // Storm and self-inflicted deaths don't feed anyone's score.
    if (killer && killer.team !== undefined && killer.team !== entity.team) {
      this.scores[killer.team] = (this.scores[killer.team] || 0) + 1;
    }
    this.onKillFeed(entity, killer);
  }

  // Teams ranked by kills, then by fewest deaths, then by team id so there is
  // always exactly one winner.
  getStandings() {
    return Object.keys(this.scores)
      .map(t => ({ team: Number(t), name: this.teamNames[t], kills: this.scores[t], deaths: this.deaths[t] }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.team - b.team);
  }

  endMatch() {
    if (this.ended) return;
    this.ended = true;
    const standings = this.getStandings();
    const winner = standings[0];
    const playerTeam = this.playerEntity.team;
    const playerStanding = standings.find(s => s.team === playerTeam);
    const tiedOnKills = standings.filter(s => s.kills === winner.kills).length > 1;
    this.onEnd({
      playerWon: winner.team === playerTeam,
      wonOnTiebreak: winner.team === playerTeam && tiedOnKills,
      lostOnTiebreak: winner.team !== playerTeam && playerStanding.kills === winner.kills,
      winnerTeam: winner.team,
      standings,
      playerKills: this.playerEntity.kills,
      playerDeaths: this.playerEntity.deaths
    });
  }
}

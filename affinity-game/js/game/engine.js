// Drives a single match: owns the world, steps AI/physics/combat each frame,
// tracks the shrinking storm zone for battle-royale modes, and the camera.

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

    this.world = {
      time: 0, map, entities: [], projectiles: [], turrets: [], effects: [],
      onDeath: (entity, killer) => this.handleDeath(entity, killer)
    };

    assignSpawnPositions(roster, map, mode);
    this.world.entities = roster.map(sheet => new Entity(sheet, sheet.x, sheet.y, this.world));
    this.playerEntity = this.world.entities.find(e => e.sheet === playerSheet);

    this.zone = mode.zone ? {
      cx: map.width / 2, cy: map.height / 2,
      startRadius: Math.max(map.width, map.height) * 0.72,
      radius: Math.max(map.width, map.height) * 0.72,
      endRadius: 240, duration: 150, elapsed: 0, nextDamageTick: 1
    } : null;

    this._lastPlayerX = this.playerEntity.x;
    this._lastPlayerY = this.playerEntity.y;
  }

  update(dt) {
    if (this.ended) return;
    this.world.time += dt;
    this.updateCamera();
    this.handlePlayerInput(dt);
    for (const e of this.world.entities) {
      if (e.isAI && e.alive) updateAI(e, this.world, dt);
    }
    for (const e of this.world.entities) e.update(dt, this.world);
    updateProjectiles(this.world, dt);
    updateTurrets(this.world, dt);
    updateEffects(this.world);
    if (this.zone) this.updateZone(dt);
    this.checkWinCondition();
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

    if (this.input.isFiring()) useBasicAttack(pe, worldAim.x, worldAim.y, this.world);
    for (let i = 0; i < 4; i++) {
      if (this.input.consumePending('ability' + (i + 1))) useAbility(pe, i, worldAim.x, worldAim.y, this.world);
    }
    if (this.input.consumePending('ultimate')) useUltimate(pe, worldAim.x, worldAim.y, this.world);
    this.input.clearFrame();
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
    this.onKillFeed(entity, killer);
  }

  checkWinCondition() {
    if (this.ended) return;
    const aliveTeams = new Set(this.world.entities.filter(e => e.alive).map(e => e.team));
    if (aliveTeams.size <= 1) {
      this.ended = true;
      const winnerTeam = aliveTeams.size === 1 ? [...aliveTeams][0] : null;
      const playerWon = winnerTeam !== null && winnerTeam === this.playerEntity.team;
      this.onEnd({ playerWon, winnerTeam });
    }
  }
}

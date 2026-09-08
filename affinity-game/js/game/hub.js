// The main island hub: free walk-around area with decorations and portals
// that open the mode/map select UI. No combat happens here.

const PORTAL_INTERACT_RADIUS = 80;

class HubEngine {
  constructor({ map, input, canvas, characterSheet, onPortalEnter }) {
    this.map = map;
    this.input = input;
    this.canvas = canvas;
    this.onPortalEnter = onPortalEnter;
    this.camera = { x: 0, y: 0 };
    this.player = {
      x: map.spawnPoint.x, y: map.spawnPoint.y, radius: 18, facing: 0,
      alive: true, isStunned: false, speedMultiplier: 1,
      sheet: characterSheet
    };
    this.nearPortal = null;
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    const move = this.input.getMove();
    applyMovement(this.player, move.x, move.y, dt, { map: this.map });

    this.camera.x = clampNum(this.player.x - this.canvas.width / 2, 0, Math.max(0, this.map.width - this.canvas.width));
    this.camera.y = clampNum(this.player.y - this.canvas.height / 2, 0, Math.max(0, this.map.height - this.canvas.height));

    this.nearPortal = this.map.portals.find(p => Math.hypot(p.x - this.player.x, p.y - this.player.y) < PORTAL_INTERACT_RADIUS) || null;
    this.input.setInteractVisible(!!this.nearPortal);
    if (this.nearPortal && this.input.consumePending('interact')) {
      this.onPortalEnter(this.nearPortal.id);
    }
    this.input.clearFrame();
  }
}

// Unified input for desktop (keyboard + mouse) and mobile (twin virtual
// joysticks + on-screen buttons). Produces a simple per-frame snapshot that
// the match/hub loop consumes without caring which device is in use.

class InputController {
  constructor(canvas, hudRoot) {
    this.canvas = canvas;
    this.hudRoot = hudRoot;
    this.keys = new Set();
    this.mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };
    this.moveJoystick = null; // { pointerId, originX, originY, x, y }
    this.aimJoystick = null;
    this.actions = { ability1: false, ability2: false, ability3: false, ability4: false, ultimate: false, interact: false };
    this.pendingActions = new Set(); // one-shot presses this frame
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Pointer input listens on the window, not the canvas: the HUD/screen
    // layers sit on top of the canvas, so canvas-bound listeners never fire.
    // Anything landing on real UI (buttons, panels) is ignored instead.
    window.addEventListener('keydown', e => this.onKeyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('mousemove', e => this.onMouseMove(e));
    window.addEventListener('mousedown', e => {
      if (e.button !== 0 || this._isUiTarget(e)) return;
      this.onMouseMove(e);
      this.mouse.down = true;
      this.pendingActions.add('attack');
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    window.addEventListener('blur', () => { this.mouse.down = false; this.keys.clear(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', e => this.onPointerUp(e));
    window.addEventListener('pointercancel', e => this.onPointerUp(e));

    this._buildMobileButtons();
  }

  // True when the event landed on interactive UI rather than the play area.
  _isUiTarget(e) {
    const t = e.target;
    return !!(t && t.closest && t.closest(
      'button, input, .menu-panel, .modal-panel, .card-grid, .wizard-footer, ' +
      '.role-tabs, .hub-topbar, .mobile-buttons, .hud-abilities, .pause-overlay'
    ));
  }

  onKeyDown(e) {
    this.keys.add(e.code);
    const map = { Digit1: 'ability1', Digit2: 'ability2', Digit3: 'ability3', Digit4: 'ability4', KeyR: 'ultimate', Space: 'ultimate', KeyE: 'interact' };
    if (map[e.code]) this.pendingActions.add(map[e.code]);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    this.mouse.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
  }

  _rectPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  onPointerDown(e) {
    if (e.pointerType !== 'touch') return;
    if (this._isUiTarget(e)) return;
    const p = this._rectPos(e);
    const half = this.canvas.width / 2;
    if (p.x < half && !this.moveJoystick) {
      this.moveJoystick = { pointerId: e.pointerId, originX: p.x, originY: p.y, x: p.x, y: p.y };
    } else if (p.x >= half && !this.aimJoystick) {
      this.aimJoystick = { pointerId: e.pointerId, originX: p.x, originY: p.y, x: p.x, y: p.y };
    }
  }

  onPointerMove(e) {
    const p = this._rectPos(e);
    if (this.moveJoystick && e.pointerId === this.moveJoystick.pointerId) {
      this.moveJoystick.x = p.x; this.moveJoystick.y = p.y;
    } else if (this.aimJoystick && e.pointerId === this.aimJoystick.pointerId) {
      this.aimJoystick.x = p.x; this.aimJoystick.y = p.y;
    }
  }

  onPointerUp(e) {
    if (this.moveJoystick && e.pointerId === this.moveJoystick.pointerId) this.moveJoystick = null;
    if (this.aimJoystick && e.pointerId === this.aimJoystick.pointerId) this.aimJoystick = null;
  }

  _buildMobileButtons() {
    this.mobileUI = document.createElement('div');
    this.mobileUI.className = 'mobile-buttons';
    this.mobileUI.innerHTML = `
      <button data-action="ability1" class="ab-btn">1</button>
      <button data-action="ability2" class="ab-btn">2</button>
      <button data-action="ability3" class="ab-btn">3</button>
      <button data-action="ability4" class="ab-btn">4</button>
      <button data-action="ultimate" class="ult-btn">ULT</button>
      <button data-action="interact" class="interact-btn">E</button>
    `;
    this.hudRoot.appendChild(this.mobileUI);
    this.mobileUI.querySelectorAll('button').forEach(btn => {
      const act = btn.dataset.action;
      const fire = ev => { ev.preventDefault(); ev.stopPropagation(); this.pendingActions.add(act); };
      btn.addEventListener('pointerdown', fire);
    });
  }

  setInteractVisible(visible) {
    const btn = this.mobileUI.querySelector('.interact-btn');
    if (btn) btn.style.visibility = visible ? 'visible' : 'hidden';
  }

  // ctx: 'hidden' | 'hub' | 'match' — controls which touch buttons are shown.
  setContext(ctx) {
    if (!this.isTouch) { this.mobileUI.style.display = 'none'; return; }
    if (ctx === 'hidden') { this.mobileUI.style.display = 'none'; return; }
    this.mobileUI.style.display = 'flex';
    this.mobileUI.querySelectorAll('.ab-btn, .ult-btn').forEach(b => b.style.display = ctx === 'match' ? '' : 'none');
    const interactBtn = this.mobileUI.querySelector('.interact-btn');
    interactBtn.style.display = ctx === 'hub' ? '' : 'none';
    if (ctx !== 'hub') interactBtn.style.visibility = 'hidden';
  }

  // Returns { moveX, moveY } normalized-ish direction from -1..1
  getMove() {
    if (this.moveJoystick) {
      const dx = this.moveJoystick.x - this.moveJoystick.originX;
      const dy = this.moveJoystick.y - this.moveJoystick.originY;
      const len = Math.hypot(dx, dy) || 1;
      const clampLen = Math.min(len, 50) / 50;
      return { x: (dx / len) * clampLen, y: (dy / len) * clampLen };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return { x, y };
  }

  // Returns world-space aim point given the entity's screen position and camera.
  getAimPoint(entityScreenX, entityScreenY) {
    if (this.aimJoystick) {
      const dx = this.aimJoystick.x - this.aimJoystick.originX;
      const dy = this.aimJoystick.y - this.aimJoystick.originY;
      if (Math.hypot(dx, dy) > 8) return { x: entityScreenX + dx * 6, y: entityScreenY + dy * 6, active: true };
      return { x: entityScreenX + 1, y: entityScreenY, active: false };
    }
    return { x: this.mouse.x, y: this.mouse.y, active: true };
  }

  // A click queues one immediate attack ('attack' in pendingActions); holding
  // the button keeps swinging at the character's own attack speed.
  isHoldFiring() {
    return this.mouse.down;
  }

  // Drop anything queued up, so clicks on menus never leak into the next match.
  clearPending() {
    this.pendingActions.clear();
    this.mouse.down = false;
    this.moveJoystick = null;
    this.aimJoystick = null;
  }

  // Touch players hold the aim stick to keep swinging; tapping repeatedly on a
  // phone would be miserable.
  isTouchFiring() {
    if (!this.aimJoystick) return false;
    const dx = this.aimJoystick.x - this.aimJoystick.originX;
    const dy = this.aimJoystick.y - this.aimJoystick.originY;
    return Math.hypot(dx, dy) > 8;
  }

  consumePending(name) {
    if (this.pendingActions.has(name)) { this.pendingActions.delete(name); return true; }
    return false;
  }

  clearFrame() {
    this.pendingActions.clear();
  }
}

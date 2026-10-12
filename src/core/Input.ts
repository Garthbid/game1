import { CONFIG } from '../config';

/** Game actions. Keyboard codes and touch buttons both map onto these. */
export type Action = 'jump' | 'dash' | 'reload' | 'pause' | 'debug';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'jump',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyR: 'reload',
  Escape: 'pause',
  KeyP: 'pause',
  Backquote: 'debug',
};

/**
 * Keyboard, mouse, pointer lock and the virtual touch controls, merged into one view:
 * a move axis, a look delta in radians, a fire flag and edge-triggered actions.
 */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private held = new Set<Action>();
  private mouseDown = false;
  private lookX = 0; // radians, accumulated until consumed
  private lookY = 0;
  locked = false;
  /** When true, left mouse fires without pointer lock (desktop testing with ?nolock). */
  allowUnlockedMouse = false;
  /** Look speed multiplier from the settings screen. */
  sensitivity = 1;
  /** Per-frame multiplier the game sets for aim friction on touch. */
  assist = 1;

  // Virtual controls, driven by TouchControls
  readonly stick = { x: 0, y: 0 }; // -1..1 each, y < 0 is forward
  touchFire = false;

  onLockChange: (locked: boolean) => void = () => {};
  onAction: (action: Action, code: string) => void = () => {};
  /** Any user gesture on the game surface (used to unlock audio on mobile). */
  onGesture: () => void = () => {};

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a) {
        this.pressed.add(a);
        this.held.add(a);
        this.onAction(a, e.code);
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
      this.mouseDown = false;
      this.touchFire = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = CONFIG.player.mouseSensitivity * this.sensitivity * this.assist;
      this.lookX += e.movementX * s;
      this.lookY += e.movementY * s;
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0 && (this.locked || this.allowUnlockedMouse)) this.mouseDown = true;
      this.onGesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.mouseDown = false;
      this.onLockChange(this.locked);
    });
  }

  requestLock() {
    // Some browsers return a promise that rejects if the user re-locks too soon after Esc.
    const res = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
    if (res && typeof res.catch === 'function') res.catch(() => {});
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Touch look, in CSS pixels of thumb travel. */
  touchLook(dx: number, dy: number) {
    const s = CONFIG.player.touchSensitivity * this.sensitivity * this.assist;
    this.lookX += dx * s;
    this.lookY += dy * s;
  }

  /** Touch buttons call this on press and release. */
  virtualAction(action: Action, down: boolean) {
    if (down) {
      if (!this.held.has(action)) this.pressed.add(action);
      this.held.add(action);
      this.onAction(action, 'touch');
    } else {
      this.held.delete(action);
    }
  }

  /** Movement wish direction in the player's local frame, length 0..1. The stick wins when it is moved. */
  moveAxis(out: { x: number; z: number }) {
    const sx = this.stick.x;
    const sy = this.stick.y;
    if (sx * sx + sy * sy > 0.01) {
      out.x = sx;
      out.z = sy;
      const len = Math.hypot(sx, sy);
      if (len > 1) {
        out.x /= len;
        out.z /= len;
      }
      return;
    }
    let fx = 0;
    let fz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) fx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz);
    out.x = len > 0 ? fx / len : 0;
    out.z = len > 0 ? fz / len : 0;
  }

  get fireHeld(): boolean {
    return this.mouseDown || this.touchFire;
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** True once per press, until the next fixed step clears it. */
  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  clearPressed() {
    this.pressed.clear();
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  reset() {
    this.keys.clear();
    this.pressed.clear();
    this.held.clear();
    this.mouseDown = false;
    this.touchFire = false;
    this.stick.x = this.stick.y = 0;
    this.lookX = this.lookY = 0;
  }
}

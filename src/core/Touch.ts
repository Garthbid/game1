import type { Action, Input } from './Input';

interface StickTouch {
  kind: 'stick';
  ox: number;
  oy: number;
}
interface LookTouch {
  kind: 'look';
  lx: number;
  ly: number;
}
type Tracked = StickTouch | LookTouch;

const STICK_RADIUS = 56; // CSS px of knob travel for full speed
const STICK_ZONE = 0.45; // left fraction of the screen that spawns the stick

/**
 * On-screen controls for phones and tablets. The left part of the screen is a floating joystick
 * that appears under the thumb; the rest is a look surface; buttons on the right fire, dash,
 * jump and reload. Everything feeds the shared Input so the game logic never knows the difference.
 */
export class TouchControls {
  private readonly layer: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly pointers = new Map<number, Tracked>();
  private readonly dashCooldown: HTMLElement;
  private active = false;

  constructor(private readonly input: Input) {
    this.layer = document.getElementById('touch')!;
    this.stick = document.getElementById('stick')!;
    this.knob = document.getElementById('stick-knob')!;
    this.dashCooldown = document.getElementById('dash-cd')!;

    const layer = this.layer;
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const el of Array.from(layer.querySelectorAll<HTMLElement>('[data-action]'))) {
      const action = el.dataset.action as Action | 'fire';
      const press = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        this.input.onGesture();
        if (action === 'fire') this.input.touchFire = true;
        else this.input.virtualAction(action, true);
      };
      const release = (e: PointerEvent) => {
        e.stopPropagation();
        el.classList.remove('down');
        if (action === 'fire') this.input.touchFire = false;
        else this.input.virtualAction(action, false);
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  /** Show while playing, hide on menus so taps reach the buttons underneath. */
  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    this.layer.classList.toggle('active', on);
    if (!on) this.releaseAll();
  }

  /** 0..1 fraction of the dash cooldown still to go, drawn on the dash button. */
  setDashCooldown(frac: number) {
    this.dashCooldown.style.transform = `scaleY(${frac.toFixed(3)})`;
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.input.onGesture();
    this.layer.setPointerCapture(e.pointerId);
    if (e.clientX < window.innerWidth * STICK_ZONE && !this.hasStick()) {
      this.pointers.set(e.pointerId, { kind: 'stick', ox: e.clientX, oy: e.clientY });
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.stick.classList.add('visible');
    } else {
      this.pointers.set(e.pointerId, { kind: 'look', lx: e.clientX, ly: e.clientY });
    }
  }

  private move(e: PointerEvent) {
    const t = this.pointers.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    if (t.kind === 'stick') {
      let dx = e.clientX - t.ox;
      let dy = e.clientY - t.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      // A small dead zone, then a linear ramp to full speed
      const mag = Math.max(0, Math.min(1, (len - 6) / (STICK_RADIUS - 6)));
      const inv = len > 0 ? mag / len : 0;
      this.input.stick.x = dx * inv;
      this.input.stick.y = dy * inv;
    } else {
      // Browsers batch touch samples; walk them for smoother look on fast flicks
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        this.input.touchLook(ev.clientX - t.lx, ev.clientY - t.ly);
        t.lx = ev.clientX;
        t.ly = ev.clientY;
      }
    }
  }

  private up(e: PointerEvent) {
    const t = this.pointers.get(e.pointerId);
    if (!t) return;
    this.pointers.delete(e.pointerId);
    if (t.kind === 'stick') this.dropStick();
  }

  private hasStick(): boolean {
    for (const t of this.pointers.values()) if (t.kind === 'stick') return true;
    return false;
  }

  private dropStick() {
    this.input.stick.x = this.input.stick.y = 0;
    this.stick.classList.remove('visible');
  }

  private releaseAll() {
    this.pointers.clear();
    this.dropStick();
    this.input.touchFire = false;
    for (const el of Array.from(this.layer.querySelectorAll<HTMLElement>('[data-action]'))) el.classList.remove('down');
  }
}

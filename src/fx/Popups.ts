import * as THREE from 'three';

export type PopupKind = 'dmg' | 'crit' | 'kill' | 'text';

interface Popup {
  el: HTMLElement;
  pos: THREE.Vector3;
  life: number;
  maxLife: number;
  value: number;
  kind: PopupKind;
  owner: object | null;
}

const v = new THREE.Vector3();

/**
 * Floating damage numbers and kill labels. DOM elements anchored to world points and
 * projected each frame. Hits on the same enemy in quick succession add up into one number.
 */
export class Popups {
  private readonly pool: Popup[] = [];
  private next = 0;

  constructor(private readonly layer: HTMLElement, size = 24) {
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      layer.appendChild(el);
      this.pool.push({ el, pos: new THREE.Vector3(), life: 0, maxLife: 1, value: 0, kind: 'dmg', owner: null });
    }
  }

  damage(at: THREE.Vector3, amount: number, crit: boolean, owner: object) {
    // Merge into a fresh popup for the same enemy so eight shots a second read as one climbing number
    for (const p of this.pool) {
      if (p.life > 0 && p.owner === owner && p.kind !== 'kill' && p.maxLife - p.life < 0.3) {
        p.value += amount;
        p.pos.copy(at);
        p.life = p.maxLife;
        if (crit) p.kind = 'crit';
        this.render(p);
        return;
      }
    }
    this.spawn(at, crit ? 'crit' : 'dmg', amount, '', owner, 0.7);
  }

  kill(at: THREE.Vector3, points: number, mult: number) {
    this.spawn(at, 'kill', points, mult > 1 ? `+${points}  ×${mult}` : `+${points}`, null, 0.9);
  }

  text(at: THREE.Vector3, label: string, kind: PopupKind = 'text') {
    this.spawn(at, kind, 0, label, null, 1);
  }

  private spawn(at: THREE.Vector3, kind: PopupKind, value: number, label: string, owner: object | null, life: number) {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    p.pos.copy(at);
    p.kind = kind;
    p.value = value;
    p.owner = owner;
    p.life = life;
    p.maxLife = life;
    p.el.dataset.label = label;
    this.render(p);
    p.el.className = `popup ${kind} visible`;
  }

  private render(p: Popup) {
    const label = p.el.dataset.label || '';
    if (p.kind === 'crit') p.el.textContent = `${Math.round(p.value)} HEADSHOT`;
    else if (p.kind === 'dmg') p.el.textContent = String(Math.round(p.value));
    else p.el.textContent = label;
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.el.className = 'popup';
        p.owner = null;
        continue;
      }
      const age = p.maxLife - p.life;
      v.copy(p.pos).project(camera);
      if (v.z > 1 || v.z < -1) {
        p.el.style.opacity = '0';
        continue;
      }
      const x = ((v.x + 1) / 2) * width;
      const y = ((1 - v.y) / 2) * height - age * 55;
      const fade = Math.min(1, p.life / 0.25);
      const pop = p.kind === 'kill' || p.kind === 'crit' ? 1 + Math.max(0, 0.15 - age) * 3 : 1;
      p.el.style.opacity = fade.toFixed(2);
      p.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) scale(${pop.toFixed(2)})`;
    }
  }

  clear() {
    for (const p of this.pool) {
      p.life = 0;
      p.owner = null;
      p.el.className = 'popup';
    }
  }
}

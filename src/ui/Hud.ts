import { CONFIG } from '../config';
import type { Upgrade } from '../game/Upgrades';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
};

export type Screen = 'start' | 'pause' | 'upgrade' | 'over' | null;

export interface HudState {
  health: number;
  maxHealth: number;
  ammo: number;
  magazine: number;
  reloading: boolean;
  wave: number;
  enemiesLeft: number;
  score: number;
  streak: number;
  mult: number;
  comboFrac: number;
}

/** All DOM updates for the HUD and menus. Values are cached so the DOM is only touched on change. */
export class Hud {
  private readonly hud = $('hud');
  private readonly healthFill = $('health-fill');
  private readonly healthText = $('health-text');
  private readonly ammo = $('ammo');
  private readonly wave = $('wave');
  private readonly enemies = $('enemies');
  private readonly score = $('score');
  private readonly banner = $('banner');
  private readonly bannerSub = $('banner-sub');
  private readonly hitmarker = $('hitmarker');
  private readonly hurt = $('hurt');
  private readonly heal = $('heal');
  private readonly debug = $('debug');
  private readonly combo = $('combo');
  private readonly comboMult = $('combo-mult');
  private readonly comboLabel = $('combo-label');
  private readonly comboFill = $('combo-fill');
  private readonly dmgDir = $('dmg-dir');
  private readonly cards = $('cards');
  private readonly screens: Record<Exclude<Screen, null>, HTMLElement> = {
    start: $('screen-start'),
    pause: $('screen-pause'),
    upgrade: $('screen-upgrade'),
    over: $('screen-over'),
  };

  private cache = new Map<HTMLElement, string>();
  private bannerLeft = 0;
  private hitLeft = 0;
  private hurtLevel = 0;
  private healLevel = 0;
  private dmgDirLeft = 0;
  private lastMult = 1;
  debugOn = false;

  private set(el: HTMLElement, text: string) {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }

  show(screen: Screen) {
    for (const [name, el] of Object.entries(this.screens)) el.classList.toggle('visible', name === screen);
    this.hud.classList.toggle('visible', screen === null || screen === 'pause' || screen === 'upgrade');
  }

  setBest(score: number, wave: number) {
    $('best').textContent = score > 0 ? `BEST  ${score.toLocaleString()}  ·  WAVE ${wave}` : '';
  }

  setFinal(score: number, wave: number, kills: number, bestCombo: number, newBest: boolean) {
    $('over-score').textContent = score.toLocaleString();
    $('over-wave').textContent = String(wave);
    $('over-kills').textContent = String(kills);
    $('over-combo').textContent = bestCombo > 0 ? `×${bestCombo}` : '–';
    $('new-best').classList.toggle('visible', newBest);
  }

  /** Fills the upgrade screen. The callback receives the chosen upgrade. */
  showUpgrades(wave: number, options: Upgrade[], taken: Map<string, number>, onPick: (u: Upgrade) => void) {
    $('upgrade-kicker').textContent = `WAVE ${wave} CLEARED`;
    this.cards.replaceChildren();
    options.forEach((u, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.style.animationDelay = `${i * 70}ms`;
      const n = taken.get(u.id) ?? 0;
      b.innerHTML =
        `<div class="glyph">${u.glyph}</div>` +
        `<div class="name">${u.name}${n > 0 ? ` <em>×${n + 1}</em>` : ''}</div>` +
        `<div class="desc">${u.desc}</div>`;
      b.addEventListener('click', () => onPick(u));
      this.cards.appendChild(b);
    });
    this.show('upgrade');
  }

  update(s: HudState) {
    const pct = Math.max(0, s.health / s.maxHealth);
    const w = `${(pct * 100).toFixed(1)}%`;
    if (this.cache.get(this.healthFill) !== w) {
      this.cache.set(this.healthFill, w);
      this.healthFill.style.width = w;
      this.healthFill.classList.toggle('low', pct <= 0.3);
    }
    this.set(this.healthText, `${Math.ceil(s.health)} / ${s.maxHealth}`);
    this.set(this.ammo, s.reloading ? 'RELOADING' : `${s.ammo} / ${s.magazine}`);
    this.ammo.classList.toggle('empty', !s.reloading && s.ammo === 0);
    this.ammo.classList.toggle('lowammo', !s.reloading && s.ammo > 0 && s.ammo <= Math.ceil(s.magazine * 0.2));
    this.set(this.wave, s.wave > 0 ? `WAVE ${s.wave}` : 'GET READY');
    this.set(this.enemies, s.wave > 0 ? `${s.enemiesLeft} LEFT` : '');
    this.set(this.score, s.score.toLocaleString());

    const on = s.streak >= 2;
    this.combo.classList.toggle('visible', on);
    if (on) {
      this.set(this.comboMult, `×${s.mult}`);
      this.set(this.comboLabel, `${s.streak} COMBO`);
      this.comboFill.style.transform = `scaleX(${s.comboFrac.toFixed(3)})`;
      if (s.mult > this.lastMult) {
        this.combo.classList.remove('bump');
        void this.combo.offsetWidth; // restart the animation
        this.combo.classList.add('bump');
      }
    }
    this.lastMult = s.mult;
  }

  showBanner(title: string, sub = '', seconds = 1.8) {
    this.set(this.banner, title);
    this.set(this.bannerSub, sub);
    this.banner.parentElement!.classList.add('visible');
    this.bannerLeft = seconds;
  }

  setBannerSub(sub: string) {
    this.set(this.bannerSub, sub);
  }

  hitMarker(kill: boolean, headshot = false) {
    this.hitLeft = 0.12;
    this.hitmarker.classList.add('visible');
    this.hitmarker.classList.toggle('kill', kill);
    this.hitmarker.classList.toggle('head', headshot && !kill);
  }

  hurtFlash() {
    this.hurtLevel = 0.55;
  }

  /** Red wedge at the screen edge pointing toward where damage came from. 0 = straight ahead, clockwise. */
  damageFrom(angle: number) {
    this.dmgDir.style.transform = `rotate(${angle.toFixed(3)}rad)`;
    this.dmgDirLeft = 0.9;
    this.dmgDir.style.opacity = '1';
  }

  healFlash() {
    this.healLevel = 0.35;
  }

  /** Per-frame fades. */
  tick(dt: number) {
    if (this.bannerLeft > 0) {
      this.bannerLeft -= dt;
      if (this.bannerLeft <= 0) this.banner.parentElement!.classList.remove('visible');
    }
    if (this.hitLeft > 0) {
      this.hitLeft -= dt;
      if (this.hitLeft <= 0) this.hitmarker.classList.remove('visible');
    }
    if (this.hurtLevel > 0 || this.hurt.style.opacity !== '0') {
      this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.6);
      this.hurt.style.opacity = this.hurtLevel.toFixed(3);
    }
    if (this.healLevel > 0 || this.heal.style.opacity !== '0') {
      this.healLevel = Math.max(0, this.healLevel - dt * 1.2);
      this.heal.style.opacity = this.healLevel.toFixed(3);
    }
    if (this.dmgDirLeft > 0) {
      this.dmgDirLeft -= dt;
      this.dmgDir.style.opacity = Math.min(1, this.dmgDirLeft / 0.4).toFixed(2);
    }
  }

  setDebug(text: string) {
    this.debug.classList.toggle('visible', this.debugOn);
    if (this.debugOn) this.set(this.debug, text);
  }

  clearTransient() {
    this.bannerLeft = 0;
    this.banner.parentElement!.classList.remove('visible');
    this.hurtLevel = 0;
    this.healLevel = 0;
    this.dmgDirLeft = 0;
    this.hurt.style.opacity = '0';
    this.heal.style.opacity = '0';
    this.dmgDir.style.opacity = '0';
    this.combo.classList.remove('visible');
    this.lastMult = 1;
  }

  get magazineLabel(): number {
    return CONFIG.weapon.magazine;
  }
}

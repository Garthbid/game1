import { CONFIG } from '../config';

/** Everything an upgrade can change. One object per run, read live by the player and weapon. */
export class RunStats {
  damageMul = 1;
  fireRateMul = 1;
  magBonus = 0;
  reloadMul = 1;
  spreadMul = 1;
  speedMul = 1;
  dashCooldownMul = 1;
  maxHealthBonus = 0;
  vampire = 0; // health per kill
  pierce = false;
  explosive = false;
  doubleTap = 0; // chance of a free extra bullet
  secondWind = false;
  readonly taken = new Map<string, number>();

  reset() {
    this.damageMul = 1;
    this.fireRateMul = 1;
    this.magBonus = 0;
    this.reloadMul = 1;
    this.spreadMul = 1;
    this.speedMul = 1;
    this.dashCooldownMul = 1;
    this.maxHealthBonus = 0;
    this.vampire = 0;
    this.pierce = false;
    this.explosive = false;
    this.doubleTap = 0;
    this.secondWind = false;
    this.taken.clear();
  }

  get damage() {
    return CONFIG.weapon.damage * this.damageMul;
  }
  get fireRate() {
    return CONFIG.weapon.fireRate * this.fireRateMul;
  }
  get magazine() {
    return CONFIG.weapon.magazine + this.magBonus;
  }
  get reloadTime() {
    return CONFIG.weapon.reloadTime * this.reloadMul;
  }
  get maxHealth() {
    return CONFIG.player.maxHealth + this.maxHealthBonus;
  }
}

export interface Upgrade {
  id: string;
  name: string;
  glyph: string;
  desc: string;
  /** How many times it can be taken in one run. */
  max: number;
  apply(s: RunStats): void;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'damage',
    name: 'Hollow Points',
    glyph: '◆',
    desc: '+25% damage',
    max: 4,
    apply: (s) => (s.damageMul += 0.25),
  },
  {
    id: 'firerate',
    name: 'Rapid Fire',
    glyph: '≡',
    desc: '+25% fire rate',
    max: 3,
    apply: (s) => (s.fireRateMul += 0.25),
  },
  {
    id: 'mag',
    name: 'Extended Mag',
    glyph: '▮',
    desc: '+15 rounds per magazine',
    max: 3,
    apply: (s) => (s.magBonus += 15),
  },
  {
    id: 'reload',
    name: 'Quick Hands',
    glyph: '↻',
    desc: 'Reload 35% faster',
    max: 2,
    apply: (s) => (s.reloadMul *= 0.65),
  },
  {
    id: 'aim',
    name: 'Steady Aim',
    glyph: '◎',
    desc: 'Half the bullet spread',
    max: 2,
    apply: (s) => (s.spreadMul *= 0.5),
  },
  {
    id: 'speed',
    name: 'Fleet Foot',
    glyph: '»',
    desc: '+15% move speed, dash recharges 30% faster',
    max: 3,
    apply: (s) => {
      s.speedMul += 0.15;
      s.dashCooldownMul *= 0.7;
    },
  },
  {
    id: 'vampire',
    name: 'Vampire',
    glyph: '♥',
    desc: 'Heal 4 health on every kill',
    max: 3,
    apply: (s) => (s.vampire += 4),
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    glyph: '▲',
    desc: '+30 max health, and heal 30 now',
    max: 3,
    apply: (s) => (s.maxHealthBonus += 30),
  },
  {
    id: 'pierce',
    name: 'Piercing Rounds',
    glyph: '→',
    desc: 'Bullets pass through the first enemy and hit a second',
    max: 1,
    apply: (s) => (s.pierce = true),
  },
  {
    id: 'explosive',
    name: 'Explosive Rounds',
    glyph: '✦',
    desc: 'Kills blast 40 damage to enemies within 3 m',
    max: 1,
    apply: (s) => (s.explosive = true),
  },
  {
    id: 'doubletap',
    name: 'Double Tap',
    glyph: '⁞',
    desc: '25% chance each shot fires a free second bullet',
    max: 2,
    apply: (s) => (s.doubleTap += 0.25),
  },
  {
    id: 'secondwind',
    name: 'Second Wind',
    glyph: '✚',
    desc: 'Once per run, survive a killing blow with 35 health',
    max: 1,
    apply: (s) => (s.secondWind = true),
  },
];

/** Three distinct upgrades the player can still take. */
export function rollUpgrades(stats: RunStats, count = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => (stats.taken.get(u.id) ?? 0) < u.max);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function takeUpgrade(stats: RunStats, u: Upgrade) {
  u.apply(stats);
  stats.taken.set(u.id, (stats.taken.get(u.id) ?? 0) + 1);
}

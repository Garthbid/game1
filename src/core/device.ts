/** Touch detection. Static at boot, and flipped on the first real touch so a laptop with a touchscreen also works. */
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const noHover = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

export const device = {
  touch: coarse || noHover,
};

export function markTouch() {
  if (device.touch) return;
  device.touch = true;
  document.body.classList.add('touch');
}

if (device.touch) document.body.classList.add('touch');
window.addEventListener('touchstart', markTouch, { passive: true, once: true });

/** Settings that persist between visits. */
export interface Settings {
  autoFire: boolean;
  sensitivity: number; // 0.5 .. 2, multiplies look speed
}

const KEY = 'holdout.settings';

export function loadSettings(): Settings {
  const def: Settings = { autoFire: device.touch, sensitivity: 1 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      autoFire: typeof s.autoFire === 'boolean' ? s.autoFire : def.autoFire,
      sensitivity: typeof s.sensitivity === 'number' && s.sensitivity > 0 ? s.sensitivity : def.sensitivity,
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage disabled; settings last for this visit only */
  }
}

export interface Best {
  score: number;
  wave: number;
}

const BEST_KEY = 'holdout.best';

export function loadBest(): Best {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return { score: 0, wave: 0 };
    const b = JSON.parse(raw) as Partial<Best>;
    return { score: Number(b.score) || 0, wave: Number(b.wave) || 0 };
  } catch {
    return { score: 0, wave: 0 };
  }
}

export function saveBest(b: Best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

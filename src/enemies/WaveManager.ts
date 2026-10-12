import { CONFIG } from '../config';
import type { EnemyKind, Scaling } from './Enemy';

export type { EnemyKind };

export interface WaveHost {
  spawn(kind: EnemyKind, x: number, z: number, scale: Scaling): void;
  aliveCount(): number;
  onCountdown(nextWave: number): void;
  onWaveStart(wave: number): void;
  /** The last enemy of a wave is down. The game shows upgrades, then calls startBreak(). */
  onWaveCleared(wave: number): void;
}

type Phase = 'countdown' | 'spawning' | 'fighting' | 'cleared';

/** Builds each wave's spawn list, staggers spawns, and waits for the game between waves. Endless. */
export class WaveManager {
  wave = 0;
  phase: Phase = 'countdown';
  private timer = 0;
  private queue: EnemyKind[] = [];
  private spawnIndex = 0;

  constructor(private readonly host: WaveHost) {}

  reset() {
    this.wave = 0;
    this.queue = [];
    this.spawnIndex = 0;
    this.phase = 'countdown';
    this.timer = CONFIG.waves.firstWaveDelay;
    this.host.onCountdown(1);
  }

  /** Enemies still to come in this wave, including ones not yet spawned. */
  remaining(): number {
    return this.queue.length + this.host.aliveCount();
  }

  static composition(wave: number): EnemyKind[] {
    const W = CONFIG.waves;
    const grunts = Math.min(W.gruntsMax, W.gruntsBase + W.gruntsPerWave * wave);
    const rushers = wave >= W.rushersFromWave ? Math.min(W.rushersMax, Math.ceil((wave - W.rushersFromWave + 1) * 0.8)) : 0;
    const shooters = wave >= W.shootersFromWave ? Math.min(W.shootersMax, wave - W.shootersFromWave + 1) : 0;
    const brutes = wave >= W.brutesFromWave ? Math.min(W.brutesMax, Math.floor((wave - W.brutesFromWave) / 2) + 1) : 0;
    const list: EnemyKind[] = [];
    for (let i = 0; i < grunts; i++) list.push('grunt');
    // Spread the specials through the spawn order instead of all at the end
    const spread = (kind: EnemyKind, n: number) => {
      for (let i = 0; i < n; i++) {
        const at = Math.floor(((i + 1) * list.length) / (n + 1));
        list.splice(at, 0, kind);
      }
    };
    spread('shooter', shooters);
    spread('rusher', rushers);
    spread('brute', brutes);
    return list;
  }

  static scaling(wave: number): Scaling {
    const W = CONFIG.waves;
    const n = Math.max(0, wave - 1);
    return { hp: 1 + W.hpScalePerWave * n, speed: Math.min(W.speedScaleMax, 1 + W.speedScalePerWave * n) };
  }

  /** Called by the game once the upgrade is picked. */
  startBreak() {
    if (this.phase !== 'cleared') return;
    this.phase = 'countdown';
    this.timer = CONFIG.waves.breakTime;
    this.host.onCountdown(this.wave + 1);
  }

  step(dt: number) {
    const W = CONFIG.waves;
    switch (this.phase) {
      case 'countdown':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.wave++;
          this.queue = WaveManager.composition(this.wave);
          this.timer = 0;
          this.phase = 'spawning';
          this.host.onWaveStart(this.wave);
        }
        break;
      case 'spawning':
        this.timer -= dt;
        if (this.timer <= 0 && this.queue.length > 0) {
          const kind = this.queue.shift()!;
          const spawns = CONFIG.arena.spawns;
          const [x, z] = spawns[this.spawnIndex % spawns.length];
          this.spawnIndex++;
          // A small jitter so stacked spawns don't overlap exactly
          this.host.spawn(kind, x + (Math.random() - 0.5) * 1.5, z + (Math.random() - 0.5) * 1.5, WaveManager.scaling(this.wave));
          this.timer = Math.max(0.25, W.spawnStagger - this.wave * 0.02);
        }
        if (this.queue.length === 0) this.phase = 'fighting';
        break;
      case 'fighting':
        if (this.host.aliveCount() === 0) {
          this.phase = 'cleared';
          this.host.onWaveCleared(this.wave);
        }
        break;
      case 'cleared':
        break;
    }
  }

  /** Seconds until the next wave, during a break. */
  get countdownLeft(): number {
    return this.phase === 'countdown' ? Math.max(0, this.timer) : 0;
  }
}

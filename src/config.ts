// Every tuning number in the game lives here. Change a value, save, and the dev server reloads.

export const CONFIG = {
  loop: {
    stepHz: 60, // fixed simulation rate
    maxStepsPerFrame: 5, // avoids a death spiral after a long hitch
  },

  player: {
    radius: 0.4, // m, collision circle
    eyeHeight: 1.6, // m
    walkSpeed: 5.5, // m/s
    groundAccel: 14, // how fast velocity reaches the target speed on the ground
    airAccel: 3, // reduced control in the air
    jumpHeight: 1.2, // m
    gravity: 20, // m/s²
    maxHealth: 100,
    mouseSensitivity: 0.0022, // radians per pixel
    touchSensitivity: 0.0055, // radians per CSS pixel of thumb drag (scaled by the settings slider)
    fov: 75,
    portraitFov: 92, // a phone held upright needs a wider vertical view
    dash: {
      speed: 19, // m/s
      time: 0.17, // s
      cooldown: 1.1, // s
      invuln: 0.3, // s of immunity from the start of a dash
      fovKick: 9, // degrees of extra FOV at the peak of a dash
    },
  },

  weapon: {
    damage: 25,
    headshotMul: 2,
    fireRate: 8, // shots per second
    magazine: 30,
    reloadTime: 1.5, // s
    range: 100, // m
    spreadDeg: 1, // ± degrees while still
    moveSpreadDeg: 2.5, // ± degrees while moving
    recoilKick: 0.012, // radians of upward view kick per shot
    recoilRecover: 10, // how fast the kick settles back
    muzzleFlashTime: 0.05, // s
  },

  assist: {
    // Touch aiming help. Desktop mouse play gets none of this.
    frictionAngle: 0.07, // radians: look slows when an enemy is this close to the crosshair
    friction: 0.45, // look speed multiplier inside the friction cone
    autoFireRange: 60, // m, auto-fire only triggers on enemies closer than this
  },

  grunt: {
    health: 50,
    speed: 3.6, // m/s
    radius: 0.45,
    attackRange: 1.6, // m
    attackDamage: 10,
    attackInterval: 1, // s
    windup: 0.35, // s of visible wind-up before a hit lands
    headY: 1.3, // hits above this height (relative to the feet) are headshots
    score: 100,
    color: 0xc8423b,
  },

  rusher: {
    health: 25,
    speed: 7, // m/s
    radius: 0.32,
    damage: 20,
    knockback: 9, // m/s shove
    blastRadius: 2.6, // m, also hurts nearby enemies
    blastEnemyDamage: 35,
    headY: 0.85,
    score: 75,
    color: 0xd8c43a,
  },

  shooter: {
    health: 75,
    speed: 2.5, // m/s
    radius: 0.5,
    minRange: 10, // m, backs off when closer
    maxRange: 15, // m, closes in when farther
    fireInterval: 2, // s
    headY: 1.15,
    score: 150,
    color: 0x7a4bb8,
  },

  brute: {
    health: 320,
    speed: 2.1, // m/s
    radius: 0.7,
    attackRange: 2.2, // m
    attackDamage: 25,
    attackInterval: 1.6, // s
    windup: 0.55, // s
    knockback: 11, // m/s shove
    headY: 1.95,
    score: 400,
    color: 0x5a2d2d,
  },

  orb: {
    speed: 12, // m/s
    damage: 15,
    radius: 0.2, // m
    lifetime: 5, // s
    poolSize: 24,
  },

  waves: {
    // Endless. Wave n: grunts = base + perWave*n (capped), rushers from wave 2, shooters from 3, brutes from 4.
    gruntsBase: 2,
    gruntsPerWave: 2,
    gruntsMax: 14,
    rushersFromWave: 2,
    rushersMax: 6,
    shootersFromWave: 3,
    shootersMax: 5,
    brutesFromWave: 4,
    brutesMax: 3,
    hpScalePerWave: 0.07, // enemies gain this much health per wave after the first
    speedScalePerWave: 0.015, // and this much speed, capped below
    speedScaleMax: 1.3,
    spawnStagger: 0.5, // s between spawns (shrinks a little on later waves)
    breakTime: 5, // s between waves, after the upgrade pick
    firstWaveDelay: 2, // s before wave 1
    waveClearBonus: 500,
    pickupsPerBreak: 2,
    milestone: 5, // special banner every this many waves
  },

  combo: {
    window: 2.4, // s, a kill inside this window keeps the streak alive
    // Multiplier by streak length: index = kills in the streak so far (clamped to the last entry)
    tiers: [1, 1, 1.5, 1.5, 2, 2, 2, 2.5, 2.5, 2.5, 3],
  },

  pickup: {
    heal: 25,
    radius: 1.2, // m, how close you need to be to collect
  },

  arena: {
    size: 40, // m, square
    wallHeight: 4, // m
    // Cover blocks: [centre x, centre z, width, depth, height] in metres. Edit freely.
    cover: [
      [-8, -8, 3, 3, 1.0],
      [8, -8, 2, 6, 2.5],
      [-8, 8, 6, 2, 2.5],
      [8, 8, 3, 3, 1.0],
      [0, -12, 8, 1, 1.2],
      [0, 12, 8, 1, 1.2],
      [-14, 0, 1, 6, 2.0],
      [14, 0, 1, 6, 2.0],
    ] as [number, number, number, number, number][],
    // Enemy spawn points on the arena edges
    spawns: [
      [0, -18],
      [18, 0],
      [0, 18],
      [-18, 0],
    ] as [number, number][],
    playerStart: [0, 0] as [number, number],
  },

  fx: {
    shakeDecay: 2.5, // trauma lost per second
    shakeMaxAngle: 0.03, // radians at full trauma
    hurtShake: 0.45, // trauma added when hit
    shotShake: 0.06, // trauma added per shot fired
    hitFlashTime: 0.08, // s, enemy white flash
    deathTime: 0.3, // s, enemy shrink-out
    killHitStop: 0.045, // s of near-freeze on a kill
    waveClearSlowMo: 0.3, // time scale while the last enemy of a wave dies
    waveClearSlowTime: 0.9, // real seconds of slow-mo before the upgrade screen
  },

  audio: {
    volume: 0.35, // master volume, 0 to 1
  },
};

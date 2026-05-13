function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const DIRECTIONS = {
  north: { dx: 0, dy: -1, perpDx: 1, perpDy: 0 },
  south: { dx: 0, dy: 1, perpDx: 1, perpDy: 0 },
  east:  { dx: 1, dy: 0, perpDx: 0, perpDy: 1 },
  west:  { dx: -1, dy: 0, perpDx: 0, perpDy: 1 },
};

// Minimal stat definitions for testing (mirrors stat-registry.json structure)
const TEST_STATS = [
  // North - Melee Combat
  { stat: 'damage', display_name: 'Damage', description: 'Increases attack damage', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 1, notable: 3 }, display: { format: '0.#', prefix: '+' } },
  { stat: 'attack_speed', display_name: 'Attack Speed', description: 'Increases attack rate', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 0.05, notable: 0.1 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'crit_chance', display_name: 'Critical Chance', description: 'Chance to land a critical hit', node_tier: 'notable', apply_mode: 'add', value_per_node: { basic: 0.05, notable: 0.1 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'power_strike', display_name: 'Power Strike', description: 'Unlocks a powerful melee attack', node_tier: 'super_notable' },
  // South - Defense / Survival
  { stat: 'health', display_name: 'Health', description: 'Increases maximum health', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 10, notable: 25 }, display: { format: '0', prefix: '+' } },
  { stat: 'defense', display_name: 'Defense', description: 'Reduces incoming damage', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 2, notable: 5 }, display: { format: '0', prefix: '+' } },
  { stat: 'regeneration', display_name: 'Regeneration', description: 'Restores health over time', node_tier: 'notable', apply_mode: 'add', value_per_node: { basic: 0.5, notable: 1 }, display: { format: '0.#', suffix: '/s', prefix: '+' } },
  { stat: 'shield_barrier', display_name: 'Shield Barrier', description: 'Unlocks a damage-absorbing shield', node_tier: 'super_notable' },
  // East - Ranged
  { stat: 'projectile_damage', display_name: 'Projectile Damage', description: 'Increases projectile damage', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 1, notable: 3 }, display: { format: '0.#', prefix: '+' } },
  { stat: 'projectile_speed', display_name: 'Projectile Speed', description: 'Increases projectile travel speed', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 0.05, notable: 0.1 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'pierce_chance', display_name: 'Pierce Chance', description: 'Chance projectiles pierce enemies', node_tier: 'notable', apply_mode: 'add', value_per_node: { basic: 0.05, notable: 0.1 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'homing_shot', display_name: 'Homing Shot', description: 'Unlocks projectiles that track enemies', node_tier: 'super_notable' },
  // West - Utility / Movement
  { stat: 'speed', display_name: 'Speed', description: 'Increases movement speed', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 0.05, notable: 0.1 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'block', display_name: 'Block Chance', description: 'Chance to block an attack', node_tier: 'basic', apply_mode: 'add', value_per_node: { basic: 0.02, notable: 0.05 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'dodge_chance', display_name: 'Dodge Chance', description: 'Chance to evade an attack', node_tier: 'notable', apply_mode: 'add', value_per_node: { basic: 0.03, notable: 0.07 }, display: { format: '0.#', suffix: '%', multiplier: 100, prefix: '+' } },
  { stat: 'dash', display_name: 'Dash', description: 'Unlocks a quick-dash maneuver', node_tier: 'super_notable' },
];

// Test configurations (used as fallback when no stats are assigned).
// Each path gets its own thematic area with 2 basics, 1 notable, and 1 super_notable gate.
const TEST_CONFIGS = {
  small: {
    paths: {
      north: { areas: [
        { position: 1, gate: 'power_strike', stats: [{ stat: 'damage', count: 2 }, { stat: 'crit_chance', count: 1 }] },
      ]},
      south: { areas: [
        { position: 1, gate: 'shield_barrier', stats: [{ stat: 'health', count: 2 }, { stat: 'defense', count: 1 }] },
      ]},
      east: { areas: [
        { position: 1, gate: 'homing_shot', stats: [{ stat: 'projectile_damage', count: 2 }, { stat: 'pierce_chance', count: 1 }] },
      ]},
      west: { areas: [
        { position: 1, gate: 'dash', stats: [{ stat: 'speed', count: 2 }, { stat: 'dodge_chance', count: 1 }] },
      ]},
    },
    global: [],
  },
  large: {
    paths: {
      north: { areas: [
        { position: 1, gate: 'power_strike', stats: [{ stat: 'damage', count: 4 }, { stat: 'attack_speed', count: 3 }, { stat: 'crit_chance', count: 2 }] },
      ]},
      south: { areas: [
        { position: 1, gate: 'shield_barrier', stats: [{ stat: 'health', count: 4 }, { stat: 'defense', count: 3 }, { stat: 'regeneration', count: 2 }] },
      ]},
      east: { areas: [
        { position: 1, gate: 'homing_shot', stats: [{ stat: 'projectile_damage', count: 4 }, { stat: 'projectile_speed', count: 3 }, { stat: 'pierce_chance', count: 2 }] },
      ]},
      west: { areas: [
        { position: 1, gate: 'dash', stats: [{ stat: 'speed', count: 4 }, { stat: 'block', count: 3 }, { stat: 'dodge_chance', count: 2 }] },
      ]},
    },
    global: [],
  },
  uneven: {
    paths: {
      north: { areas: [
        { position: 1, gate: 'power_strike', stats: [{ stat: 'damage', count: 5 }, { stat: 'attack_speed', count: 4 }, { stat: 'crit_chance', count: 3 }] },
      ]},
      south: { areas: [
        { position: 1, gate: 'shield_barrier', stats: [{ stat: 'health', count: 2 }, { stat: 'defense', count: 1 }] },
      ]},
      east: { areas: [
        { position: 1, gate: 'homing_shot', stats: [{ stat: 'projectile_damage', count: 6 }, { stat: 'projectile_speed', count: 5 }, { stat: 'pierce_chance', count: 4 }] },
      ]},
      west: { areas: [
        { position: 1, gate: 'dash', stats: [{ stat: 'speed', count: 2 }] },
      ]},
    },
    global: [],
  },
};

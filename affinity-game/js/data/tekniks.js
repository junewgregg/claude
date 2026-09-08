// Teknik data: how a character fights. Twelve tekniks across four roles.
// Every teknik defines base combat stats, a basic attack type, four abilities,
// and one ultimate. Ability "type" strings are resolved by js/game/combat.js.
// Names get combined with the chosen affinity's flavor words at character-create time.

const TEKNIKS = [
  // ---------------- TANK ----------------
  {
    id: 'sword_knight', name: 'Sword Knight', role: 'tank', weaponGlyph: '🗡',
    baseStats: { hp: 140, armor: 12, speed: 190, attackRange: 58, attackDamage: 10, attackCooldown: 0.9 },
    attackType: 'melee',
    abilities: [
      { id: 'guard', base: 'Guard', type: 'shield_self', cooldown: 8, value: 0.25, duration: 4 },
      { id: 'shield_bash', base: 'Shield Bash', type: 'melee_strike', cooldown: 6, damage: 14, range: 62, stun: 1.0 },
      { id: 'rally_cry', base: 'Rally Cry', type: 'buff_team', cooldown: 14, radius: 150, stat: 'armor', amount: 0.15, duration: 5 },
      { id: 'charge', base: 'Charge', type: 'dash', cooldown: 10, damage: 12, distance: 220 }
    ],
    ultimate: { id: 'bulwark', base: 'Unbreakable Bulwark', type: 'shield_self', cooldown: 60, value: 0.4, duration: 6, taunt: true }
  },
  {
    id: 'mech', name: 'Mech', role: 'tank', weaponGlyph: '🤖',
    baseStats: { hp: 150, armor: 14, speed: 170, attackRange: 66, attackDamage: 11, attackCooldown: 1.0 },
    attackType: 'melee',
    abilities: [
      { id: 'servo_plating', base: 'Servo Plating', type: 'shield_self', cooldown: 9, value: 0.2, duration: 5 },
      { id: 'ground_pound', base: 'Ground Pound', type: 'aoe_damage', cooldown: 7, damage: 16, radius: 90, slow: 0.3, originSelf: true },
      { id: 'missile_pod', base: 'Missile Pod', type: 'projectile', cooldown: 5, damage: 14, range: 300 },
      { id: 'overdrive_stomp', base: 'Overdrive Stomp', type: 'dash_aoe', cooldown: 11, damage: 18, radius: 80, distance: 200 }
    ],
    ultimate: { id: 'titanfall', base: 'Titanfall Barrage', type: 'aoe_damage', cooldown: 60, damage: 40, radius: 140, knockback: true, originSelf: true }
  },
  {
    id: 'titan', name: 'Titan', role: 'tank', weaponGlyph: '⛰',
    baseStats: { hp: 160, armor: 10, speed: 160, attackRange: 72, attackDamage: 12, attackCooldown: 1.0 },
    attackType: 'melee',
    abilities: [
      { id: 'stone_skin', base: 'Stone Skin', type: 'shield_self', cooldown: 9, value: 0.22, duration: 5 },
      { id: 'sweeping_backhand', base: 'Sweeping Backhand', type: 'aoe_damage', cooldown: 7, damage: 15, radius: 85, knockback: true, originSelf: true },
      { id: 'seismic_slam', base: 'Seismic Slam', type: 'aoe_damage', cooldown: 10, damage: 18, radius: 110, slow: 0.4, originSelf: true },
      { id: 'boulder_toss', base: 'Boulder Toss', type: 'projectile', cooldown: 6, damage: 16, range: 280 }
    ],
    ultimate: { id: 'cataclysm', base: 'Cataclysm', type: 'aoe_damage', cooldown: 60, damage: 45, radius: 160, knockback: true, stun: 1.0, originSelf: true }
  },

  // ---------------- HEALER ----------------
  {
    id: 'mender', name: 'Mender', role: 'healer', weaponGlyph: '🌿',
    baseStats: { hp: 90, armor: 5, speed: 195, attackRange: 220, attackDamage: 6, attackCooldown: 0.8 },
    attackType: 'ranged',
    abilities: [
      { id: 'healing_touch', base: 'Healing Touch', type: 'heal_ally', cooldown: 5, value: 0.22 },
      { id: 'cleansing_bloom', base: 'Cleansing Bloom', type: 'cleanse_ally', cooldown: 12, value: 0.1 },
      { id: 'growth_ward', base: 'Growth Ward', type: 'shield_ally', cooldown: 9, value: 0.2, duration: 5 },
      { id: 'life_bloom', base: 'Life Bloom', type: 'heal_aoe', cooldown: 11, value: 0.12, radius: 140 }
    ],
    ultimate: { id: 'blossoming_renewal', base: 'Blossoming Renewal', type: 'heal_aoe', cooldown: 65, value: 0.45, radius: 200, cleanse: true }
  },
  {
    id: 'scholar', name: 'Scholar', role: 'healer', weaponGlyph: '📖',
    baseStats: { hp: 85, armor: 5, speed: 195, attackRange: 230, attackDamage: 6, attackCooldown: 0.8 },
    attackType: 'ranged',
    abilities: [
      { id: 'runic_insight', base: 'Runic Insight', type: 'buff_team', cooldown: 10, radius: 140, stat: 'damage', amount: 0.2, duration: 6 },
      { id: 'ward_of_warding', base: 'Ward of Warding', type: 'shield_ally', cooldown: 8, value: 0.25, duration: 5 },
      { id: 'focused_study', base: 'Focused Study', type: 'heal_ally', cooldown: 6, value: 0.18 },
      { id: 'temporal_sigil', base: 'Temporal Sigil', type: 'buff_team', cooldown: 12, radius: 140, stat: 'speed', amount: 0.2, duration: 5 }
    ],
    ultimate: { id: 'grand_convergence', base: 'Grand Convergence', type: 'buff_team_shield', cooldown: 65, radius: 220, shield: 0.3, damage: 0.2, duration: 8 }
  },
  {
    id: 'surgeon', name: 'Surgeon', role: 'healer', weaponGlyph: '➕',
    baseStats: { hp: 88, armor: 6, speed: 198, attackRange: 60, attackDamage: 7, attackCooldown: 0.7 },
    attackType: 'melee',
    abilities: [
      { id: 'triage_strike', base: 'Triage Strike', type: 'melee_strike', cooldown: 4, damage: 8, range: 62 },
      { id: 'emergency_stabilize', base: 'Emergency Stabilize', type: 'heal_ally', cooldown: 10, value: 0.3 },
      { id: 'adrenaline_shot', base: 'Adrenaline Shot', type: 'buff_ally', cooldown: 9, stat: 'speed_damage', amount: 0.2, duration: 5 },
      { id: 'field_surgery', base: 'Field Surgery', type: 'cleanse_ally', cooldown: 11, value: 0.2 }
    ],
    ultimate: { id: 'code_blue', base: 'Code Blue', type: 'heal_ally_shield', cooldown: 70, value: 0.7, shield: 0.2, radius: 220 }
  },

  // ---------------- MELEE DPS ----------------
  {
    id: 'rogue', name: 'Rogue', role: 'meleeDPS', weaponGlyph: '🔪',
    baseStats: { hp: 95, armor: 6, speed: 215, attackRange: 52, attackDamage: 11, attackCooldown: 0.6 },
    attackType: 'melee',
    abilities: [
      { id: 'shadow_step', base: 'Shadow Step', type: 'dash', cooldown: 7, damage: 10, distance: 220 },
      { id: 'backstab', base: 'Backstab', type: 'melee_strike', cooldown: 6, damage: 16, range: 55, executeBonus: 0.5 },
      { id: 'smoke_veil', base: 'Smoke Veil', type: 'stealth', cooldown: 12, duration: 2.5 },
      { id: 'throwing_knives', base: 'Throwing Knives', type: 'projectile', cooldown: 4, damage: 9, range: 240 }
    ],
    ultimate: { id: 'death_mark', base: 'Death Mark', type: 'mark_and_strike', cooldown: 55, markAmount: 0.4, markDuration: 5, damage: 30, range: 60 }
  },
  {
    id: 'martial_artist', name: 'Martial Artist', role: 'meleeDPS', weaponGlyph: '👊',
    baseStats: { hp: 100, armor: 7, speed: 205, attackRange: 55, attackDamage: 10, attackCooldown: 0.55 },
    attackType: 'melee',
    abilities: [
      { id: 'flowing_palm', base: 'Flowing Palm', type: 'melee_strike', cooldown: 4, damage: 13, range: 56 },
      { id: 'rising_kick', base: 'Rising Kick', type: 'dash', cooldown: 7, damage: 12, distance: 160, stun: 0.8 },
      { id: 'iron_stance', base: 'Iron Stance', type: 'shield_self', cooldown: 10, value: 0.15, duration: 4 },
      { id: 'chi_burst', base: 'Chi Burst', type: 'aoe_damage', cooldown: 8, damage: 14, radius: 70, originSelf: true }
    ],
    ultimate: { id: 'hundred_fists', base: 'Hundred Fists', type: 'aoe_damage_selfheal', cooldown: 55, damage: 45, radius: 80, healPct: 0.1, originSelf: true }
  },
  {
    id: 'engineer', name: 'Engineer', role: 'meleeDPS', weaponGlyph: '🔧',
    baseStats: { hp: 98, armor: 7, speed: 195, attackRange: 58, attackDamage: 10, attackCooldown: 0.6 },
    attackType: 'melee',
    abilities: [
      { id: 'wrench_smash', base: 'Wrench Smash', type: 'melee_strike', cooldown: 5, damage: 12, range: 58 },
      { id: 'deploy_turret', base: 'Deploy Turret', type: 'summon_turret', cooldown: 14, duration: 8, damage: 4 },
      { id: 'tesla_coil', base: 'Tesla Coil', type: 'aoe_damage', cooldown: 9, damage: 13, radius: 90, slow: 0.3, originSelf: true },
      { id: 'overclock_gear', base: 'Overclock Gear', type: 'buff_self', cooldown: 11, stat: 'attackSpeed', amount: 0.25, duration: 5 }
    ],
    ultimate: { id: 'full_meltdown', base: 'Full Meltdown', type: 'aoe_damage_summon', cooldown: 60, damage: 38, radius: 110, turrets: 2, originSelf: true }
  },

  // ---------------- RANGED DPS ----------------
  {
    id: 'archer', name: 'Archer', role: 'rangedDPS', weaponGlyph: '🏹',
    baseStats: { hp: 90, armor: 5, speed: 195, attackRange: 320, attackDamage: 11, attackCooldown: 0.75 },
    attackType: 'ranged',
    abilities: [
      { id: 'piercing_shot', base: 'Piercing Shot', type: 'projectile', cooldown: 5, damage: 16, range: 360, pierce: true },
      { id: 'hunters_mark', base: "Hunter's Mark", type: 'mark', cooldown: 10, amount: 0.25, duration: 6, range: 320 },
      { id: 'retreat_roll', base: 'Retreat Roll', type: 'dash', cooldown: 8, damage: 0, distance: 180, backward: true },
      { id: 'volley', base: 'Volley', type: 'aoe_damage', cooldown: 9, damage: 18, radius: 90, range: 300 }
    ],
    ultimate: { id: 'rain_of_arrows', base: 'Rain of Arrows', type: 'aoe_damage', cooldown: 58, damage: 40, radius: 130, range: 320 }
  },
  {
    id: 'demolitionist', name: 'Demolitionist', role: 'rangedDPS', weaponGlyph: '💣',
    baseStats: { hp: 96, armor: 6, speed: 185, attackRange: 280, attackDamage: 10, attackCooldown: 0.85 },
    attackType: 'ranged',
    abilities: [
      { id: 'sticky_bomb', base: 'Sticky Bomb', type: 'aoe_damage', cooldown: 7, damage: 20, radius: 80, range: 260 },
      { id: 'cluster_charge', base: 'Cluster Charge', type: 'aoe_damage', cooldown: 8, damage: 16, radius: 100, range: 260 },
      { id: 'smoke_bomb', base: 'Smoke Bomb', type: 'debuff_area', cooldown: 10, amount: 0.3, radius: 90, range: 260, duration: 3 },
      { id: 'kickback_blast', base: 'Kickback Blast', type: 'dash', cooldown: 8, damage: 12, distance: 160, backward: true }
    ],
    ultimate: { id: 'fire_in_the_hole', base: 'Fire in the Hole', type: 'aoe_damage', cooldown: 60, damage: 50, radius: 150, range: 300 }
  },
  {
    id: 'sorcerer', name: 'Sorcerer', role: 'rangedDPS', weaponGlyph: '🔮',
    baseStats: { hp: 88, armor: 5, speed: 195, attackRange: 300, attackDamage: 12, attackCooldown: 0.8 },
    attackType: 'ranged',
    abilities: [
      { id: 'arcane_bolt', base: 'Arcane Bolt', type: 'projectile', cooldown: 5, damage: 17, range: 320 },
      { id: 'frost_lance', base: 'Frost Lance', type: 'projectile_slow', cooldown: 7, damage: 13, range: 300, slow: 0.5, slowDuration: 2.5 },
      { id: 'arcane_barrier', base: 'Arcane Barrier', type: 'shield_self', cooldown: 9, value: 0.18, duration: 4 },
      { id: 'meteor_shard', base: 'Meteor Shard', type: 'aoe_damage', cooldown: 10, damage: 20, radius: 100, range: 300 }
    ],
    ultimate: { id: 'cataclysmic_nova', base: 'Cataclysmic Nova', type: 'aoe_damage', cooldown: 60, damage: 45, radius: 150, range: 280 }
  }
];

const TEKNIK_BY_ID = Object.fromEntries(TEKNIKS.map(t => [t.id, t]));
const ROLES = [
  { id: 'tank', name: 'Tank', desc: 'High health and armor. Holds the front line, protects allies, and soaks up damage.' },
  { id: 'healer', name: 'Healer', desc: 'Keeps the team alive with heals, shields, and buffs. Fragile but vital.' },
  { id: 'meleeDPS', name: 'Melee DPS', desc: 'Fast, high burst damage up close. Fragile but deadly in the right hands.' },
  { id: 'rangedDPS', name: 'Ranged DPS', desc: 'Deals heavy damage from a distance while kiting away from danger.' }
];

// Affinity data: the ten elemental/thematic origins a character can be born from.
// Each affinity supplies a color identity, flavor words used to name abilities,
// a small stat lean, and a passive trait that hooks into the combat event system.
const AFFINITIES = [
  {
    id: 'nature',
    name: 'Nature',
    tagline: 'Rooted in the wild, they grow stronger the longer they stand their ground.',
    color: '#3fae4a',
    colorDark: '#1f5c26',
    glyph: '☘', // shamrock
    words: ['Verdant', 'Thorned'],
    statMods: { hp: 1.08, speed: 0.98, armor: 1.05, cdr: 1.0 },
    passive: {
      id: 'regrowth',
      name: 'Regrowth',
      desc: 'Regenerates a small amount of health every second while out of combat, and slightly more while below half health.',
      onUpdate(entity, dt, world) {
        const sinceHit = world.time - (entity.lastDamagedAt || -999);
        if (sinceHit > 4) {
          const rate = entity.hp < entity.maxHp * 0.5 ? 0.06 : 0.03;
          entity.heal(entity.maxHp * rate * dt, entity);
        }
      }
    }
  },
  {
    id: 'starlight',
    name: 'Starlight',
    tagline: 'Woven from fallen star-stuff, they carry a shield that never quite goes out.',
    color: '#8ecbff',
    colorDark: '#2a4d80',
    glyph: '✦', // sparkle star
    words: ['Astral', 'Stellar'],
    statMods: { hp: 0.98, speed: 1.02, armor: 1.0, cdr: 1.0 },
    passive: {
      id: 'stellar_shield',
      name: 'Stellar Shield',
      desc: 'Slowly regenerates a small personal shield whenever no shield is present. The shield absorbs damage before health.',
      onUpdate(entity, dt) {
        if (entity.shield <= 0) {
          entity.shieldRegenTimer = (entity.shieldRegenTimer || 0) + dt;
          if (entity.shieldRegenTimer > 3) {
            entity.shield = Math.min(entity.maxShield, entity.shield + entity.maxHp * 0.05 * dt);
          }
        } else {
          entity.shieldRegenTimer = 0;
        }
      }
    }
  },
  {
    id: 'nanotech',
    name: 'Nanotech',
    tagline: 'A living swarm of nanites that hardens the longer a fight drags on.',
    color: '#43e0d8',
    colorDark: '#1c6d68',
    glyph: '⚙', // gear
    words: ['Nanite', 'Cascading'],
    statMods: { hp: 1.0, speed: 1.0, armor: 1.02, cdr: 1.05 },
    passive: {
      id: 'adaptive_plating',
      name: 'Adaptive Plating',
      desc: 'Damage taken is reduced more and more the longer the current fight has lasted, resetting after a few seconds of safety.',
      onTakeDamage(entity, dmg, source, world) {
        const fightLen = Math.min(8, world.time - (entity.combatStartedAt || world.time));
        const reduction = Math.min(0.35, fightLen * 0.045);
        return dmg * (1 - reduction);
      },
      onUpdate(entity, dt, world) {
        const sinceHit = world.time - (entity.lastDamagedAt || -999);
        if (sinceHit > 3) entity.combatStartedAt = world.time;
        else if (!entity.combatStartedAt) entity.combatStartedAt = world.time;
      }
    }
  },
  {
    id: 'robotics',
    name: 'Robotics',
    tagline: 'Chassis and servo, built to hit harder and faster the more damage they take.',
    color: '#ff9c3f',
    colorDark: '#7a4713',
    glyph: '⬡', // hexagon
    words: ['Servo', 'Kinetic'],
    statMods: { hp: 1.05, speed: 0.97, armor: 1.05, cdr: 1.0 },
    passive: {
      id: 'overclock',
      name: 'Overclock',
      desc: 'Attack and ability cooldowns recover faster the lower this character\'s health is, up to 30% at critical health.',
      cdrMultiplier(entity) {
        const missing = 1 - entity.hp / entity.maxHp;
        return 1 - Math.min(0.3, missing * 0.4);
      }
    }
  },
  {
    id: 'paranormality',
    name: 'Paranormality',
    tagline: 'Half in this world and half out of it, slipping free of the killing blow.',
    color: '#a071e8',
    colorDark: '#402868',
    glyph: '⭘', // heavy circle
    words: ['Spectral', 'Phantom'],
    statMods: { hp: 0.95, speed: 1.05, armor: 0.98, cdr: 1.0 },
    passive: {
      id: 'phase_step',
      name: 'Phase Step',
      desc: 'When a hit would take this character below 25% health, they briefly phase out of harm\'s way. Once every 18 seconds.',
      onTakeDamage(entity, dmg, source, world) {
        const wouldBe = entity.hp - dmg;
        const last = entity.phaseStepAt || -999;
        if (wouldBe > 0 && wouldBe < entity.maxHp * 0.25 && world.time - last > 18) {
          entity.phaseStepAt = world.time;
          entity.applyStatus('intangible', 0.6, world.time);
          return dmg * 0.15;
        }
        return dmg;
      }
    }
  },
  {
    id: 'demonology',
    name: 'Demonology',
    tagline: 'Bound to something hungry beneath the skin that feeds on the damage they deal.',
    color: '#e03b3b',
    colorDark: '#5c1414',
    glyph: '⸩', // horns-ish bracket
    words: ['Infernal', 'Cursed'],
    statMods: { hp: 1.02, speed: 1.0, armor: 0.95, cdr: 1.0 },
    passive: {
      id: 'blood_pact',
      name: 'Blood Pact',
      desc: 'Heals for a portion of all damage dealt, but takes slightly more damage in return for the power.',
      onDealDamage(entity, dmg, target, world) {
        entity.heal(dmg * 0.12, entity);
      },
      onTakeDamage(entity, dmg) {
        return dmg * 1.08;
      }
    }
  },
  {
    id: 'faerie',
    name: 'Faerie',
    tagline: 'Quick, glamoured, and never quite where they seem to be.',
    color: '#ff7ad9',
    colorDark: '#7a2a5c',
    glyph: '❁', // flower
    words: ['Fey', 'Glimmering'],
    statMods: { hp: 0.93, speed: 1.12, armor: 0.95, cdr: 1.0 },
    passive: {
      id: 'glamour',
      name: 'Glamour',
      desc: 'Moves faster than most, and has a small chance to dodge an incoming hit entirely.',
      onTakeDamage(entity, dmg) {
        if (Math.random() < 0.12) return 0;
        return dmg;
      }
    }
  },
  {
    id: 'song',
    name: 'Song',
    tagline: 'Carries a resonance that quickens with every note struck true.',
    color: '#f4c542',
    colorDark: '#7a5f13',
    glyph: '♪', // music note
    words: ['Resonant', 'Harmonic'],
    statMods: { hp: 1.0, speed: 1.0, armor: 1.0, cdr: 0.9 },
    passive: {
      id: 'resonance',
      name: 'Resonance',
      desc: 'Landing an attack or ability shaves extra time off this character\'s other cooldowns.',
      onDealDamage(entity) {
        for (const cd of entity.cooldowns) cd.remaining = Math.max(0, cd.remaining - 0.35);
      }
    }
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    tagline: 'Every strike carries an unstable mixture of effects waiting to go off.',
    color: '#8fd13f',
    colorDark: '#3d5c15',
    glyph: '⚗', // alembic
    words: ['Volatile', 'Alchemic'],
    statMods: { hp: 1.0, speed: 1.0, armor: 1.0, cdr: 1.0 },
    passive: {
      id: 'volatile_mixture',
      name: 'Volatile Mixture',
      desc: 'Attacks have a chance to apply a random bonus effect: a burn, a slow, or a weaken.',
      onDealDamage(entity, dmg, target, world) {
        if (Math.random() < 0.25 && target && target.alive) {
          const roll = Math.random();
          if (roll < 0.34) target.applyStatus('burn', 3, world.time, { dps: entity.maxHp * 0.015 });
          else if (roll < 0.67) target.applyStatus('slow', 2, world.time, { amount: 0.35 });
          else target.applyStatus('weaken', 3, world.time, { amount: 0.2 });
        }
      }
    }
  },
  {
    id: 'ancient_runes',
    name: 'Ancient Runes',
    tagline: 'Marked since birth with sigils that flare into a shielding pulse under pressure.',
    color: '#c9a24b',
    colorDark: '#5c481c',
    glyph: 'ᚠ', // runic-looking character
    words: ['Runic', 'Sigil-Bound'],
    statMods: { hp: 1.03, speed: 0.99, armor: 1.08, cdr: 1.0 },
    passive: {
      id: 'runic_ward',
      name: 'Runic Ward',
      desc: 'Every 14 seconds, the runes flare and grant a small shield automatically.',
      onUpdate(entity, dt, world) {
        const last = entity.runicWardAt || -999;
        if (world.time - last > 14) {
          entity.runicWardAt = world.time;
          entity.shield = Math.min(entity.maxShield, entity.shield + entity.maxHp * 0.15);
        }
      }
    }
  }
];

const AFFINITY_BY_ID = Object.fromEntries(AFFINITIES.map(a => [a.id, a]));

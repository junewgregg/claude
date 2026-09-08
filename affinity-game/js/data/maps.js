// Arena and hub map data. Everything is drawn with canvas primitives (no image
// assets) so the whole game stays a handful of static files.
// Obstacles are axis-aligned rectangles used for both rendering and collision.

const MAPS = [
  {
    id: 'sunken_grove', name: 'Sunken Grove', theme: 'nature',
    width: 1600, height: 1200, bg: '#0f2a17', accent: '#1e4d29',
    obstacles: [
      { x: 200, y: 200, w: 120, h: 120 }, { x: 1300, y: 200, w: 120, h: 120 },
      { x: 200, y: 900, w: 120, h: 120 }, { x: 1300, y: 900, w: 120, h: 120 },
      { x: 740, y: 540, w: 120, h: 120 }, { x: 500, y: 300, w: 60, h: 200 },
      { x: 1050, y: 700, w: 60, h: 200 }, { x: 400, y: 800, w: 200, h: 40 },
      { x: 1000, y: 250, w: 200, h: 40 }
    ],
    spawnPoints: [
      { x: 100, y: 100 }, { x: 1500, y: 100 }, { x: 100, y: 1100 }, { x: 1500, y: 1100 },
      { x: 800, y: 80 }, { x: 800, y: 1120 }, { x: 80, y: 600 }, { x: 1520, y: 600 }
    ]
  },
  {
    id: 'neon_district', name: 'Neon District', theme: 'nanotech',
    width: 1600, height: 1200, bg: '#0a1420', accent: '#0e3a3a',
    obstacles: [
      { x: 300, y: 300, w: 200, h: 40 }, { x: 1100, y: 300, w: 200, h: 40 },
      { x: 300, y: 860, w: 200, h: 40 }, { x: 1100, y: 860, w: 200, h: 40 },
      { x: 760, y: 200, w: 80, h: 300 }, { x: 760, y: 700, w: 80, h: 300 },
      { x: 500, y: 550, w: 100, h: 100 }, { x: 1000, y: 550, w: 100, h: 100 }
    ],
    spawnPoints: [
      { x: 100, y: 100 }, { x: 1500, y: 100 }, { x: 100, y: 1100 }, { x: 1500, y: 1100 },
      { x: 800, y: 80 }, { x: 800, y: 1120 }, { x: 80, y: 600 }, { x: 1520, y: 600 }
    ]
  },
  {
    id: 'skyshard_sanctum', name: 'Skyshard Sanctum', theme: 'starlight',
    width: 1500, height: 1500, bg: '#0b1030', accent: '#25306e',
    obstacles: [
      { x: 700, y: 700, w: 100, h: 100 },
      { x: 300, y: 300, w: 90, h: 90 }, { x: 1100, y: 300, w: 90, h: 90 },
      { x: 300, y: 1100, w: 90, h: 90 }, { x: 1100, y: 1100, w: 90, h: 90 },
      { x: 700, y: 200, w: 100, h: 40 }, { x: 700, y: 1260, w: 100, h: 40 },
      { x: 200, y: 700, w: 40, h: 100 }, { x: 1260, y: 700, w: 40, h: 100 }
    ],
    spawnPoints: [
      { x: 120, y: 120 }, { x: 1380, y: 120 }, { x: 120, y: 1380 }, { x: 1380, y: 1380 },
      { x: 750, y: 90 }, { x: 750, y: 1410 }, { x: 90, y: 750 }, { x: 1410, y: 750 }
    ]
  },
  {
    id: 'ashen_hollow', name: 'Ashen Hollow', theme: 'demonology',
    width: 1600, height: 1200, bg: '#200a08', accent: '#5c1e14',
    obstacles: [
      { x: 250, y: 250, w: 150, h: 60 }, { x: 1200, y: 250, w: 150, h: 60 },
      { x: 250, y: 900, w: 150, h: 60 }, { x: 1200, y: 900, w: 150, h: 60 },
      { x: 720, y: 500, w: 160, h: 160 },
      { x: 500, y: 150, w: 60, h: 60 }, { x: 1040, y: 990, w: 60, h: 60 }
    ],
    spawnPoints: [
      { x: 100, y: 100 }, { x: 1500, y: 100 }, { x: 100, y: 1100 }, { x: 1500, y: 1100 },
      { x: 800, y: 80 }, { x: 800, y: 1120 }, { x: 80, y: 600 }, { x: 1520, y: 600 }
    ]
  },
  {
    id: 'ruined_observatory', name: 'Ruined Observatory', theme: 'ancient_runes',
    width: 1500, height: 1300, bg: '#141008', accent: '#4a3a1a',
    obstacles: [
      { x: 650, y: 580, w: 200, h: 140 },
      { x: 250, y: 250, w: 100, h: 100 }, { x: 1150, y: 250, w: 100, h: 100 },
      { x: 250, y: 950, w: 100, h: 100 }, { x: 1150, y: 950, w: 100, h: 100 },
      { x: 700, y: 200, w: 100, h: 40 }, { x: 700, y: 1060, w: 100, h: 40 }
    ],
    spawnPoints: [
      { x: 110, y: 110 }, { x: 1390, y: 110 }, { x: 110, y: 1190 }, { x: 1390, y: 1190 },
      { x: 750, y: 90 }, { x: 750, y: 1210 }, { x: 90, y: 650 }, { x: 1410, y: 650 }
    ]
  }
];

const MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));

// The persistent, non-combat hub island the player spawns on after character
// creation. Decorations are purely visual; portals are interactable.
const HUB_MAP = {
  id: 'main_island', name: 'The Main Island',
  width: 1800, height: 1400, bg: '#123a2b', accent: '#1c5c3f',
  obstacles: [
    { x: 850, y: 650, w: 100, h: 100 }, // central fountain/statue block
    { x: 300, y: 300, w: 80, h: 80 }, { x: 1400, y: 300, w: 80, h: 80 },
    { x: 300, y: 1000, w: 80, h: 80 }, { x: 1400, y: 1000, w: 80, h: 80 }
  ],
  decorations: [
    { type: 'tree', x: 200, y: 200 }, { type: 'tree', x: 260, y: 240 }, { type: 'tree', x: 1600, y: 200 },
    { type: 'tree', x: 1550, y: 260 }, { type: 'tree', x: 200, y: 1200 }, { type: 'tree', x: 1600, y: 1200 },
    { type: 'tree', x: 1550, y: 1150 }, { type: 'tree', x: 900, y: 150 }, { type: 'tree', x: 950, y: 1250 },
    { type: 'statue', x: 900, y: 700 }, { type: 'flag', x: 500, y: 500 }, { type: 'flag', x: 1300, y: 900 },
    { type: 'rock', x: 700, y: 900 }, { type: 'rock', x: 1100, y: 500 }, { type: 'rock', x: 400, y: 1100 }
  ],
  portals: [
    { id: 'ffa8', label: '8-Player Free-for-All', x: 500, y: 350, color: '#e0a03b' },
    { id: 'br4v4', label: '4v4 Battle Royale', x: 1300, y: 350, color: '#3b8be0' },
    { id: 'br2222', label: '2v2v2v2 Battle Royale', x: 500, y: 1050, color: '#a03be0' },
    { id: 'tournament', label: '16-Team Tournament', x: 1300, y: 1050, color: '#e03b3b' },
    { id: 'character', label: 'Change Character', x: 900, y: 300, color: '#3be08b' }
  ],
  spawnPoint: { x: 900, y: 750 }
};

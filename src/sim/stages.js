// Stage collision layouts and initial interactive props (simulation side).
export const STAGES = {
  rustpit: {
    id: 'rustpit', name: 'THE RUST PIT', music: 'rustpit',
    left: -13, right: 13,
    spawn: [-3.2, 3.2],
    plats: [
      { x0: -10.6, x1: -6.4, y: 2.6, kind: 'catwalk' },
      { x0: 6.4, x1: 10.6, y: 2.6, kind: 'catwalk' },
      { x0: -1.25, x1: 1.25, y: 4.1, kind: 'crane', move: { a: -4.5, b: 4.5, period: 720 } },
    ],
    props: [
      { type: 'crate', x: -8.4, y: 0, w: 1.0, h: 1.0 },
      { type: 'crate', x: -8.4, y: 1.0, w: 1.0, h: 1.0 },
      { type: 'crate', x: 9.0, y: 0, w: 1.0, h: 1.0 },
      { type: 'barrel', x: -5.2, y: 0, w: 0.7, h: 0.95 },
      { type: 'barrel', x: 5.6, y: 0, w: 0.7, h: 0.95 },
      { type: 'vent', x: -11.6, y: 0, w: 1.2, h: 6 },
      { type: 'vent', x: 11.8, y: 0, w: 1.2, h: 6 },
    ],
  },
  cantina: {
    id: 'cantina', name: 'SOGGY BOTTOM CANTINA', music: 'cantina',
    left: -12, right: 12,
    spawn: [-3, 3],
    plats: [
      { x0: 6.6, x1: 12, y: 1.2, kind: 'counter' },
      { x0: -12, x1: -8.2, y: 3.1, kind: 'balcony' },
      { x0: -7.1, x1: -5.1, y: 0.95, kind: 'table', hp: 3 },
      { x0: 1.6, x1: 3.6, y: 0.95, kind: 'table', hp: 3 },
    ],
    props: [
      { type: 'mug', x: -6.6, y: 0.95 }, { type: 'bottle', x: -5.6, y: 0.95 },
      { type: 'mug', x: 2.2, y: 0.95 }, { type: 'mug', x: 3.1, y: 0.95 },
      { type: 'bottle', x: 7.6, y: 1.2 }, { type: 'mug', x: 9.2, y: 1.2 }, { type: 'bottle', x: 10.6, y: 1.2 },
      { type: 'stool', x: -2.6, y: 0 }, { type: 'stool', x: 5.2, y: 0 },
      { type: 'chandelier', x: 0, y: 5.3, w: 1.6, h: 0.8 },
      { type: 'pinata', x: -3.4, y: 3.5, w: 0.8, h: 1.0 },
      { type: 'jukebox', x: -10.6, y: 0, w: 1.3, h: 1.9 },
    ],
    bartender: { x: 9.5, spawnY: 1.2, every: 600 },
  },
  training: {
    id: 'training', name: 'TRAINING TANK', music: 'training',
    left: -12, right: 12, spawn: [-2.5, 2.5],
    plats: [{ x0: -9, x1: -5, y: 2.6, kind: 'catwalk' }, { x0: 5, x1: 9, y: 2.6, kind: 'catwalk' }],
    props: [{ type: 'barrel', x: -6.5, y: 0, w: 0.7, h: 0.95 }, { type: 'crate', x: 7.4, y: 0, w: 1, h: 1 }],
  },
};

export const STAGE_LIST = ['rustpit', 'cantina'];

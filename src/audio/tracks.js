// Mantis Mayhem audio — music tracks (compiled by music.js).
// Notation: melodies "E5:6 D5:2 C5:4" (lengths in 16th-note steps, carried over; r = rest; _ = tie;
// "!" accent, "~" soft; "C4+E4" chord). Patterns are 16 chars per bar (repeating):
//   drums X x o g .        bass R r 5 f 3 7 8 > < n - .        strum D d U u x - .        arp 0-9 - .
// Every section loops seamlessly: the form plays once, then returns to `loopTo`.

// shared percussion maps
const GUIRO = { L: ['guiro_long', 0.85], s: ['guiro_short', 0.55] };
const CONGA = { h: ['conga_hi', 0.7], l: ['conga_lo', 0.75], s: ['conga_slap', 0.6], H: ['conga_hi', 1] };
const TICK = { T: ['tick', 0.9], t: ['tock', 0.75], o: ['tick', 0.45] };
const TOMS = { h: ['tom_hi', 0.8], l: ['tom_lo', 0.85] };
const TIMB = { h: ['timbale_hi', 0.8], l: ['timbale_lo', 0.8], H: ['timbale_hi', 1] };

export const TRACK_DEFS = {
  // ==================================================================== MENU / TITLE
  // Mellow underwater cumbia-bolero, 92 BPM, A minor (Andalusian cadence + i-iv-V7).
  menu: {
    bpm: 92, key: 'A harmonic', swing16: 0.54, gain: 0.71,
    channels: {
      gtr: { inst: 'nylon', gain: 0.5, pan: -0.25, rev: 0.25, lp: 3800 },
      mar: { inst: 'marimba', gain: 0.78, pan: 0.15, rev: 0.32 },
      mar2: { inst: 'marimba', gain: 0.34, pan: 0.38, rev: 0.32 },
      vib: { inst: 'vibes', gain: 0.22, pan: -0.4, rev: 0.4, trem: [5.2, 0.3] },
      bass: { inst: 'ubass', gain: 0.6 },
      pad: { inst: 'pad', gain: 0.48, rev: 0.45, opts: { a: 1.4, r: 1.8, cut: 950, sweep: 0.09 } },
      guiro: { inst: 'drum', gain: 0.48, pan: 0.32, hum: 0.004 },
      clave: { inst: 'drum', gain: 0.35, pan: -0.38, rev: 0.15 },
      kick: { inst: 'drum', gain: 0.5 },
      conga: { inst: 'drum', gain: 0.5, pan: 0.18, rev: 0.1 },
      shk: { inst: 'drum', gain: 0.2, pan: -0.22 },
      bub: { inst: 'bubble', gain: 0.45, pan: 0.3, rev: 0.6 },
    },
    sections: {
      intro: {
        bars: 4, chords: 'Am | G | F | E7',
        build(b) {
          b.pad('pad', { lo: 57, n: 4, vel: 0.55 });
          b.arp('gtr', '0.2.3.4.1.3.4.3.', { gv: 1, ring: 6, vel: 0.62 });
          b.bass('bass', 'R-------5----->-', { bars: [2, 3] });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO, bars: [3] });
          b.sprinkle('bub', { steps: [2, 7, 11, 14], prob: 0.45, notes: [81, 84, 86, 88, 91, 93], vel: 0.5 });
        },
      },
      A: {
        bars: 8, chords: 'Am | G | F | E7 | Am | G | F | E7',
        build(b) {
          b.mel('mar', 'E5:6 D5:2 C5:4 A4:4 | B4:6 C5:2 D5:4 B4:4 | C5:4 A4:2 C5:2 F5:4 E5:2 D5:2 | E5:6 D5:2 B4:4 G#4:4 |'
            + ' A4:6 C5:2 E5:4 A5:4 | G5:6 F5:2 E5:4 D5:4 | C5:6 D5:2 E5:2 D5:2 C5:2 A4:2 | B4:6 C5:2 B4:2 A4:2 G#4:4', { vel: 0.85, trem: 6 });
          b.arp('gtr', '0.2.3.4.1.3.4.3.', { gv: 1, ring: 5, vel: 0.55 });
          b.bass('bass', 'R-------5----->-');
          b.pad('pad', { lo: 57, n: 3, vel: 0.4 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('clave', 'X.....X.....X.......X...X.......', { drum: 'claves', vel: 0.8 });
          b.drum('kick', 'X.......x.......', { drum: 'kick_soft' });
          b.drum('conga', '....s..lh...s.ll', { map: CONGA });
          b.sprinkle('bub', { steps: [7, 15], prob: 0.25, notes: [84, 86, 88, 91, 93], vel: 0.45 });
        },
      },
      B: {
        bars: 8, chords: 'Dm | Am | E7 | Am | Dm | Am | F E7 | Am',
        build(b) {
          b.mel('mar', 'F5:6 E5:2 D5:4 A4:4 | C5:6 B4:2 A4:4 E5:4 | D5:6 C5:2 B4:4 G#4:4 | A4:10 r:2 C5:2 D5:2 |'
            + ' F5:4 A5:4 G5:2 F5:2 E5:2 D5:2 | E5:6 D5:2 C5:4 A4:4 | C5:4 A4:4 B4:4 G#4:4 | A4:12 r:4', { vel: 0.85, trem: 6 });
          b.mel('vib', 'r:16 | r:16 | r:16 | r:12 C6:2 D6:2 | F6:4 A6:4 G6:2 F6:2 E6:2 D6:2 | E6:16 | r:16 | r:16', { vel: 0.5 });
          b.arp('gtr', '0.2.3.4.1.3.4.3.', { gv: 1, ring: 5, vel: 0.55 });
          b.bass('bass', 'R-------5-----5-');
          b.pad('pad', { lo: 57, n: 4, vel: 0.5 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('clave', 'X.....X.....X.......X...X.......', { drum: 'claves', vel: 0.8 });
          b.drum('kick', 'X.......x.......', { drum: 'kick_soft' });
          b.drum('conga', '....s..lh...s.ll', { map: CONGA });
          b.drum('shk', 'x.o.x.o.x.o.x.o.', { drum: 'shaker' });
          b.sprinkle('bub', { steps: [7, 15], prob: 0.25, notes: [84, 86, 88, 91, 93], vel: 0.45 });
        },
      },
      A2: {
        bars: 8, chords: 'Am | G | F | E7 | Am | G | F | E7',
        build(b) {
          const mel = 'E5:6 D5:2 C5:4 A4:4 | B4:6 C5:2 D5:4 B4:4 | C5:4 A4:2 C5:2 F5:4 E5:2 D5:2 | E5:6 D5:2 B4:4 G#4:4 |'
            + ' A4:6 C5:2 E5:4 A5:4 | G5:6 F5:2 E5:4 D5:4 | C5:6 D5:2 E5:2 D5:2 C5:2 A4:2 | B4:6 C5:2 B4:2 A4:2 G#4:4';
          b.mel('mar', mel, { vel: 0.8, trem: 6, harm: -2, harmCh: 'mar2', harmVel: 0.9 });
          b.mel('vib', mel, { vel: 0.4, oct: 1 });
          b.arp('gtr', '0.2.3.4.1.3.4.3.', { gv: 1, ring: 5, vel: 0.55 });
          b.bass('bass', 'R-------5----->-');
          b.pad('pad', { lo: 57, n: 4, vel: 0.45 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('clave', 'X.....X.....X.......X...X.......', { drum: 'claves', vel: 0.8 });
          b.drum('kick', 'X.......x.......', { drum: 'kick_soft' });
          b.drum('conga', '....s..lh...s.ll', { map: CONGA });
          b.drum('shk', 'x.o.x.o.x.o.x.o.', { drum: 'shaker' });
        },
      },
      B2: {
        bars: 8, chords: 'Dm | Am | E7 | Am | Dm | Am | F E7 | Am',
        build(b) {
          b.mel('mar', 'F5:6 E5:2 D5:4 A4:4 | C5:6 B4:2 A4:4 E5:4 | D5:6 C5:2 B4:4 G#4:4 | A4:10 r:2 C5:2 D5:2 |'
            + ' F5:4 A5:4 G5:2 F5:2 E5:2 D5:2 | E5:6 D5:2 C5:4 A4:4 | C5:4 D5:4 E5:4 G#5:4 | A5:12 r:4', { vel: 0.85, trem: 6 });
          b.mel('mar2', 'D5:6 C5:2 A4:4 F4:4 | A4:6 G#4:2 E4:4 C5:4 | B4:6 A4:2 G#4:4 E4:4 | E4:10 r:2 A4:2 B4:2 |'
            + ' D5:4 F5:4 E5:2 D5:2 C5:2 B4:2 | C5:6 B4:2 A4:4 E4:4 | A4:4 B4:4 C5:4 E5:4 | E5:12 r:4', { vel: 0.8 });
          b.arp('gtr', '0.2.3.4.1.3.4.3.', { gv: 1, ring: 5, vel: 0.55 });
          b.bass('bass', 'R-------5-----5-');
          b.pad('pad', { lo: 57, n: 4, vel: 0.55 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('clave', 'X.....X.....X.......X...X.......', { drum: 'claves', vel: 0.8 });
          b.drum('kick', 'X.......x.......', { drum: 'kick_soft' });
          b.drum('conga', '....s..lh...s.ll', { map: CONGA });
          b.drum('shk', 'x.o.x.o.x.o.x.o.', { drum: 'shaker' });
          b.sprinkle('bub', { steps: [3, 11], prob: 0.3, notes: [84, 86, 88, 91, 93, 96], vel: 0.45 });
        },
      },
    },
    form: ['intro', 'A', 'B', 'A2', 'B2'], loopTo: 1,
  },

  // ==================================================================== CHARACTER SELECT
  // Energetic mariachi-rock, 132 BPM, D major / B minor. Twin trumpets in thirds.
  select: {
    bpm: 132, key: 'D major', gain: 0.45,
    channels: {
      vih: { inst: 'vihuela', gain: 0.52, pan: -0.32, rev: 0.12 },
      gtr: { inst: 'nylon', gain: 0.34, pan: 0.32, rev: 0.15 },
      tp1: { inst: 'brass', gain: 0.62, pan: -0.08, rev: 0.2, opts: { vibRate: 6.2, vib: 0.008 } },
      tp2: { inst: 'brass', gain: 0.45, pan: 0.16, rev: 0.2, opts: { vibRate: 5.9, vib: 0.008 } },
      bass: { inst: 'ebass', gain: 0.55 },
      kick: { inst: 'drum', gain: 0.65 },
      snare: { inst: 'drum', gain: 0.9, rev: 0.1 },
      hat: { inst: 'drum', gain: 0.8, pan: 0.25 },
      tamb: { inst: 'drum', gain: 0.36, pan: -0.25 },
      crash: { inst: 'drum', gain: 0.32, rev: 0.1 },
      tom: { inst: 'drum', gain: 0.5, rev: 0.1 },
    },
    sections: {
      intro: {
        bars: 2, chords: 'D | A',
        build(b) {
          b.strum('vih', 'D.....D.....D...', { bars: [0], ring: 4, vel: 0.9 });
          b.strum('vih', 'D.dUxUdUD.dUxUdU', { bars: [1] });
          b.drum('crash', 'X...............', { bars: [0] });
          b.drum('kick', 'X.....X.....X...', { drum: 'kick', bars: [0] });
          b.drum('tom', '........hhhhllll', { map: TOMS, bars: [1] });
          b.drum('kick', 'X.......X.......', { drum: 'kick', bars: [1] });
          b.mel('tp1', 'A4:2 r:4 A4:2 r:4 A4:4 | r:16', { vel: 0.85 });
          b.mel('tp2', 'F#4:2 r:4 F#4:2 r:4 F#4:4 | r:16', { vel: 0.8 });
          b.bass('bass', 'R.....R.....R...', { bars: [0] });
        },
      },
      A: {
        bars: 8, chords: 'D | A | Bm | G | D | A | Bm G | A',
        build(b) {
          b.mel('tp1', 'r:2 A4:2 D5:2 E5:2 F#5:4 E5:2 D5:2 | E5:6 C#5:2 A4:8 | r:2 B4:2 D5:2 E5:2 F#5:4 A5:2 F#5:2 | G5:6 F#5:2 E5:4 D5:2 E5:2 |'
            + ' r:2 A4:2 D5:2 E5:2 F#5:4 E5:2 D5:2 | E5:4 A5:4 G5:2 F#5:2 E5:4 | F#5:4 D5:4 G5:4 B5:4 | A5:12 r:4', { vel: 0.9, harm: -2, harmCh: 'tp2', harmVel: 0.85 });
          b.strum('vih', 'D.dUxUdUD.dUxUdU');
          b.strum('gtr', 'D-------D-------', { ring: 8, vel: 0.55 });
          b.bass('bass', 'R-R-R-r-5-5-R->-');
          b.drum('kick', 'X.....x.X.x.....', { drum: 'kick' });
          b.drum('snare', '....X..g....X..g', { drum: 'snare' });
          b.drum('hat', 'x.o.x.o.x.o.x.o.', { drum: 'hat' });
          b.drum('tamb', 'oggoggoggoggoggo', { drum: 'tamb' });
          b.drum('crash', 'X...............', { bars: [0, 4] });
          b.drum('tom', '............hhll', { map: TOMS, bars: [7] });
        },
      },
      B: {
        bars: 8, chords: 'Bm | G | D | A | Bm | G | D | A A7',
        build(b) {
          b.mel('tp1', 'B5:3 B5:3 A5:2 F#5:4 D5:4 | G5:3 G5:3 F#5:2 E5:4 D5:4 | F#5:3 F#5:3 E5:2 D5:4 A4:4 | C#5:4 E5:4 A5:8 |'
            + ' B5:3 B5:3 A5:2 F#5:4 D5:4 | G5:3 G5:3 F#5:2 E5:4 G5:4 | F#5:2 A5:2 F#5:2 D5:2 E5:4 F#5:4 | E5:4 C#5:4 A4:4 G5:4', { vel: 0.9, harm: -2, harmCh: 'tp2', harmVel: 0.85 });
          b.strum('vih', 'D.dUxUdUD.dUxUdU');
          b.arp('gtr', '0.2.3.4.3.2.4.3.', { gv: 1, ring: 3, vel: 0.5 });
          b.bass('bass', 'R-R-R-r-5-5-R->-');
          b.drum('kick', 'X.....x.X.x...x.', { drum: 'kick' });
          b.drum('snare', '....X..g....X.gg', { drum: 'snare' });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat' });
          b.drum('tamb', 'oggoggoggoggoggo', { drum: 'tamb' });
          b.drum('crash', 'X...............', { bars: [0, 4] });
          b.drum('tom', '........hhhhllll', { map: TOMS, bars: [7] });
        },
      },
      C: {
        bars: 4, chords: 'G | Gm | D | A7',
        build(b) {
          b.mel('tp1', 'B5:12 A5:4 | Bb5:12 A5:4 | A5:16 | G5:8 E5:4 C#5:4', { vel: 0.85, harm: -2, harmCh: 'tp2', harmVel: 0.85 });
          b.strum('vih', 'D-----D-----D-U-', { ring: 2 });
          b.strum('gtr', 'D---------------', { ring: 16, vel: 0.6 });
          b.bass('bass', 'R-------5-----R-');
          b.drum('kick', 'X.......X.......', { drum: 'kick' });
          b.drum('snare', '....x.......x...', { drum: 'snare' });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat' });
          b.roll('snare', 'snare', 56, 8, 0.15, 0.7);
          b.drum('crash', 'X...............', { bars: [0] });
        },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'C'], loopTo: 1,
  },

  // ==================================================================== VAULT DOORS (tension)
  doors: {
    bpm: 96, key: 'D harmonic', gain: 0.51,
    channels: {
      tick: { inst: 'drum', gain: 1.0, pan: 0.3, rev: 0.15 },
      drone: { inst: 'pad', gain: 0.55, rev: 0.3, opts: { a: 2.0, r: 2.0, cut: 520, sweep: 0.06 } },
      bone: { inst: 'bone', gain: 0.42, rev: 0.35, pan: -0.15, opts: { swell: 0.8, vibRate: 4.2, vib: 0.004 } },
      bass: { inst: 'ubass', gain: 0.7 },
      roll: { inst: 'drum', gain: 0.38, rev: 0.18, pan: 0.1 },
      timp: { inst: 'drum', gain: 0.62, rev: 0.25 },
      heart: { inst: 'drum', gain: 0.55 },
      cym: { inst: 'drum', gain: 0.3, rev: 0.3 },
    },
    sections: {
      A: {
        bars: 16, chords: 'D5 | D5 | Eb5 | Eb5 | Dm | Dm | Bb | A | Dm | Eb | Dm | C#dim7 | Dm | Bb | Gm | A7',
        build(b) {
          b.pad('drone', { lo: 38, n: 2, vel: 0.6 });
          b.drum('tick', 'T...t...T...t...', { map: TICK, bars: [0, 1, 2, 3, 4, 5, 6, 7] });
          b.drum('tick', 'T.o.t.o.T.o.t.o.', { map: TICK, bars: [8, 9, 10, 11, 12, 13, 14, 15] });
          b.mel('bone', 'D3+A3:32 | Eb3+Bb3:32 | D3+F3:32 | Bb2+D3:16 | A2+C#3+E3:16 |'
            + ' D3+F3+A3:16 | Eb3+G3+Bb3:16 | D3+F3+A3:16 | C#3+E3+G3:16 | D3+F3:16 | D3+Bb3:16 | G2+D3+Bb3:16 | A2+C#3+G3:16', { vel: 0.85 });
          b.bass('bass', 'R---------------', { bars: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], lo: 26 });
          b.drum('heart', 'X..x............', { map: { X: ['kick_soft', 0.9], x: ['kick_soft', 0.6] }, bars: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });
          b.drum('timp', 'X...............', { drum: 'timpani', bars: [0, 8, 12, 13, 14, 15] });
          b.roll('roll', 'snare', 11 * 16 + 8, 8, 0.05, 0.3);
          b.roll('roll', 'snare', 14 * 16, 32, 0.06, 0.65);
          b.drum('cym', '......X.........', { drum: 'revcym', bars: [15] });
        },
      },
    },
    form: ['A'], loopTo: 0,
  },

  // ==================================================================== RUST PIT (fight)
  // Industrial latin, 140 BPM, E Phrygian dominant riff. Intensity adds percussion layers.
  rustpit: {
    bpm: 140, key: 'E phrygdom', gain: 0.39,
    channels: {
      bass: { inst: 'dbass', gain: 0.5 },
      kick: { inst: 'drum', gain: 0.78 },
      snare: { inst: 'drum', gain: 0.92, rev: 0.12 },
      clank: { inst: 'drum', gain: 0.72, pan: 0.32, rev: 0.25 },
      anvil: { inst: 'drum', gain: 0.34, pan: -0.38, rev: 0.25 },
      hat: { inst: 'drum', gain: 0.65, pan: 0.2 },
      stab: { inst: 'brass', gain: 0.52, pan: -0.12, rev: 0.18, opts: { noVib: 1, scoop: 30, bright: 1.15 } },
      lead: { inst: 'brass', gain: 0.46, pan: 0.1, rev: 0.22, opts: { vibRate: 6, vib: 0.008, bright: 1.1 } },
      gtr: { inst: 'requinto', gain: 0.25, pan: -0.3, rev: 0.12 },
      conga: { inst: 'drum', gain: 0.4, pan: -0.25, rev: 0.08, layer: [0.2, 0.6] },
      timb: { inst: 'drum', gain: 0.36, pan: 0.28, rev: 0.12, layer: [0.45, 0.85] },
      shk: { inst: 'drum', gain: 0.22, pan: -0.15, layer: [0.6, 1.0] },
      cow: { inst: 'drum', gain: 0.2, pan: 0.35, layer: [0.7, 1.0] },
    },
    sections: {
      intro: {
        bars: 4, chords: 'E',
        build(b) {
          b.drum('clank', 'x.....x...x...x.', { drum: 'clank' });
          b.drum('kick', 'X.......X.......', { drum: 'kick_hard', bars: [1, 2, 3] });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat', bars: [2, 3] });
          b.mel('bass', 'r:16 | r:16 | E2:1 E2:1 r:1 E2:1 F2:2 E2:1 r:1 G#2:2 F2:2 E2:2 D2:2 | E2:1 E2:1 r:1 E2:1 F2:2 E2:1 r:1 A2:2 G#2:2 F2:2 G#2:2', { vel: 0.9 });
          b.roll('snare', 'snare_hard', 56, 8, 0.1, 0.7);
          b.drum('anvil', 'X...............', { drum: 'anvil', bars: [0, 2] });
        },
      },
      A: {
        bars: 8, chords: 'E',
        build(b) {
          const riff = 'E2:1 E2:1 r:1 E2:1 F2:2 E2:1 r:1 G#2:2 F2:2 E2:2 D2:2 | E2:1 E2:1 r:1 E2:1 F2:2 E2:1 r:1 A2:2 G#2:2 F2:2 G#2:2';
          b.mel('bass', [riff, riff, riff, riff].join(' | '), { vel: 0.9 });
          b.hits('stab', 'X.....X...X.....|..........X.X.X.', { lo: 64, n: 3, vel: 0.95 });
          b.drum('kick', 'X.....x.X.....x.', { drum: 'kick_hard' });
          b.drum('snare', '....X.......X...', { drum: 'snare_hard' });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat' });
          b.drum('clank', '..x.......x...x.', { drum: 'clank' });
          b.drum('anvil', '............X...|................', { drum: 'anvil' });
          b.drum('conga', 'h.l.h.lhh.l.h.ll', { map: CONGA });
          b.drum('timb', '....h.......h..H|....h.....h.hhHH', { map: TIMB });
          b.drum('shk', 'xoxoxoxoxoxoxoxo', { drum: 'shaker' });
          b.drum('cow', 'x...x...x...x...', { drum: 'cowbell' });
        },
      },
      B: {
        bars: 8, chords: 'F | G | F | E | Am | G | F | E',
        build(b) {
          b.mel('lead', 'A5:4 G5:2 F5:2 E5:4 F5:4 | G5:4 F5:2 E5:2 D5:4 B4:4 | C5:2 D5:2 E5:2 F5:2 G5:4 A5:4 | G#5:8 F5:4 E5:4 |'
            + ' E5:4 A5:4 C6:4 B5:2 A5:2 | B5:4 G5:4 D5:4 F5:4 | A5:4 G5:2 F5:2 E5:2 F5:2 D5:4 | E5:12 r:4', { vel: 0.9 });
          b.bass('bass', 'R-R-r-R-R-r-R->-', { lo: 28 });
          b.hits('stab', '..X...X...X...X.', { lo: 60, n: 3, vel: 0.6 });
          b.strum('gtr', 'D.dUD.dUD.dUD.dU', { lo: 40, top: 69, vel: 0.6 });
          b.drum('kick', 'X.....x.X.....x.', { drum: 'kick_hard' });
          b.drum('snare', '....X.......X..g', { drum: 'snare_hard' });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat' });
          b.drum('clank', '..x.......x.....', { drum: 'clank' });
          b.drum('conga', 'h.l.h.lhh.l.h.ll', { map: CONGA });
          b.drum('timb', '....h.......h...|....h.....h.HhHh', { map: TIMB });
          b.drum('shk', 'xoxoxoxoxoxoxoxo', { drum: 'shaker' });
          b.drum('cow', 'x...x...x...x...', { drum: 'cowbell' });
        },
      },
      A2: {
        bars: 8, chords: 'E',
        build(b) {
          const riff = 'E2:1 E2:1 r:1 E2:1 F2:2 E2:1 r:1 G#2:2 F2:2 E2:2 D2:2 | E2:1 E2:1 r:1 E2:1 F2:2 E2:1 r:1 A2:2 G#2:2 F2:2 G#2:2';
          b.mel('bass', [riff, riff, riff, riff].join(' | '), { vel: 0.9 });
          const line = 'B4:2 C5:2 B4:2 G#4:2 A4:4 G#4:2 F4:2 | E4:8 r:4 E4:2 F4:2 | G#4:2 A4:2 B4:2 C5:2 D5:4 C5:2 B4:2 | C5:4 B4:4 G#4:8';
          b.mel('lead', line, { vel: 0.85 });
          b.mel('lead', line, { vel: 0.95, bar: 4, oct: 1 });
          b.mel('gtr', [riff, riff, riff, riff].join(' | '), { vel: 0.5, oct: 2 });
          b.drum('kick', 'X.....x.X.....x.', { drum: 'kick_hard' });
          b.drum('snare', '....X.......X...', { drum: 'snare_hard' });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat' });
          b.drum('clank', '..x.......x...x.', { drum: 'clank' });
          b.drum('conga', 'h.l.h.lhh.l.h.ll', { map: CONGA });
          b.drum('timb', '....h.......h..H|....h.....h.hhHH', { map: TIMB });
          b.drum('shk', 'xoxoxoxoxoxoxoxo', { drum: 'shaker' });
          b.drum('cow', 'x...x...x...x...', { drum: 'cowbell' });
        },
      },
      brk: {
        bars: 4, chords: 'E | E | F | E',
        build(b) {
          b.mel('bass', 'E2:16 | E2:16 | F2:16 | E2:8 r:8', { vel: 0.8 });
          b.drum('kick', 'X...............', { drum: 'kick_hard' });
          b.drum('snare', '........X.......', { drum: 'snare_hard' });
          b.drum('clank', 'x..x..x...x..x..', { drum: 'clank' });
          b.drum('anvil', '......X.......X.', { drum: 'anvil' });
          b.hits('stab', 'X---------------', { lo: 59, n: 4, vel: 0.5, bars: [3] });
          b.roll('snare', 'snare_hard', 56, 8, 0.12, 0.75);
          b.drum('conga', 'h...l...h.l.l...', { map: CONGA });
        },
      },
    },
    form: ['intro', 'A', 'B', 'A2', 'brk'], loopTo: 1,
  },

  // ==================================================================== CANTINA (norteño polka)
  cantina: {
    bpm: 120, key: 'G major', gain: 0.3,
    channels: {
      acc: { inst: 'accordion', gain: 0.7, pan: 0.1, rev: 0.16, opts: { low: 0 } },
      acc2: { inst: 'accordion', gain: 0.42, pan: 0.28, rev: 0.16 },
      bajo: { inst: 'vihuela', gain: 0.9, pan: -0.3, rev: 0.1 },
      tuba: { inst: 'tuba', gain: 0.5 },
      kick: { inst: 'drum', gain: 0.55 },
      snare: { inst: 'drum', gain: 0.95, pan: 0.1, rev: 0.08 },
      hat: { inst: 'drum', gain: 0.63, pan: 0.25 },
      xtamb: { inst: 'drum', gain: 0.2, pan: -0.3, layer: [0.3, 0.8] },
      xbongo: { inst: 'drum', gain: 0.3, pan: 0.32, layer: [0.5, 1.0] },
    },
    sections: {
      intro: {
        bars: 2, chords: 'D7 | D7',
        build(b) {
          b.mel('acc', 'D5:2 E5:2 F#5:2 G5:2 A5:2 B5:2 C6:2 A5:2 | B5:2 A5:2 G5:2 F#5:2 E5:2 D5:2 C5:2 A4:2', { vel: 0.85 });
          b.bass('tuba', 'R---....5---....', { lo: 31 });
          b.strum('bajo', '....x.......x...', { lo: 40, top: 64 });
          b.drum('snare', '....x.......x...', { drum: 'snare' });
        },
      },
      A: {
        bars: 8, chords: 'G | G | D7 | D7 | D7 | D7 | G | G',
        build(b) {
          b.mel('acc', 'D5:2 G5:2 B5:2 G5:2 D5:2 G5:2 B5:4 | A5:2 B5:2 A5:2 G5:2 F#5:2 G5:2 A5:4 | C5:2 F#5:2 A5:2 F#5:2 C5:2 F#5:2 A5:4 |'
            + ' B5:2 C6:2 B5:2 A5:2 G5:2 F#5:2 E5:2 D5:2 | C5:2 F#5:2 A5:2 C6:2 A5:2 F#5:2 D5:4 | E5:2 F#5:2 G5:2 A5:2 B5:2 A5:2 G5:2 F#5:2 |'
            + ' G5:2 B5:2 D6:2 B5:2 G5:4 D5:4 | G5:4 r:2 D5:2 G4:4 r:4', { vel: 0.85, harm: -2, harmCh: 'acc2', harmVel: 0.85 });
          b.bass('tuba', 'R---....5---....', { lo: 31 });
          b.strum('bajo', '....D.......D...', { lo: 40, top: 64, ring: 2 });
          b.drum('kick', 'X.......X.......', { drum: 'kick' });
          b.drum('snare', '....x.......x...', { drum: 'snare' });
          b.drum('hat', '..x...x...x...x.', { drum: 'hat' });
          b.drum('xtamb', 'x.o.x.o.x.o.x.o.', { drum: 'tamb' });
          b.drum('xbongo', '..b.bb..b.b.bbb.', { map: { b: ['bongo', 0.7] } });
        },
      },
      B: {
        bars: 8, chords: 'C | G | D7 | G | C | G | D7 | G',
        build(b) {
          b.mel('acc', 'E5:3 E5:1 G5:2 E5:2 C5:4 E5:4 | D5:3 D5:1 G5:2 D5:2 B4:4 D5:4 | C5:2 D5:2 E5:2 F#5:2 A5:4 F#5:4 | G5:4 B5:4 G5:4 r:4 |'
            + ' G5:2 E5:2 G5:2 C6:2 B5:2 A5:2 G5:4 | F#5:2 G5:2 B5:2 D6:2 B5:2 G5:2 D5:4 | A5:2 F#5:2 D5:2 F#5:2 A5:2 C6:2 B5:2 A5:2 | G5:6 r:2 D5:2 E5:2 F#5:2 D5:2',
          { vel: 0.85, harm: -2, harmCh: 'acc2', harmVel: 0.85 });
          b.bass('tuba', 'R---....5---....', { lo: 31 });
          b.strum('bajo', '....D...x...D.U.', { lo: 40, top: 64, ring: 2 });
          b.drum('kick', 'X.......X.......', { drum: 'kick' });
          b.drum('snare', '....x...g...x.g.', { drum: 'snare' });
          b.drum('hat', '..x...x...x...x.', { drum: 'hat' });
          b.drum('xtamb', 'x.o.x.o.x.o.x.o.', { drum: 'tamb' });
          b.drum('xbongo', '..b.bb..b.b.bbb.', { map: { b: ['bongo', 0.7] } });
        },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'B'], loopTo: 1,
  },

  // ==================================================================== CANTINA 2 (cumbia sonidera)
  cantina2: {
    bpm: 100, key: 'D harmonic', swing16: 0.53, gain: 0.67,
    channels: {
      org: { inst: 'organ', gain: 0.58, pan: 0.05, rev: 0.22 },
      req: { inst: 'requinto', gain: 0.32, pan: -0.32, rev: 0.18 },
      acc: { inst: 'accordion', gain: 0.24, pan: 0.3, rev: 0.12 },
      bass: { inst: 'ebass', gain: 0.6 },
      guiro: { inst: 'drum', gain: 0.5, pan: 0.32 },
      conga: { inst: 'drum', gain: 0.42, pan: -0.2, rev: 0.08 },
      kick: { inst: 'drum', gain: 0.55 },
      timb: { inst: 'drum', gain: 0.32, pan: 0.25, rev: 0.12 },
      cow: { inst: 'drum', gain: 0.14, pan: 0.15 },
      xshk: { inst: 'drum', gain: 0.18, pan: -0.3, layer: [0.3, 0.8] },
      xconga: { inst: 'drum', gain: 0.32, pan: 0.35, layer: [0.5, 1.0] },
    },
    sections: {
      intro: {
        bars: 2, chords: 'Dm | A7',
        build(b) {
          b.arp('req', '0.1.2.3.4.3.2.1.', { gv: 1, ring: 2, lo: 50, top: 74, vel: 0.65 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('timb', '............hhHH', { map: TIMB, bars: [1] });
          b.mel('org', 'r:16 | r:12 A4:2 C#5:2', { vel: 0.8 });
        },
      },
      A: {
        bars: 8, chords: 'Dm | Gm | C | F | Bb | Gm | A7 | Dm',
        build(b) {
          b.mel('org', 'A4:2 D5:2 F5:2 A5:4 G5:2 F5:2 E5:2 | D5:6 Bb4:2 G4:4 r:4 | G4:2 C5:2 E5:2 G5:4 F5:2 E5:2 D5:2 | C5:6 A4:2 F4:4 r:4 |'
            + ' F4:2 Bb4:2 D5:2 F5:4 E5:2 D5:2 C5:2 | D5:4 Bb4:4 G4:4 A4:4 | C#5:2 E5:2 G5:2 A5:4 G5:2 E5:2 C#5:2 | D5:12 r:4', { vel: 0.85 });
          b.hits('acc', '..x...x...x...x.', { lo: 57, n: 3, vel: 0.7 });
          b.bass('bass', 'R-----r-5-----5-', { lo: 33 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('kick', 'X.......X.......', { drum: 'kick_soft' });
          b.drum('conga', '....s..hl...s.hh', { map: CONGA });
          b.drum('cow', 'x...x...x...x...', { drum: 'cowbell' });
          b.drum('timb', '................|................|................|............hhHH', { map: TIMB });
          b.drum('xshk', 'xoxoxoxoxoxoxoxo', { drum: 'shaker' });
          b.drum('xconga', 'h.h.l.hhh.h.l.ll', { map: CONGA });
        },
      },
      B: {
        bars: 8, chords: 'Gm | Dm | A7 | Dm | Gm | Dm | E7 A7 | Dm',
        build(b) {
          b.mel('org', 'Bb5:4 A5:2 G5:2 D5:4 G5:4 | F5:4 E5:2 D5:2 A4:8 | E5:4 G5:2 E5:2 C#5:4 A4:4 | D5:4 F5:4 A5:8 |'
            + ' G5:2 A5:2 Bb5:4 A5:2 G5:2 F5:4 | A5:4 F5:4 D5:4 F5:4 | E5:2 G#5:2 B5:2 D6:2 C#6:2 A5:2 G5:2 E5:2 | D5:12 r:4', { vel: 0.85 });
          b.arp('req', '0.1.2.3.4.3.2.1.', { gv: 1, ring: 2, lo: 50, top: 74, vel: 0.55 });
          b.hits('acc', '..x...x...x...x.', { lo: 57, n: 3, vel: 0.65 });
          b.bass('bass', 'R-----r-5-----5-', { lo: 33 });
          b.drum('guiro', 'L.ssL.ssL.ssL.ss', { map: GUIRO });
          b.drum('kick', 'X.......X.......', { drum: 'kick_soft' });
          b.drum('conga', '....s..hl...s.hh', { map: CONGA });
          b.drum('cow', 'x...x...x...x...', { drum: 'cowbell' });
          b.drum('timb', '................|............hhHH', { map: TIMB });
          b.drum('xshk', 'xoxoxoxoxoxoxoxo', { drum: 'shaker' });
          b.drum('xconga', 'h.h.l.hhh.h.l.ll', { map: CONGA });
        },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'B'], loopTo: 1,
  },

  // ==================================================================== MADAM MOLT'S SHOP (lounge)
  // Sleazy swing, 84 BPM, F minor ii-V-i. Walking bass, vibes, muted trumpet, brushes.
  shop: {
    bpm: 84, key: 'F minor', swing8: 0.64, gain: 0.62,
    channels: {
      tp: { inst: 'mute', gain: 0.55, pan: 0.18, rev: 0.28 },
      vib: { inst: 'vibes', gain: 0.42, pan: -0.25, rev: 0.32, trem: [4.8, 0.3] },
      pno: { inst: 'epiano', gain: 0.48, pan: -0.1, rev: 0.22 },
      bass: { inst: 'ubass', gain: 0.67, hum: 0.006 },
      ride: { inst: 'drum', gain: 0.57, pan: 0.32 },
      brush: { inst: 'drum', gain: 0.76, pan: -0.05 },
      swish: { inst: 'drum', gain: 0.45 },
      hatf: { inst: 'drum', gain: 0.19, pan: 0.2 },
    },
    sections: {
      intro: {
        bars: 2, chords: 'Fm7 | Gm7b5 C7b9',
        build(b) {
          b.walk('bass', { lo: 29, hi: 53 });
          b.hits('pno', 'X-----x---------', { top: 70, n: 4, vel: 0.6 });
          b.drum('swish', 'x...x...x...x...', { drum: 'brush_swish' });
          b.drum('brush', '....x.......x...', { drum: 'brush_tap' });
          b.mel('vib', 'r:16 | r:8 G5:2 Ab5:2 B5:2 C6:2', { vel: 0.6 });
        },
      },
      A: {
        bars: 8, chords: 'Fm7 | Fm7 | Bbm7 | Bbm7 | Gm7b5 | C7b9 | Fm7 | Gm7b5 C7b9',
        build(b) {
          b.mel('tp', 'r:2 C5:2 Eb5:2 F5:6 Eb5:2 C5:2 | Ab4:6 Bb4:2 C5:4 r:4 | r:2 Db5:2 F5:2 Ab5:6 F5:2 Db5:2 | C5:6 Bb4:2 Ab4:4 r:4 |'
            + ' G4:2 Bb4:2 Db5:2 F5:4 Eb5:2 Db5:2 r:2 | E4:4 Db5:4 C5:2 Bb4:2 G4:4 | F4:8 r:2 C5:2 Ab4:2 F4:2 | G4:4 Ab4:4 Bb4:2 B4:2 C5:4', { vel: 0.85 });
          b.walk('bass', { lo: 29, hi: 53 });
          b.hits('pno', 'X-----x---------|......x-....x---', { top: 70, n: 4, vel: 0.55 });
          b.drum('ride', 'X...x.o.X...x.o.', { drum: 'ride' });
          b.drum('brush', '....x.......x...', { drum: 'brush_tap' });
          b.drum('swish', 'x...x...x...x...', { drum: 'brush_swish' });
          b.drum('hatf', '....x.......x...', { drum: 'hat' });
        },
      },
      B: {
        bars: 8, chords: 'Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Gm7b5 | C7b9 | Fm7 | Fm7 C7',
        build(b) {
          b.mel('vib', 'F5:4 Db5:2 F5:2 Ab5:6 F5:2 | G5:4 Eb5:2 Db5:2 Bb4:8 | C5:2 Eb5:2 G5:2 Ab5:6 G5:2 Eb5:2 | F5:8 C5:4 Ab4:4 |'
            + ' Bb4:2 Db5:2 F5:2 Ab5:4 G5:2 F5:2 Db5:2 | E5:4 G5:4 Bb5:4 Db6:4 | C6:6 Ab5:2 F5:8 | r:8 E5:4 G5:4', { vel: 0.75 });
          b.mel('tp', 'r:16 | r:16 | r:16 | r:8 Ab4:2 Bb4:2 C5:4 | r:16 | r:16 | r:16 | r:8 E4:2 G4:2 Bb4:4', { vel: 0.7 });
          b.walk('bass', { lo: 29, hi: 53 });
          b.hits('pno', 'X-----x---------|....x-......x---', { top: 70, n: 4, vel: 0.5 });
          b.drum('ride', 'X...x.o.X...x.o.', { drum: 'ride' });
          b.drum('brush', '....x.......x...', { drum: 'brush_tap' });
          b.drum('swish', 'x...x...x...x...', { drum: 'brush_swish' });
          b.drum('hatf', '....x.......x...', { drum: 'hat' });
        },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'B'], loopTo: 1,
  },

  // ==================================================================== RESULTS (triumphant)
  results: {
    bpm: 118, key: 'C major', gain: 0.5,
    channels: {
      tp1: { inst: 'brass', gain: 0.6, pan: -0.1, rev: 0.22, opts: { vibRate: 6, vib: 0.008 } },
      tp2: { inst: 'brass', gain: 0.42, pan: 0.16, rev: 0.22, opts: { vibRate: 5.8, vib: 0.008 } },
      vih: { inst: 'vihuela', gain: 0.38, pan: -0.3, rev: 0.12 },
      mar: { inst: 'marimba', gain: 0.78, pan: 0.25, rev: 0.25 },
      bass: { inst: 'ebass', gain: 0.55 },
      kick: { inst: 'drum', gain: 0.6 },
      clap: { inst: 'drum', gain: 0.63, rev: 0.15 },
      snare: { inst: 'drum', gain: 0.35, rev: 0.1 },
      hat: { inst: 'drum', gain: 0.7, pan: 0.22 },
      tamb: { inst: 'drum', gain: 0.25, pan: -0.25 },
      crash: { inst: 'drum', gain: 0.3, rev: 0.1 },
    },
    sections: {
      intro: {
        bars: 2, chords: 'C | G',
        build(b) {
          b.strum('vih', 'D.....D.....D.U.', { vel: 0.85 });
          b.drum('kick', 'X.....X.....X...', { drum: 'kick' });
          b.drum('crash', 'X...............', { bars: [0] });
          b.roll('snare', 'snare', 24, 8, 0.15, 0.7);
          b.bass('bass', 'R.....R.....R...', { lo: 31 });
        },
      },
      A: {
        bars: 8, chords: 'C | G | Am | F | C | F | G | C',
        build(b) {
          b.mel('tp1', 'G4:2 C5:2 E5:2 G5:6 E5:2 G5:2 | D5:4 G5:4 F5:2 E5:2 D5:4 | E5:2 A5:2 C6:2 A5:4 G5:2 E5:4 | F5:6 E5:2 D5:2 C5:2 A4:4 |'
            + ' G4:2 C5:2 E5:2 G5:6 A5:2 G5:2 | A5:4 C6:4 A5:2 G5:2 F5:4 | D5:2 E5:2 F5:2 G5:4 A5:2 B5:4 | C6:12 r:4', { vel: 0.9, harm: -2, harmCh: 'tp2', harmVel: 0.85 });
          b.strum('vih', 'D.dUD.dUD.dUD.dU');
          b.arp('mar', '....0.1.....2.3.', { lo: 72, hi: 91, vel: 0.5 });
          b.bass('bass', 'R--R--R-5--5--R-', { lo: 31 });
          b.drum('kick', 'X...X...X...X...', { drum: 'kick' });
          b.drum('clap', '....X.......X...', { drum: 'clap' });
          b.drum('hat', '..x...x...x...x.', { drum: 'hat' });
          b.drum('tamb', 'xgxgxgxgxgxgxgxg', { drum: 'tamb' });
          b.drum('crash', 'X...............', { bars: [0, 4] });
        },
      },
      B: {
        bars: 8, chords: 'F | G | Em | Am | Dm | G | C | G7',
        build(b) {
          b.mel('mar', 'A5:2 C6:2 A5:2 F5:2 G5:2 A5:2 C6:4 | B5:2 D6:2 B5:2 G5:2 A5:2 B5:2 D6:4 | G5:2 B5:2 G5:2 E5:2 F#5:2 G5:2 B5:4 | C6:2 A5:2 E5:2 A5:2 C6:4 B5:2 A5:2 |'
            + ' F5:2 A5:2 D6:2 A5:2 F5:2 A5:2 D6:4 | D6:2 B5:2 G5:2 B5:2 D6:2 F6:2 E6:2 D6:2 | E6:4 C6:4 G5:4 E5:4 | F5:4 D5:4 B4:4 G4:4', { vel: 0.85 });
          b.hits('tp1', 'X.....X...X.....', { top: 79, n: 3, vel: 0.75 });
          b.hits('tp2', 'X.....X...X.....', { top: 72, n: 2, vel: 0.65 });
          b.strum('vih', 'D.dUD.dUD.dUD.dU');
          b.bass('bass', 'R--R--R-5--5--R-', { lo: 31 });
          b.drum('kick', 'X...X...X...X...', { drum: 'kick' });
          b.drum('clap', '....X.......X...', { drum: 'clap' });
          b.drum('hat', 'x.x.x.x.x.x.x.x.', { drum: 'hat' });
          b.drum('tamb', 'xgxgxgxgxgxgxgxg', { drum: 'tamb' });
          b.drum('crash', 'X...............', { bars: [0, 4] });
          b.roll('snare', 'snare', 7 * 16 + 8, 8, 0.15, 0.7);
        },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'B'], loopTo: 1,
  },

  // ==================================================================== TRAINING (chill beat)
  training: {
    bpm: 100, key: 'C major', swing16: 0.58, gain: 0.65,
    channels: {
      ep: { inst: 'epiano', gain: 0.5, pan: -0.08, rev: 0.25, lp: 4000 },
      vib: { inst: 'vibes', gain: 0.95, pan: 0.22, rev: 0.38, trem: [4.6, 0.3] },
      gtr: { inst: 'nylon', gain: 0.85, pan: -0.3, rev: 0.25 },
      bass: { inst: 'ubass', gain: 0.6 },
      kick: { inst: 'drum', gain: 0.6 },
      rim: { inst: 'drum', gain: 0.6, rev: 0.12 },
      hat: { inst: 'drum', gain: 0.4, pan: 0.25 },
      shk: { inst: 'drum', gain: 0.22, pan: -0.25 },
      bub: { inst: 'bubble', gain: 0.25, pan: -0.3, rev: 0.6 },
    },
    sections: {
      A: {
        bars: 8, chords: 'Dm9 | G13 | Cmaj9 | Am9 | Dm9 | G13 | Cmaj9 | Am9',
        build(b) {
          b.mel('vib', 'r:4 A5:2 C6:2 E6:4 D6:4 | B5:6 A5:2 F5:4 r:4 | r:4 G5:2 B5:2 D6:4 E6:4 | C6:6 B5:2 G5:4 r:4 |'
            + ' r:4 A5:2 C6:2 F6:4 E6:4 | D6:6 C6:2 B5:4 r:4 | r:4 E6:2 D6:2 B5:4 G5:4 | A5:12 r:4', { vel: 0.7 });
          b.hits('ep', 'X-------..x-----', { top: 72, n: 4, vel: 0.6 });
          b.bass('bass', 'R-------..R-5---', { lo: 31 });
          b.drum('kick', 'X.....x...X.....', { drum: 'kick_soft' });
          b.drum('rim', '....X.......X...', { drum: 'rim' });
          b.drum('hat', 'x.o.x.oxx.o.x.o.', { drum: 'hat' });
          b.drum('shk', '..x...x...x...x.', { drum: 'shaker' });
          b.sprinkle('bub', { steps: [14], prob: 0.3, notes: [86, 88, 91, 93], vel: 0.4 });
        },
      },
      B: {
        bars: 8, chords: 'Bbmaj7 | A7 | Dm9 | Dm9 | Bbmaj7 | A7 | Dm9 | G13',
        build(b) {
          b.mel('gtr', 'D5:2 F5:2 A5:2 F5:2 D5:4 r:4 | C#5:2 E5:2 G5:2 E5:2 C#5:4 r:4 | E5:2 F5:2 A5:2 C6:2 A5:4 r:4 | r:16 |'
            + ' D5:2 F5:2 A5:2 C6:2 A5:4 F5:4 | E5:2 G5:2 C#6:2 E6:2 C#6:4 r:4 | D6:2 C6:2 A5:2 F5:2 E5:4 r:4 | r:8 B4:2 D5:2 F5:4', { vel: 0.7 });
          b.hits('ep', 'X-------..x-----', { top: 72, n: 4, vel: 0.6 });
          b.bass('bass', 'R-------..R-5---', { lo: 31 });
          b.drum('kick', 'X.....x...X.....', { drum: 'kick_soft' });
          b.drum('rim', '....X.......X...', { drum: 'rim' });
          b.drum('hat', 'x.o.x.oxx.o.x.o.', { drum: 'hat' });
          b.drum('shk', '..x...x...x...x.', { drum: 'shaker' });
        },
      },
    },
    form: ['A', 'B'], loopTo: 0,
  },

  // ==================================================================== DEMON MODE
  // Dark drone, heartbeat pulses, detuned music box lullaby, dissonant brass swells. 70 BPM.
  demon: {
    bpm: 70, key: 'C harmonic', gain: 0.61,
    channels: {
      drone: { inst: 'pad', gain: 0.5, rev: 0.35, opts: { a: 3, r: 3, cut: 380, sweep: 0.07 } },
      heart: { inst: 'drum', gain: 0.75 },
      box: { inst: 'musicbox', gain: 0.75, pan: 0.2, rev: 0.55, detune: 38 },
      swell: { inst: 'bone', gain: 0.24, pan: -0.2, rev: 0.45, opts: { swell: 0.85, vibRate: 7, vib: 0.012 } },
      bell: { inst: 'bell', gain: 0.32, rev: 0.6, pan: -0.1, opts: { len: 1.6 } },
      cym: { inst: 'drum', gain: 0.3, rev: 0.35 },
      sub: { inst: 'ubass', gain: 0.6 },
    },
    sections: {
      A: {
        bars: 8, chords: 'Cm | Cm | Db | Cm | Cm | Abmaj7 | Gb | G7',
        build(b) {
          b.pad('drone', { lo: 36, n: 3, vel: 0.7, bass: 24 });
          b.drum('heart', 'X.......X.......', { drum: 'heart' });
          b.mel('box', 'G5:4 Eb5:4 D5:4 C5:4 | D5:4 Eb5:4 G5:8 | Ab5:4 F5:4 Eb5:4 Db5:4 | C5:12 r:4 |'
            + ' G5:4 C6:4 B5:4 G5:4 | Ab5:4 G5:4 Eb5:8 | F5:4 Gb5:4 Db5:8 | D5:4 F5:4 B4:8', { vel: 0.75, oct: 1 });
          b.mel('swell', 'C3+Db3+G3:32 | C3+D3+Gb3:32 | Bb2+Db3+E3:32 | B2+F3+Ab3:32', { vel: 0.8 });
          b.mel('bell', 'C3:64 | r:64', { vel: 0.7, expect: 128 });
          b.bass('sub', 'R---------------', { lo: 24 });
          b.drum('cym', '..........X.....', { drum: 'revcym', bars: [3, 7] });
        },
      },
      B: {
        bars: 8, chords: 'Cm | Db | Cm | Gb | Cm | Db | Abmaj7 | G7b9',
        build(b) {
          b.pad('drone', { lo: 36, n: 3, vel: 0.75, bass: 24 });
          b.drum('heart', 'X.......X...X...', { drum: 'heart' });
          b.mel('box', 'C6:6 B5:2 G5:8 | Ab5:6 G5:2 F5:8 | Eb5:4 D5:4 C5:4 B4:4 | C5:16 |'
            + ' r:4 G5:4 Gb5:4 F5:4 | Eb5:8 Db5:8 | C5:4 Eb5:4 Ab5:4 G5:4 | F5:4 D5:4 B4:8', { vel: 0.7, oct: 1 });
          b.mel('swell', 'C3+Gb3+B3:32 | Db3+G3+C4:32 | C3+Db3+Ab3:32 | B2+F3+Ab3:32', { vel: 0.85 });
          b.mel('bell', 'r:64 | Gb2:64', { vel: 0.6, expect: 128 });
          b.bass('sub', 'R---------------', { lo: 24 });
          b.drum('cym', '..........X.....', { drum: 'revcym', bars: [3, 7] });
        },
      },
    },
    form: ['A', 'B'], loopTo: 0,
  },
};

/** Track name aliases (title just plays the menu theme). */
export const TRACK_ALIASES = { title: 'menu' };

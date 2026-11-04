# MANTIS MAYHEM

An underwater mantis-shrimp fighting game with 3D voxel arenas, pixel-art UI, and a lot of
cavitation bubbles. Four fighters, two interactive arenas, local versus, vs CPU, training, and
online play with friends via room codes. Madam Molt runs the fight club and sells cosmetics in her
secret locker shop.

![fighters](https://img.shields.io/badge/fighters-4-ff6a4a) ![arenas](https://img.shields.io/badge/arenas-2-49c2bd) ![build](https://img.shields.io/badge/build-vite-646cff)

## Play

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL (default http://localhost:5173). For a production build:

```bash
npm run build
```

The `dist/` folder is a static site and can be hosted anywhere (GitHub Pages, itch.io, Netlify...).

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move / jump / duck | `W A S D` | Arrow keys |
| Light | `F` | `K` (or Numpad 1) |
| Heavy | `G` | `L` (or Numpad 2) |
| Block | `H` | `;` (or Numpad 3) |

In single-player modes either key set works (and `J` `X` `C` too). Gamepads: X = light, Y = heavy,
B/RB = block, A = jump, LB = ultimate. Everything can be rebound in **Settings → Controls**.
`Esc` pauses (move list is in the pause menu).

### Fighting basics
* **Combos:** `L, L, H` works for everyone. `Down+H` uppercut, `Forward+L` jab barrage, jump `H` aerial.
* **Spring punch:** hold `H` to wind up a charged punch. Full charge wall-splats.
* **Specials:** `Forward+H` and `Back+H` are character specials (see the move list).
* **Block** with `Block` (crouch-block lows with `Down`). Jump-ins must be blocked standing.
* **Perfect block:** press block just before a hit lands. No shell damage, attacker staggers.
* **Shell:** blocking chips your shell; heavy hits chip more. At zero it shatters and you're dizzy.
  **Molt** (hold `Block + Heavy` for 3 s) to grow a new shell. You're vulnerable while molting, and
  your old shell stays on the floor.
* **Dodge:** `Block + Left/Right`. **Dash:** double-tap a direction. **Throw:** `Light + Block`.
* **Ultimate:** `Light + Heavy` together when the meter is full.
* **KO finisher:** a lethal hit starts a button-mash duel. The defender escapes more easily the more
  health they had before the hit.

### Fighters
* **Jim** (peacock mantis shrimp): balanced smasher, cavitation cannon, counter stance, chuunibyou.
* **Brutus** (zebra mantis shrimp): huge spearer, armor, long spear snag, eats snails to heal,
  Belly Flop of Doom.
* **Bobby** (purple spot mantis shrimp): tiny, chaotic, random junk tosses... and something
  happens when his cone cracks at half health.
* **Mimi** (pink-eared mantis shrimp): throws and recalls her jellyfish Puru, bubble traps,
  Puru Puru Tornado.

### Arenas
* **The Rust Pit:** catwalks, a moving crane pallet, rolling barrels, breakable crates (sometimes
  with snails inside), bubble vents you can ride, and a very lonely hermit-crab referee.
* **Soggy Bottom Cantina:** grab drinks (`Light+Block`), throw them (`Light`) or drink (`Heavy`) to
  heal. Too many and you get tipsy. Tables break, the chandelier falls, the piñata is full of
  snails, and the jukebox changes the song when you hit it.

## Online play

Online uses WebRTC (PeerJS). One player chooses **Host** and gets a 5-letter code; the other chooses
**Join** and types it. By default it uses the free public PeerJS broker (`0.peerjs.com`) for the
handshake. To use your own broker (LAN parties, or if the public one is down):

```bash
npm run peer-server
```

Then open the game with `?peer=YOUR-IP:9000/mm` in the URL on both machines.
The fight runs a deterministic simulation in lockstep with adaptive input delay; both sides compare
state hashes and resync automatically if anything drifts.

## Development

* `?screen=match&p1=jim&p2=brutus&ai1=3&cpu=3&stage=cantina` jumps straight into a fight (CPU vs CPU).
* `?screen=models` shows the fighter models; `?q=low|medium|high` overrides graphics quality.
* `node tools/simtest.mjs` runs a headless soak + determinism test of the combat simulation.
* `node tools/audio-test/run.cjs` renders and checks every synthesized sound (needs Playwright).

Everything (models, textures, UI art, music, sound) is generated procedurally at runtime: voxel
models are built in code, UI sprites are drawn pixel-by-pixel, and audio is synthesized with the Web
Audio API. Fonts are OFL-licensed pixel fonts (Silkscreen, Tiny5, Jersey 10) from
[Fontsource](https://fontsource.org). Libraries: three.js (MIT), PeerJS (MIT), Vite (MIT).

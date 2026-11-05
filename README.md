# MANTIS MAYHEM

An underwater mantis-shrimp fighting game drawn entirely in detailed 2D pixel art: humanoid,
fully clothed fighters rasterized procedurally every frame, pixel-only effects (no glow, no 3D),
best-of-3 sets where health carries over, a skill draft, and cinematic ultimates with a QTE.
Four fighters, two interactive arenas, local versus, vs CPU, training and online play with room
codes. The lobby is an underwater dive bar inside an abandoned oil rig, and Madam Molt sells
cosmetics in her hidden shop behind it.

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
| Skills 1 / 2 / 3 | `R` `T` `Y` | `I` `O` `P` (or Numpad 4-6) |

In single-player modes either key set works (and `J` `X` `C`, skills `1` `2` `3` too). Gamepads:
X = light, Y = heavy, B = block, A = jump, LB/RB/LT = skills, RT = ultimate. Everything can be
rebound in **Settings → Controls**. `Esc` pauses (move list is in the pause menu).

### Sets, skills and ultimates
* **3 sets:** a match is best of 3 sets. **Health carries over:** the fighter who wins a set keeps
  the health they finished with; the one who fell gets back up fresh.
* **Skills (3 slots):** pick 1 of 3 skill cards at the start. Every time you fall you pick one more,
  and before the final set both fighters pick another. Each has its own cooldown, shown on the HUD:
  Cavitation Mine, Riptide Dash, Habanero Rage, Polarized Eyes, Coral Wall, Anchor Hook, Lotería,
  Hermit Armor, Molt Decoy, Electric Eel, Mariachi Blast and Piñata Bomb.
* **Ultimate:** fill the flaming meter, then press `Light + Heavy`. If it connects, a full cutscene
  plays: hit the four timed button prompts for bonus damage while your opponent mashes to resist.

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
  Add `&noskills=1` to skip the skill draft or `&pick=60` for a short draft timer.
* `devpx.html?c=jim,brutus,bobby,demon,mimi&move=jab,heavy&mf=9` previews fighters / move frames.
* `devstage.html?stage=rustpit` previews the arenas, `devstage.html?bar=1&cam=overview` the bar.
* `node tools/simtest.mjs` runs a headless soak + determinism test of the combat simulation.
* `node tools/audio-test/run.cjs` renders and checks every synthesized sound (needs Playwright).

Everything (characters, arenas, UI art, music, sound) is generated procedurally at runtime: the
fighters are rasterized from a 2D skeleton every frame by a small software renderer (banded cel
shading, selective outlines, cloth and shell textures), arenas are painted pixel by pixel into
parallax layers, and audio is synthesized with the Web Audio API. Fonts are OFL-licensed pixel
fonts (Silkscreen, Tiny5, Jersey 10) from [Fontsource](https://fontsource.org). Libraries: PeerJS
(MIT), Vite (MIT).

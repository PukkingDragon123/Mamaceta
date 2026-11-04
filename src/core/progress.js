// Progression: match rewards (snails + XP), daily challenges, daily shop rotation.
import { Save } from './save.js';
import { todayKey, hashString, seeded } from './math.js';
import { allItems } from '../data/cosmetics.js';
import { RARITY } from '../ui/palette.js';

export const CHALLENGE_POOL = [
  { id: 'cav15', text: 'Pop 15 cavitation bubbles', stat: 'cav', goal: 15, reward: 90 },
  { id: 'sb2', text: 'Break 2 shells', stat: 'shellBreaksDealt', goal: 2, reward: 110 },
  { id: 'perf5', text: 'Land 5 perfect blocks', stat: 'perfects', goal: 5, reward: 110 },
  { id: 'molt2', text: 'Molt 2 times', stat: 'molts', goal: 2, reward: 70 },
  { id: 'ult3', text: 'Unleash 3 ultimates', stat: 'ults', goal: 3, reward: 100 },
  { id: 'snail5', text: 'Collect 5 snails in arenas', stat: 'snails', goal: 5, reward: 70 },
  { id: 'throw4', text: 'Throw opponents 4 times', stat: 'throws', goal: 4, reward: 70 },
  { id: 'drink3', text: 'Drink 3 kelp cervezas', stat: 'drinks', goal: 3, reward: 60 },
  { id: 'dmg3k', text: 'Deal 3000 damage', stat: 'dmg', goal: 3000, reward: 90 },
  { id: 'win3', text: 'Win 3 matches', stat: 'wins', goal: 3, reward: 160 },
  { id: 'esc1', text: 'Survive a KO finisher', stat: 'qteEsc', goal: 1, reward: 130 },
  { id: 'combo8', text: 'Land an 8-hit combo', stat: 'maxCombo', goal: 8, reward: 120, max: true },
  { id: 'demon', text: 'Trigger Bobby\'s demon mode', stat: 'demon', goal: 1, reward: 100 },
  { id: 'winJim', text: 'Win a match as Jim', stat: 'win_jim', goal: 1, reward: 100 },
  { id: 'winBrutus', text: 'Win a match as Brutus', stat: 'win_brutus', goal: 1, reward: 100 },
  { id: 'winBobby', text: 'Win a match as Bobby', stat: 'win_bobby', goal: 1, reward: 120 },
  { id: 'winMimi', text: 'Win a match as Mimi', stat: 'win_mimi', goal: 1, reward: 100 },
  { id: 'cantina', text: 'Win a match in the Cantina', stat: 'win_cantina', goal: 1, reward: 90 },
  { id: 'rustpit', text: 'Win a match in the Rust Pit', stat: 'win_rustpit', goal: 1, reward: 90 },
];

export function dailyChallenges() {
  const d = Save.data;
  const day = todayKey();
  if (d.challenges.day !== day || !d.challenges.list.length) {
    const r = seeded(hashString('chal' + day));
    const pool = CHALLENGE_POOL.slice();
    const list = [];
    while (list.length < 3 && pool.length) list.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
    d.challenges = { day, list: list.map((id) => ({ id, progress: 0, done: false })) };
    Save.markDirty();
  }
  return d.challenges.list.map((c) => ({ ...CHALLENGE_POOL.find((p) => p.id === c.id), ...c }));
}

export function dailyShop() {
  const day = todayKey();
  const r = seeded(hashString('shop' + day));
  const items = allItems();
  // weighted: guarantee variety of slots; prefer unowned
  const unowned = items.filter((it) => !Save.owns(it.id));
  const pool = (unowned.length >= 5 ? unowned : items).slice();
  const out = [];
  const slotsWanted = ['skin', 'skin', 'gloves', 'hitfx', r() < 0.5 ? 'trail' : 'victory'];
  for (const slot of slotsWanted) {
    const cands = pool.filter((p) => p.slot === slot && !out.includes(p));
    const list = cands.length ? cands : pool.filter((p) => !out.includes(p));
    if (!list.length) break;
    const it = list[Math.floor(r() * list.length)];
    out.push(it);
  }
  return out.map((it) => ({ ...it, price: priceFor(it) }));
}
export function priceFor(it) {
  const base = RARITY[it.rarity]?.price ?? 200;
  const slotMul = it.slot === 'skin' ? 1 : it.slot === 'gloves' ? 0.7 : it.slot === 'hitfx' ? 0.65 : 0.55;
  return Math.round((base * slotMul) / 10) * 10;
}

// Apply a finished match to the profile. who: indices of local players whose stats count.
export function applyMatchResult(res, o) {
  const d = Save.data;
  const out = { snails: [], total: 0, xp: 0, levelUps: 0, challenges: [], firstWin: false };
  if (o.mode === 'training') return out;
  const local = o.localPlayers; // e.g. [0] or [0,1]
  const winner = res.winner;
  const add = (label, n) => { if (n > 0) { out.snails.push({ label, n }); out.total += n; } };
  const mine = local.includes(winner);
  if (o.mode === 'local') add('Match played', 80);
  else if (mine) add('Victory!', o.mode === 'online' ? 170 : 110 + (o.cpuLevel || 2) * 20);
  else add('Good effort', o.mode === 'online' ? 60 : 45);
  let collected = 0, perfects = 0;
  for (const i of local) { collected += res.stats[i].snails || 0; }
  if (collected) add(`Arena snails x${collected}`, collected * 5);
  const rw = res.cfg?.roundWinners || [];
  if (mine && o.mode !== 'local' && Save.firstWinToday()) { add('First win of the day', 150); d.lastWinDay = todayKey(); out.firstWin = true; }
  // stats
  d.stats.matches++;
  if (o.mode !== 'local') { if (mine) d.stats.wins++; else d.stats.losses++; }
  for (const i of local) {
    const st = res.stats[i];
    d.stats.perfectBlocks += st.perfects || 0; d.stats.molts += st.molts || 0; d.stats.qteEscapes += st.qteEsc || 0; d.stats.ults += st.ults || 0;
  }
  if (winner >= 0) d.stats.charWins[res.fighters[winner].char] = (d.stats.charWins[res.fighters[winner].char] || 0) + (local.includes(winner) ? 1 : 0);
  // challenges
  const ch = dailyChallenges();
  for (const c of ch) {
    if (c.done) continue;
    let gain = 0;
    for (const i of local) {
      const st = res.stats[i];
      const oSt = res.stats[1 - i];
      const won = winner === i;
      const charId = res.fighters[i].char;
      switch (c.stat) {
        case 'wins': gain += won ? 1 : 0; break;
        case 'shellBreaksDealt': gain += oSt.shellBreaks || 0; break;
        case 'maxCombo': gain = Math.max(gain, st.maxCombo || 0); break;
        case 'win_jim': case 'win_brutus': case 'win_bobby': case 'win_mimi': gain += won && c.stat === 'win_' + charId ? 1 : 0; break;
        case 'win_cantina': case 'win_rustpit': gain += won && c.stat === 'win_' + o.stage ? 1 : 0; break;
        default: gain += st[c.stat] || 0;
      }
    }
    const entry = d.challenges.list.find((x) => x.id === c.id);
    entry.progress = c.max ? Math.max(entry.progress, gain) : entry.progress + gain;
    if (entry.progress >= c.goal) { entry.done = true; add('Challenge: ' + c.text, c.reward); out.challenges.push(c); }
  }
  // xp
  out.xp = 60 + (mine ? 60 : 20) + Math.min(80, Math.round((res.stats[local[0]].dmg || 0) / 40));
  out.levelUps = Save.addXp(out.xp);
  if (out.levelUps) add(`Level up! (x${out.levelUps})`, 100 * out.levelUps);
  Save.addSnails(out.total);
  Save.save();
  return out;
}

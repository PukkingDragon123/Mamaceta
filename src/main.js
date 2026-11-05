import { loadFontFaces } from './ui/font.js';
import { Save } from './core/save.js';

const bootFill = document.getElementById('bootfill');
const bootMsg = document.getElementById('bootmsg');
function progress(p, msg) { if (bootFill) bootFill.style.width = Math.round(p * 100) + '%'; if (msg && bootMsg) bootMsg.textContent = msg; }

async function boot() {
  try {
    progress(0.1, 'pumping out the water...');
    Save.load();
    await loadFontFaces('./');
    progress(0.35, 'polishing shells...');
    const { Game } = await import('./game.js');
    const game = new Game();
    progress(0.55, 'waking up the shrimp...');
    const params = new URLSearchParams(location.search);
    const { createFirstScreen } = await import('./screens/boot.js');
    const first = await createFirstScreen(game, params, (p, m) => progress(0.55 + p * 0.45, m));
    progress(1, 'FIGHT!');
    game.start(first);
    const b = document.getElementById('boot');
    if (b) { b.style.transition = 'opacity .4s'; b.style.opacity = '0'; setTimeout(() => b.remove(), 450); }
    window.__booted = true;
  } catch (e) {
    console.error(e);
    window.__bootError = String(e && e.stack || e);
    const b = document.getElementById('boot');
    if (b) { const d = document.createElement('div'); d.className = 'err'; d.textContent = 'Failed to start: ' + (e && e.message || e) + '\n\nTry a recent Chrome, Edge, Firefox or Safari.'; b.appendChild(d); }
  }
}
boot();

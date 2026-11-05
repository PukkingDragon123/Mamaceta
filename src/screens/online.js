// Online lobby: host a room (get a code) or join a friend's room by typing their code.
import { ensureLobby, lobbyFighters, goMainMenu, goCharSelect } from './flow.js';
import { NetSession } from '../net/net.js';
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { Sound } from '../core/sound.js';
import { Save, CHARS } from '../core/save.js';
import { hintBar } from '../ui/widgets.js';

export class OnlineScreen {
  enter() {
    const g = this.game;
    this.L = ensureLobby();
    this.F = lobbyFighters();
    this.L.homeAll();
    this.L.setCam(Save.data.mainFighter, 1.4, { drift: 0.04, dx: 1.2 });
    this.state = 'menu'; this.sel = 0; this.code = ''; this.t = 0;
    this.net = null; this.msg = '';
    this.editingName = false;
    this.peerHost = new URLSearchParams(location.search).get('peer') || Save.settings.peerHost || '';
    Sound.music('menu', { fade: 1 });
  }
  exit() {
    this.game.input.textHandler = null;
    if (this.net && !this.handedOff) this.net.close();
  }
  makeNet() {
    this.net?.close();
    this.ready = [false, false];
    this.net = new NetSession({ peerHost: this.peerHost, name: Save.data.name });
    this.net.onStatus = (s, err) => {
      if (s === 'error') { this.state = 'error'; this.msg = err; Sound.sfx('ui_error'); }
      if (s === 'connected') { Sound.sfx('ui_lock_in'); }
      if (s === 'hello') { this.state = 'lobby'; this.sel = 0; Sound.sfx('ui_challenge'); }
    };
    this.net.onDisconnect = (msg) => { if (this.state === 'lobby' || this.state === 'waiting') { this.state = 'error'; this.msg = msg; } };
    this.net.onMessage = (m) => {
      if (m.t === 'ready') { this.ready[1 - this.net.localIndex] = m.v; Sound.sfx('ui_vote'); }
      if (m.t === 'go') this.go();
      if (m.t === 'bye') { this.state = 'error'; this.msg = 'Your friend left the lobby.'; }
    };
    return this.net;
  }
  async host() {
    this.state = 'opening'; this.msg = 'Opening a room...';
    const ok = await this.makeNet().hostRoom();
    if (ok) { this.state = 'waiting'; Sound.sfx('ui_select'); }
  }
  startJoin() {
    this.state = 'typing'; this.code = '';
    this.game.input.textHandler = (k) => {
      if (k === 'Escape') { this.game.input.textHandler = null; this.state = 'menu'; Sound.sfx('ui_back'); return; }
      if (k === 'Backspace') { this.code = this.code.slice(0, -1); Sound.sfx('ui_type', { vol: 0.5 }); return; }
      if (k === 'Enter') { if (this.code.length === 5) this.join(); return; }
      const ch = k.toUpperCase();
      if (/^[A-Z0-9]$/.test(ch) && this.code.length < 5) { this.code += ch; Sound.sfx('ui_type'); }
    };
  }
  async join() {
    this.game.input.textHandler = null;
    this.state = 'opening'; this.msg = 'Knocking on the door...';
    const ok = await this.makeNet().joinRoom(this.code);
    if (ok && this.state !== 'lobby') { this.state = 'lobby-wait'; this.msg = 'Connected! Saying hello...'; }
  }
  editName() {
    this.editingName = true;
    this.game.input.textHandler = (k) => {
      if (k === 'Enter' || k === 'Escape') { this.editingName = false; this.game.input.textHandler = null; Save.markDirty(); Sound.sfx('ui_select'); return; }
      if (k === 'Backspace') { Save.data.name = Save.data.name.slice(0, -1); return; }
      if (k.length === 1 && Save.data.name.length < 12 && /[\w\- ]/.test(k)) Save.data.name += k;
    };
  }
  toggleReady() {
    const i = this.net.localIndex;
    this.ready[i] = !this.ready[i];
    this.net.send({ t: 'ready', v: this.ready[i] });
    Sound.sfx('ui_vote');
    if (this.net.isHost && this.ready[0] && this.ready[1]) { this.net.send({ t: 'go' }); this.go(); }
  }
  go() {
    if (this.handedOff) return;
    this.handedOff = true;
    goCharSelect(this.game, 'online', { net: this.net });
  }
  render(d) { this.L.render(d, { dim: 0.15 }); }
  update(dt, active) {
    this.t += dt;
    this.L.update(dt);
    if (this.state === 'lobby' && this.net?.isHost && this.ready?.[0] && this.ready?.[1]) { this.net.send({ t: 'go' }); this.go(); }
    if (!active || this.editingName || this.state === 'typing') return;
    const inp = this.game.input;
    const items = this.menuItems();
    if (items.length) {
      if (inp.menu('up')) { this.sel = (this.sel + items.length - 1) % items.length; Sound.sfx('ui_move'); }
      if (inp.menu('down')) { this.sel = (this.sel + 1) % items.length; Sound.sfx('ui_move'); }
      if (inp.menu('confirm')) { Sound.sfx('ui_select'); items[this.sel]?.fn(); }
    }
    if (inp.menu('back')) this.back();
  }
  back() {
    Sound.sfx('ui_back');
    if (this.state === 'menu') { goMainMenu(this.game); return; }
    this.net?.send({ t: 'bye' });
    this.net?.close(); this.net = null;
    this.state = 'menu'; this.sel = 0;
  }
  menuItems() {
    switch (this.state) {
      case 'menu': return [
        { label: 'HOST A LOBBY', fn: () => this.host() },
        { label: 'JOIN WITH CODE', fn: () => this.startJoin() },
        { label: `NAME: ${Save.data.name}`, fn: () => this.editName() },
        { label: 'BACK', fn: () => goMainMenu(this.game) },
      ];
      case 'lobby': return [
        { label: this.ready?.[this.net.localIndex] ? 'NOT READY' : 'READY!', fn: () => this.toggleReady() },
        { label: 'LEAVE', fn: () => this.back() },
      ];
      case 'waiting': return [{ label: 'COPY CODE', fn: () => { navigator.clipboard?.writeText(this.net.code).then(() => this.game.toast('Code copied!', P.teal5)).catch(() => {}); } }, { label: 'CANCEL', fn: () => this.back() }];
      case 'error': return [{ label: 'OK', fn: () => { this.state = 'menu'; this.sel = 0; } }];
      default: return [];
    }
  }
  drawUI(ui) {
    const t = this.t;
    const w = 220, h = 196;
    const x = 18, y = 24;
    ui.hangingSign(x, y, w, h, { seed: 61, sway: 1 });
    ui.text('ONLINE', x + w / 2, y + 6, { font: 'big', align: 'center', color: P.gold3, shadow: P.ink });
    ui.icon('wifi', x + 14, y + 10);
    const items = this.menuItems();
    let iy = y + 120;
    const body = (txt, yy, col = P.cream3) => ui.para(txt, x + 14, yy, w - 28, { font: 'body', color: col });
    switch (this.state) {
      case 'menu':
        body('Fight a friend over the internet. One player hosts and gets a 5-letter code, the other joins with it.', y + 34);
        iy = y + 84;
        break;
      case 'opening': case 'lobby-wait':
        body(this.msg, y + 40);
        ui.text('.'.repeat(1 + Math.floor(t * 3) % 3), x + w / 2, y + 70, { font: 'big', align: 'center' });
        break;
      case 'waiting': {
        body('Share this code with your friend:', y + 34);
        const code = this.net.code;
        ui.panel(x + 30, y + 52, w - 60, 40, { seed: 5, tone: 'light', plankSize: 20, barnacles: 1 });
        ui.text(code, x + w / 2, y + 58, { font: 'huge', align: 'center', color: P.ink, outline: P.cream4 });
        body('Waiting for a challenger' + '.'.repeat(1 + Math.floor(t * 2) % 3), y + 100, P.teal5);
        iy = y + 128;
        break;
      }
      case 'typing': {
        body('Type the 5-letter code your friend gave you, then press ENTER.', y + 34);
        for (let i = 0; i < 5; i++) {
          const bx = x + 28 + i * 34, by = y + 70;
          ui.panel(bx, by, 28, 34, { seed: 9 + i, tone: i === this.code.length ? 'light' : 'mid', plankSize: 34, barnacles: 0, algae: 0 });
          ui.text(this.code[i] || (i === this.code.length && Math.floor(t * 3) % 2 ? '_' : ''), bx + 14, by + 7, { font: 'big', align: 'center', color: P.cream4 });
        }
        hintBar(ui, [[['ENT'], 'JOIN'], [['ESC'], 'CANCEL']], { x: x + 30, y: y + 124 });
        break;
      }
      case 'lobby': {
        const me = this.net.localIndex;
        ui.text('LOBBY ' + this.net.code, x + w / 2, y + 30, { font: 'labelB', align: 'center', color: P.cream2 });
        for (let i = 0; i < 2; i++) {
          const name = i === me ? Save.data.name : this.net.remoteName || '???';
          const by = y + 44 + i * 26;
          ui.panel(x + 14, by, w - 28, 22, { seed: 30 + i, tone: i === 0 ? 'red' : 'blue', plankSize: 22, barnacles: 0 });
          ui.text(`${i === 0 ? 'HOST' : 'GUEST'}: ${name}`, x + 22, by + 7, { font: 'labelB', color: P.cream4 });
          ui.text(this.ready?.[i] ? 'READY' : '...', x + w - 22, by + 7, { font: 'labelB', align: 'right', color: this.ready?.[i] ? P.green3 : P.cream1 });
        }
        ui.text(`PING ${Math.round(this.net.rtt)} ms`, x + w / 2, y + 100, { font: 'label', align: 'center', color: this.net.rtt < 90 ? P.green3 : this.net.rtt < 160 ? P.gold3 : P.red4 });
        iy = y + 116;
        break;
      }
      case 'error':
        body(this.msg || 'Something went wrong.', y + 40, P.red5);
        iy = y + 110;
        break;
    }
    items.forEach((it, i) => {
      const r = ui.plank(x + 30, iy + i * 20, w - 60, 16, it.label, { selected: i === this.sel, seed: 120 + i });
      if (r.hover && ui.mouse.moved) this.sel = i;
      if (r.clicked) { Sound.sfx('ui_select'); it.fn(); }
    });
    if (this.editingName) ui.text('TYPE YOUR NAME, ENTER TO SAVE', x + w / 2, y + h + 6, { font: 'label', align: 'center', color: P.gold4 });
    const srv = this.peerHost ? `server: ${this.peerHost}` : 'server: PeerJS cloud (0.peerjs.com)';
    ui.text(srv, ui.w - 8, ui.h - 10, { font: 'label', align: 'right', color: P.cream1 });
  }
}

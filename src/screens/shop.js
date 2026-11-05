// Madam Molt's hidden shop: she waddles in, opens her secret locker, and sells 5 random items
// a day. Also the wardrobe where you equip everything you own (with a live preview pedestal).
import { ensureLobby, lobbyFighters, goMainMenu, rebuildFighter } from './flow.js';
import { MenuFighter2D } from '../px/menuFighter.js';
import { portrait } from '../px/portrait.js';
import { P, RARITY } from '../ui/palette.js';
import { paperTag } from '../ui/sprites.js';
import { snailCounter, dialogueBox, hintBar } from '../ui/widgets.js';
import { Sound } from '../core/sound.js';
import { Save, CHARS } from '../core/save.js';
import { dailyShop } from '../core/progress.js';
import { SLOTS, SLOT_NAMES, slotList, itemId, itemDef, GLOVES, HITFX, TRAILS } from '../data/cosmetics.js';
import { CHARS as CDATA } from '../sim/data.js';
import { line } from '../data/dialogue.js';
import { formatTime, secondsUntilMidnight, clamp, ease } from '../core/math.js';

const SLOT_ICON = { skin: 'shirt', gloves: 'glove', hitfx: 'spark', trail: 'trail', victory: 'pose' };

export class ShopScreen {
  enter() {
    const g = this.game;
    this.L = ensureLobby();
    this.F = lobbyFighters();
    const sp = this.L.bar.spots || {};
    this.molt = sp.molt || { x: 30, y: 0 };
    this.secret = sp.secret || { x: this.molt.x - 5, y: 1.5 };
    this.L.setCam(sp.secret ? { x: this.secret.x, y: (this.secret.y || 0) + 1.6, zoom: 2.4 } : 'shop', 1.6, { drift: 0.04 });
    this.phase = 'arrive'; this.pt = 0; this.t = 0;
    this.say('hello');
    this.items = dailyShop();
    this.sel = 0; this.tab = 0; // 0 deals, 1 wardrobe
    this.wChar = Save.data.mainFighter; this.wSlot = 0; this.wSel = 0;
    this.fx = this.L.fx;
    this.preview = null; this.previewKey = '';
    this.fxT = 0;
    this.bump = 0;
    Sound.music('shop', { fade: 1.2 });
  }
  exit() {
    if (this.preview) this.L.extra = this.L.extra.filter((e) => e !== this.preview);
    this.L.bar.setSecretDoor?.(0);
    this.game.input.mode = 'solo';
  }
  render(d) { this.d = d; this.L.render(d); }
  say(kind, txt) {
    this.dlg = { text: txt || line('molt', kind) || '...', t: 0 };
    this.L.bar.moltTalk?.(true);
    Sound.voice('molt', this.dlg.text);
  }
  pedestal() { const p = this.L.bar.spots?.pedestal; return p || { x: this.molt.x - 2.4, y: this.molt.y || 0 }; }

  // ---------------------------------------------------------------- preview pedestal
  previewSpec() {
    if (this.tab === 0) {
      const it = this.items[this.sel];
      if (!it) return null;
      const char = it.slot === 'skin' ? it.char : Save.data.mainFighter;
      const cos = { ...Save.equipped(char) };
      cos[it.slot] = it.key;
      return { char, cos, slot: it.slot, key: it.key };
    }
    const slot = SLOTS[this.wSlot];
    const list = this.wardrobeList();
    const it = list[this.wSel];
    const cos = { ...Save.equipped(this.wChar) };
    if (it) cos[slot] = it.key;
    return { char: this.wChar, cos, slot, key: it?.key };
  }
  syncPreview() {
    const sp = this.previewSpec();
    if (!sp) return;
    const key = sp.char + JSON.stringify({ skin: sp.cos.skin, gloves: sp.cos.gloves });
    if (key !== this.previewKey) {
      if (this.preview) this.L.extra = this.L.extra.filter((e) => e !== this.preview);
      this.preview = new MenuFighter2D(sp.char, sp.cos);
      const p = this.pedestal();
      this.preview.setSpot({ x: p.x, y: p.y || 0, face: 1 });
      this.preview.setActivity('guard');
      this.preview.doReact('locked');
      this.L.extra.push(this.preview);
      this.previewKey = key;
    }
    this.previewSlot = sp;
  }
  wardrobeList() {
    const slot = SLOTS[this.wSlot];
    return slotList(slot, this.wChar).filter((it) => Save.owns(itemId(slot, this.wChar, it.key)));
  }

  buy() {
    const it = this.items[this.sel];
    if (!it) return;
    if (Save.owns(it.id)) { this.say('owned'); Sound.sfx('ui_error'); return; }
    if (!Save.spend(it.price)) { this.say('poor'); Sound.sfx('ui_error'); this.L.bar.moltMood?.('angry'); return; }
    Save.grant(it.id);
    // auto-equip
    if (it.slot === 'skin') Save.equip(it.char, 'skin', it.key);
    else Save.equip(Save.data.mainFighter, it.slot, it.key);
    Save.save();
    Sound.sfx('ui_purchase'); Sound.stinger('stinger_purchase');
    this.L.bar.moltMood?.('greedy');
    this.say(it.rarity === 'legendary' ? 'legendary' : 'buy');
    this.bump = 1;
    this.fx.icons(this.molt.x, (this.molt.y || 0) + 1.4, 16, 'snail', ['#f0c33c'], { sp1: 4 });
    const pd = this.pedestal();
    this.fx.icons(pd.x, (pd.y || 0) + 1.2, 18, 'star', ['#fff08a', '#ffffff', '#ff8ac8'], { sp1: 4 });
    this.preview?.doReact('pick');
  }
  equipWardrobe() {
    const list = this.wardrobeList();
    const it = list[this.wSel];
    if (!it) return;
    const slot = SLOTS[this.wSlot];
    Save.equip(this.wChar, slot, it.key); Save.save();
    Sound.sfx('ui_equip');
    this.say('equip');
    this.preview?.doReact('pick');
    if (slot === 'skin' || slot === 'gloves') rebuildFighter(this.game, this.wChar, Save.equipped(this.wChar));
  }

  update(dt, active) {
    this.t += dt; this.pt += dt; this.bump = Math.max(0, this.bump - dt * 2);
    this.L.update(dt);
    if (this.dlg) { this.dlg.t += dt; if (this.dlg.t * 40 > this.dlg.text.length + 10) this.L.bar.moltTalk?.(false); }
    const inp = this.game.input;
    switch (this.phase) {
      case 'arrive': {
        // the secret door behind the shelf slides open
        const k = clamp((this.pt - 0.5) / 1.2, 0, 1);
        this.L.bar.setSecretDoor?.(ease.inOutSine(k));
        if (this.pt > 0.5 && !this.openSnd) { this.openSnd = true; Sound.sfx('ui_locker_open'); Sound.sfx('ui_door_creak', { vol: 0.5, pitch: 1.3 }); }
        if (k >= 1 && (this.pt > 2.0 || (active && inp.menu('confirm')))) { this.phase = 'open'; this.pt = 0; this.L.setCam('shop', 1.4, { drift: 0.02 }); }
        break;
      }
      case 'open':
        if (this.pt > 0.3 && !this.sparkled) { this.sparkled = true; this.fx.icons(this.molt.x, (this.molt.y || 0) + 1.6, 18, 'star', ['#fff08a', '#ff8ac8'], { sp1: 3 }); this.L.bar.moltMood?.('wave'); }
        if (this.pt > 1.4) { this.phase = 'shop'; this.pt = 0; this.say('browse'); }
        break;
      case 'shop':
        this.syncPreview();
        this.previewFx(dt);
        if (active) this.shopInput(inp);
        if (Math.random() < dt * 0.05) { this.say('idle'); this.L.bar.moltMood?.('count'); }
        break;
      case 'leave':
        if (this.pt > 0.3 && !this.backCam) { this.backCam = true; this.L.setCam(this.L.bar.spots?.secret ? { x: this.secret.x, y: (this.secret.y || 0) + 1.6, zoom: 2.2 } : 'overview', 1.0); }
        if (this.pt > 1.0) this.L.bar.setSecretDoor?.(clamp(1 - (this.pt - 1.0) * 2, 0, 1));
        if (this.pt > 1.3 && !this.leftSound) { this.leftSound = true; Sound.sfx('ui_locker_close'); }
        if (this.pt > 1.8 && !this.gone) { this.gone = true; goMainMenu(this.game); }
        break;
    }
  }

  previewFx(dt) {
    const sp = this.previewSlot;
    if (!sp || !this.preview) return;
    this.fxT += dt;
    const P0 = this.pedestal();
    if (sp.slot === 'hitfx' && this.fxT > 0.9) {
      this.fxT = 0;
      this.preview.doReact('pick');
      this.fx.hitEffect(P0.x + 0.8, (P0.y || 0) + 1.1, 1.3, 1, sp.key);
      Sound.sfx('hit_medium', { vol: 0.5 });
    }
    if (sp.slot === 'trail') {
      const tr = TRAILS.find((x) => x.key === sp.key);
      if (tr && tr.colors && Math.random() < dt * 20) {
        const name = { bubbleS: 'bubble', note: 'note', sparkle: 'star', dot: 'px', pixelS: 'px', petal: 'petal' }[tr.spr] || 'px';
        const x = P0.x + (Math.random() - 0.5) * 0.6, y = (P0.y || 0) + 0.4 + Math.random() * 1.2;
        if (name === 'bubble') this.fx.bubbleBurst(x, y, 1, 0.6); else if (name === 'px') this.fx.pixels(x, y, 2, { colors: tr.colors, sp1: 0.6, up: 0.8, grav: 1 }); else this.fx.icons(x, y, 1, name, tr.colors, { sp1: 0.6, up: 0.6, grav: 0.5 });
      }
    }
  }

  shopInput(inp) {
    if (inp.menu('tabL') || inp.menu('tabR')) { this.tab = 1 - this.tab; Sound.sfx('ui_tab'); this.say(this.tab ? 'equip' : 'browse'); }
    if (inp.menu('back')) { this.phase = 'leave'; this.pt = 0; this.say('leave'); Sound.sfx('ui_back'); return; }
    if (this.tab === 0) {
      const n = this.items.length;
      if (inp.menu('left') || inp.menu('up')) { this.sel = (this.sel + n - 1) % n; Sound.sfx('ui_paper'); }
      if (inp.menu('right') || inp.menu('down')) { this.sel = (this.sel + 1) % n; Sound.sfx('ui_paper'); }
      if (inp.menu('confirm')) this.buy();
    } else {
      if (inp.keyPressed('KeyZ') || inp.keyPressed('BracketLeft') || inp.keyPressed('Digit1')) { this.wChar = CHARS[(CHARS.indexOf(this.wChar) + 3) % 4]; this.wSel = 0; Sound.sfx('ui_tab'); }
      if (inp.keyPressed('KeyC') || inp.keyPressed('BracketRight') || inp.keyPressed('Digit2')) { this.wChar = CHARS[(CHARS.indexOf(this.wChar) + 1) % 4]; this.wSel = 0; Sound.sfx('ui_tab'); }
      if (inp.menu('left')) { this.wSlot = (this.wSlot + SLOTS.length - 1) % SLOTS.length; this.wSel = 0; Sound.sfx('ui_tab'); }
      if (inp.menu('right')) { this.wSlot = (this.wSlot + 1) % SLOTS.length; this.wSel = 0; Sound.sfx('ui_tab'); }
      const n = Math.max(1, this.wardrobeList().length);
      if (inp.menu('up')) { this.wSel = (this.wSel + n - 1) % n; Sound.sfx('ui_move'); }
      if (inp.menu('down')) { this.wSel = (this.wSel + 1) % n; Sound.sfx('ui_move'); }
      if (inp.menu('confirm')) this.equipWardrobe();
    }
  }

  // ---------------------------------------------------------------- UI
  itemIcon(ui, it, x, y, size) {
    if (it.slot === 'skin') {
      const img = portrait(it.char, { skin: it.key }, { size });
      ui.img(img, x, y);
      return;
    }
    ui.rect(x, y, size, size, P.deep1);
    const cx = x + size / 2, cy = y + size / 2;
    if (it.slot === 'gloves') {
      const g = GLOVES.find((q) => q.key === it.key);
      const col = '#' + (g?.main ?? 0xd8322a).toString(16).padStart(6, '0');
      ui.rect(cx - 9, cy - 8, 18, 14, P.ink); ui.rect(cx - 8, cy - 7, 16, 12, col); ui.rect(cx - 8, cy - 7, 16, 2, '#ffffff'); ui.rect(cx - 6, cy + 5, 12, 5, '#' + (g?.cuff ?? 0xffffff).toString(16).padStart(6, '0'));
      return;
    }
    if (it.slot === 'hitfx') {
      const h = HITFX.find((q) => q.key === it.key);
      const t = this.t;
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 2; const r = 6 + (t * 20 + i * 4) % 10; const c = h?.colors?.[i % h.colors.length] ?? 0xffffff; ui.rect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 3, 3, '#' + c.toString(16).padStart(6, '0')); }
      ui.icon('spark', cx - 5, cy - 5);
      return;
    }
    ui.icon(SLOT_ICON[it.slot], cx - 6, cy - 6, {});
  }

  drawUI(ui) {
    const t = this.t;
    snailCounter(ui, ui.w - 8, 8, { bump: this.bump });
    if (this.phase !== 'shop') {
      if (this.dlg) dialogueBox(ui, 20, ui.h - 64, ui.w - 40, 52, 'MADAM MOLT', this.dlg.text, Math.floor(this.dlg.t * 40), { nameTone: 'pink' });
      return;
    }
    // sign
    ui.hangingSign(10, 4, 168, 22, { seed: 181, sway: 0.6, tone: 'pink' });
    ui.text(this.tab === 0 ? "TODAY'S DEALS" : 'WARDROBE', 94, 8, { font: 'labelB', align: 'center', color: P.cream4 });
    ui.text(`NEW STOCK IN ${formatTime(secondsUntilMidnight())}`, 186, 10, { font: 'label', color: P.pink4 });
    if (this.tab === 0) this.drawDeals(ui); else this.drawWardrobe(ui);
    if (this.dlg && this.dlg.t < 5) {
      const pp = this.d ? this.d.toUI(this.molt.x, (this.molt.y || 0) + 2.1, ui) : { x: ui.w * 0.7, y: ui.h * 0.3 };
      const px = Math.round(pp.x), py = Math.round(pp.y);
      const txt = this.dlg.text.slice(0, Math.floor(this.dlg.t * 40));
      const lines = ui.wrap(txt, 140, 'body');
      const w = Math.max(20, ...lines.map((l) => ui.measure(l, 'body'))) + 12, h = lines.length * 9 + 16;
      const bx = clamp(px - w / 2, 196, ui.w - w - 4), by = clamp(py - h - 4, 34, ui.h);
      ui.rect(bx - 1, by - 1, w + 2, h + 2, P.ink); ui.rect(bx, by, w, h, P.cream3);
      ui.rect(clamp(px - 2, bx + 4, bx + w - 8), by + h, 4, 4, P.cream3);
      ui.text('MADAM MOLT', bx + 5, by + 3, { font: 'label', color: P.pink2, outline: null });
      lines.forEach((l, i) => ui.text(l, bx + 6, by + 12 + i * 9, { font: 'body', color: P.ink, outline: null }));
    }
    hintBar(ui, [[['Q', 'E'], this.tab === 0 ? 'WARDROBE' : 'SHOP'], [['OK'], this.tab === 0 ? 'BUY' : 'EQUIP'], [['ESC'], 'LEAVE']], { x: ui.w - 230, y: ui.h - 12 });
  }

  drawDeals(ui) {
    const t = this.t;
    const n = this.items.length;
    const cw = 58, ch = 84, gap = 5;
    const x0 = 8, y0 = ui.h - ch - 22;
    this.items.forEach((it, i) => {
      const sel = i === this.sel;
      const x = x0 + i * (cw + gap), y = y0 + (sel ? -4 : 0);
      const R = RARITY[it.rarity];
      const owned = Save.owns(it.id);
      ui.rect(x + cw / 2, y - 6, 1, 8, P.cream1);
      ui.img(paperTag(cw, ch, { seed: i + 3 }), x, y);
      ui.rect(x + 3, y + 3, cw - 6, 2, R.color);
      ui.text(SLOT_NAMES[it.slot], x + cw / 2, y + 8, { font: 'label', align: 'center', color: P.ink, outline: null });
      this.itemIcon(ui, it, x + cw / 2 - 18, y + 18, 36);
      ui.para(it.name, x + 3, y + 56, cw - 6, { font: 'body', color: P.ink, outline: null, align: 'center' });
      ui.icon('snail', x + 4, y + ch - 14);
      ui.text(owned ? 'OWNED' : String(it.price), x + cw - 5, y + ch - 11, { font: 'labelB', align: 'right', color: owned ? P.green3 : Save.data.snails >= it.price ? P.ink : P.red3, outline: null });
      if (owned) ui.text('SOLD', x + cw / 2, y + 26, { font: 'big', align: 'center', color: P.red3, alpha: 0.85 });
      if (sel) ui.frame(x - 2, y - 2, cw + 4, ch + 4, Math.floor(t * 6) % 2 ? P.gold3 : P.gold4);
      if (ui.hover(x, y, cw, ch) && ui.mouse.moved && this.sel !== i) { this.sel = i; Sound.sfx('ui_paper'); }
      if (ui.clicked(x, y, cw, ch)) { if (this.sel === i) this.buy(); else this.sel = i; }
    });
    // detail panel (top left)
    const it = this.items[this.sel];
    if (!it) return;
    const dx = 8, dy = 32, dw = 176, dh = 96;
    ui.panel(dx, dy, dw, dh, { seed: 222, tone: 'dark', plankSize: 20, barnacles: 2 });
    const R = RARITY[it.rarity];
    ui.text(R.name, dx + 8, dy + 6, { font: 'label', color: R.color });
    if (it.slot === 'skin') ui.text('FOR ' + CDATA[it.char].name, dx + dw - 8, dy + 6, { font: 'label', align: 'right', color: P.gold3 });
    ui.para(it.name, dx + 8, dy + 16, dw - 16, { font: 'labelB', color: P.cream4 });
    ui.para(it.desc, dx + 8, dy + 34, dw - 16, { font: 'body', color: P.cream2 });
    const owned = Save.owns(it.id);
    const r = ui.plank(dx + 8, dy + dh - 18, dw - 16, 14, owned ? 'OWNED' : `BUY FOR ${it.price}`, { seed: 230, selected: !owned, noPointer: true, font: 'label', disabled: owned });
    if (r.clicked) this.buy();
  }

  drawWardrobe(ui) {
    const x = 8, y = 32, w = 184, h = Math.min(170, ui.h - 56);
    ui.panel(x, y, w, h, { seed: 241, tone: 'dark', plankSize: 18, barnacles: 2 });
    ui.text('< ' + CDATA[this.wChar].name + ' >', x + w / 2, y + 5, { font: 'labelB', align: 'center', color: P.gold4 });
    ui.text('Z / C: CHARACTER', x + w / 2, y + 15, { font: 'label', align: 'center', color: P.cream1 });
    const sw = Math.floor((w - 12) / SLOTS.length);
    SLOTS.forEach((s, i) => {
      const sel = i === this.wSlot;
      ui.rect(x + 6 + i * sw, y + 26, sw - 2, 13, sel ? P.gold2 : P.wood2);
      ui.text(SLOT_NAMES[s].split(' ')[0], x + 6 + i * sw + (sw - 2) / 2, y + 29, { font: 'label', align: 'center', color: sel ? P.ink : P.cream2, outline: sel ? null : undefined });
      if (ui.clicked(x + 6 + i * sw, y + 26, sw - 2, 13)) { this.wSlot = i; this.wSel = 0; Sound.sfx('ui_tab'); }
    });
    const list = this.wardrobeList();
    const slot = SLOTS[this.wSlot];
    const eq = Save.equipped(this.wChar)[slot];
    list.slice(0, 10).forEach((it, i) => {
      const ry = y + 44 + i * 11;
      const sel = i === this.wSel;
      if (sel) ui.rect(x + 6, ry - 2, w - 12, 11, P.ink, 0.4);
      const R = RARITY[it.rarity] || RARITY.common;
      ui.text(it.name, x + 12, ry, { font: 'body', color: sel ? P.gold4 : R.color });
      if (it.key === eq) ui.text('EQUIPPED', x + w - 10, ry, { font: 'label', align: 'right', color: P.green3 });
      if (ui.hover(x + 6, ry - 2, w - 12, 11) && ui.mouse.moved) this.wSel = i;
      if (ui.clicked(x + 6, ry - 2, w - 12, 11)) { this.wSel = i; this.equipWardrobe(); }
    });
    const total = slotList(slot, this.wChar).length;
    ui.text(`${list.length}/${total} OWNED`, x + w / 2, y + h - 10, { font: 'label', align: 'center', color: P.cream1 });
  }
}

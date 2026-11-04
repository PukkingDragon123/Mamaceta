// Madam Molt's hidden shop: she waddles in, opens her secret locker, and sells 5 random items
// a day. Also the wardrobe where you equip everything you own (with a live preview pedestal).
import * as THREE from 'three';
import { ensureLocker, lockerFighters, goMainMenu, rebuildFighter } from './flow.js';
import { MenuFighter } from '../render/menuFighter.js';
import { FX } from '../render/fx.js';
import { portrait } from '../render/portraits.js';
import { victoryPose } from '../render/anim.js';
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
    this.L = ensureLocker(g);
    this.scene = this.L.scene; this.camera = this.L.camera;
    this.F = lockerFighters(g);
    for (const c of CHARS) this.F[c].setVisible(false);
    const M = this.L.molt;
    M.group.visible = true;
    M.group.position.set(this.L.moltX + 4.5, 0, -4.7);
    M.group.rotation.y = Math.PI;
    this.L.setCam([this.L.moltX - 1.6, 1.75, -1.0], [this.L.moltX + 0.6, 1.3, -5.6], 42, 2.2);
    this.phase = 'arrive'; this.pt = 0; this.t = 0;
    this.say('hello');
    this.items = dailyShop();
    this.sel = 0; this.tab = 0; // 0 deals, 1 wardrobe
    this.wChar = Save.data.mainFighter; this.wSlot = 0; this.wSel = 0;
    this.fx = new FX(this.L.scene, g.renderer, this.L.particles, this.L.camera);
    this.preview = null; this.previewKey = '';
    this.fxT = 0;
    this.bump = 0;
    Sound.music('shop', { fade: 1.2 });
  }
  exit() {
    this.preview?.dispose();
    this.L.molt.group.visible = false;
    this.L.moltOpenTarget = 0;
    this.game.input.mode = 'solo';
  }
  say(kind, txt) {
    this.dlg = { text: txt || line('molt', kind) || '...', t: 0 };
    this.L.molt.setTalking(true);
    Sound.voice('molt', this.dlg.text);
  }

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
      this.preview?.dispose();
      this.preview = new MenuFighter(this.L.scene, sp.char, sp.cos, this.L.particles);
      const p = this.L.pedestalTop;
      this.preview.setSlot({ x: p.x, z: p.z, face: -1 });
      this.preview.rig.root.position.y = p.y;
      this.preview.doReact('locked');
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
    if (!Save.spend(it.price)) { this.say('poor'); Sound.sfx('ui_error'); this.L.molt.mood('angry', 1.2); return; }
    Save.grant(it.id);
    // auto-equip
    if (it.slot === 'skin') Save.equip(it.char, 'skin', it.key);
    else Save.equip(Save.data.mainFighter, it.slot, it.key);
    Save.save();
    Sound.sfx('ui_purchase'); Sound.stinger('stinger_purchase');
    this.L.molt.mood('greedy', 2);
    this.say(it.rarity === 'legendary' ? 'legendary' : 'buy');
    this.bump = 1;
    const reg = this.L.register.position;
    this.fx.burst(reg.x, reg.y + 0.6, { n: 24, spr: 'snail', colors: [0xffffff], sp0: 1, sp1: 3, grav: -6, life1: 1.2, s0: 0.12, s1: 0.18 });
    this.fx.burst(this.L.pedestalTop.x, 1.6, { n: 30, spr: 'sparkle', colors: [0xfff08a, 0xffffff, 0xff8ac8], glow: true, anim: 'life', sp1: 4 });
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
    this.fx.update(dt);
    const M = this.L.molt;
    if (this.dlg) { this.dlg.t += dt; if (this.dlg.t * 40 > this.dlg.text.length + 10) M.setTalking(false); }
    const inp = this.game.input;
    switch (this.phase) {
      case 'arrive': {
        const k = clamp(this.pt / 2.2, 0, 1);
        M.group.position.x = this.L.moltX + 4.5 - ease.outQuad(k) * 3.4;
        M.group.position.y = Math.abs(Math.sin(this.pt * 9)) * 0.05 * (1 - k);
        M.group.rotation.y = Math.PI * 0.7;
        if (this.pt > 0.3 && Math.floor(this.pt * 4.5) !== Math.floor((this.pt - dt) * 4.5) && k < 1) Sound.sfx('step', { vol: 0.4, pitch: 0.7 });
        if (k >= 1 && (this.pt > 3.2 || (active && inp.menu('confirm')))) { this.phase = 'open'; this.pt = 0; M.mood('open', 2); M.group.rotation.y = Math.PI * 1.05; }
        break;
      }
      case 'open':
        if (this.pt > 0.4 && this.L.moltOpenTarget === 0) {
          this.L.moltOpenTarget = 1; Sound.sfx('ui_locker_open'); Sound.sfx('ui_door_creak', { vol: 0.5, pitch: 1.3 });
          this.fx.burst(this.L.moltX, 1.6, { n: 30, spr: 'sparkle', colors: [0xfff08a, 0xff8ac8], glow: true, anim: 'life', sp1: 3, life1: 1.2 });
        }
        if (this.pt > 1.0) this.L.setCam([this.L.moltX, 1.75, -5.2], [this.L.moltX, 1.6, -9], 46, 1.6);
        if (this.pt > 2.0) {
          this.phase = 'shop'; this.pt = 0;
          M.group.position.set(this.L.moltX - 0.7, 0, -12.1); M.group.rotation.y = -Math.PI / 2; M.mood('wave', 1.5);
          this.L.setCam([this.L.moltX + 0.6, 1.75, -7.4], [this.L.moltX + 0.1, 1.15, -11.6], 48, 1.4);
          this.say('browse');
        }
        break;
      case 'shop':
        this.syncPreview();
        this.preview?.update(dt, { look: this.L.camera.position, fixedActivity: true });
        if (this.preview) this.preview.rig.root.rotation.y = Math.sin(this.t * 0.6) * 0.6;
        this.previewFx(dt);
        if (active) this.shopInput(inp);
        if (Math.random() < dt * 0.05) { this.say('idle'); M.mood('count', 2); }
        break;
      case 'leave':
        if (this.pt > 0.5) this.L.setCam([this.L.moltX - 1.6, 1.75, -1.0], [this.L.moltX + 0.6, 1.3, -5.6], 42, 1.8);
        if (this.pt > 1.0) this.L.moltOpenTarget = 0;
        if (this.pt > 1.3 && !this.leftSound) { this.leftSound = true; Sound.sfx('ui_locker_close'); }
        if (this.pt > 1.8 && !this.gone) { this.gone = true; goMainMenu(this.game); }
        break;
    }
    M.update(dt);
  }

  previewFx(dt) {
    const sp = this.previewSlot;
    if (!sp || !this.preview) return;
    this.fxT += dt;
    const P0 = this.L.pedestalTop;
    if (sp.slot === 'hitfx' && this.fxT > 0.9) {
      this.fxT = 0;
      this.preview.doReact('pick');
      this.fx.hitEffect(P0.x - 0.7, P0.y + 1.2, 1.3, -1, sp.key);
      Sound.sfx('hit_medium', { vol: 0.5 });
    }
    if (sp.slot === 'trail') {
      const tr = TRAILS.find((x) => x.key === sp.key);
      if (tr && tr.colors && Math.random() < dt * 30) this.L.particles.spawn({ x: P0.x + (Math.random() - 0.5) * 0.6, y: P0.y + 0.4 + Math.random() * 1.2, z: P0.z + 0.3, vx: (Math.random() - 0.5) * 0.4, vy: 0.4, grav: tr.spr === 'bubbleS' ? 0.6 : -0.2, life: 1, size: 0.08, size1: 0.02, spr: tr.spr, color: tr.colors[Math.floor(Math.random() * tr.colors.length)], glow: !!tr.glow, anim: tr.spr === 'sparkle' ? 'life' : null, wob: [0.3, 5] });
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
      const img = portrait(this.game.renderer, it.char, { skin: it.key }, { size });
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
    if (this.dlg) dialogueBox(ui, 10, ui.h - 50, Math.min(300, ui.w * 0.55), 36, 'MADAM MOLT', this.dlg.text, Math.floor(this.dlg.t * 40), { nameTone: 'pink', prompt: false });
    hintBar(ui, [[['Q', 'E'], this.tab === 0 ? 'WARDROBE' : 'SHOP'], [['OK'], this.tab === 0 ? 'BUY' : 'EQUIP'], [['ESC'], 'LEAVE']], { x: ui.w - 230, y: ui.h - 12 });
  }

  drawDeals(ui) {
    const n = this.items.length;
    const cw = 66, ch = 92;
    const x0 = 10, y0 = 32;
    this.items.forEach((it, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const sel = i === this.sel;
      const x = x0 + col * (cw + 6), y = y0 + row * (ch + 8) + (sel ? -3 : 0);
      const R = RARITY[it.rarity];
      const owned = Save.owns(it.id);
      // string
      ui.rect(x + cw / 2, y - 6, 1, 8, P.cream1);
      ui.img(paperTag(cw, ch, { seed: i + 3, color: it.rarity === 'legendary' ? 'cream' : 'cream' }), x, y);
      ui.rect(x + 3, y + 3, cw - 6, 2, R.color);
      ui.text(SLOT_NAMES[it.slot], x + cw / 2, y + 8, { font: 'label', align: 'center', color: P.ink, outline: null });
      this.itemIcon(ui, it, x + cw / 2 - 20, y + 18, 40);
      ui.para(it.name, x + 4, y + 60, cw - 8, { font: 'body', color: P.ink, outline: null, align: 'center' });
      ui.icon('snail', x + 6, y + ch - 15);
      ui.text(owned ? 'OWNED' : String(it.price), x + cw - 6, y + ch - 12, { font: 'labelB', align: 'right', color: owned ? P.green3 : Save.data.snails >= it.price ? P.ink : P.red3, outline: null });
      if (owned) ui.text('SOLD', x + cw / 2, y + 30, { font: 'big', align: 'center', color: P.red3, alpha: 0.85 });
      if (sel) { ui.frame(x - 2, y - 2, cw + 4, ch + 4, Math.floor(t * 6) % 2 ? P.gold3 : P.gold4); }
      if (ui.hover(x, y, cw, ch) && ui.mouse.moved && this.sel !== i) { this.sel = i; Sound.sfx('ui_paper'); }
      if (ui.clicked(x, y, cw, ch)) { if (this.sel === i) this.buy(); else this.sel = i; }
    });
    // detail panel
    const it = this.items[this.sel];
    if (!it) return;
    const dx = x0 + 3 * (cw + 6) + 6, dy = 32, dw = Math.min(170, ui.w - dx - 12), dh = 100;
    if (dw < 90) return;
    ui.panel(dx, dy, dw, dh, { seed: 222, tone: 'dark', plankSize: 20, barnacles: 2 });
    const R = RARITY[it.rarity];
    ui.text(R.name, dx + 8, dy + 6, { font: 'label', color: R.color });
    ui.para(it.name, dx + 8, dy + 16, dw - 16, { font: 'labelB', color: P.cream4 });
    ui.para(it.desc, dx + 8, dy + 34, dw - 16, { font: 'body', color: P.cream2 });
    if (it.slot === 'skin') ui.text('FOR ' + CDATA[it.char].name, dx + 8, dy + dh - 24, { font: 'label', color: P.gold3 });
    const owned = Save.owns(it.id);
    const r = ui.plank(dx + 8, dy + dh - 16, dw - 16, 13, owned ? 'OWNED' : `BUY  ${it.price}`, { seed: 230, selected: !owned, noPointer: true, font: 'label', disabled: owned });
    if (r.clicked) this.buy();
  }

  drawWardrobe(ui) {
    const x = 10, y = 32, w = 210, h = 156;
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

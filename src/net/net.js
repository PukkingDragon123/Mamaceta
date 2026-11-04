// Online play: PeerJS (WebRTC data channel) rooms joined by a short code, plus a deterministic
// delay-based lockstep for the fight with input redundancy, ping measurement, desync detection
// (state hash exchange) and automatic snapshot resync.
import { Peer } from 'peerjs';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'mantis-mayhem-v1-';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function peerOptions(host) {
  // host: '' for the free PeerJS cloud broker, or 'hostname:port/path' for a self-hosted `peerjs` server
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
  if (host) {
    const m = host.match(/^(https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
    if (m) {
      o.host = m[2]; o.port = m[3] ? +m[3] : (m[1] === 'http://' ? 80 : 443); o.path = m[4] || '/';
      o.secure = m[1] ? m[1] === 'https://' : !(o.host === 'localhost' || o.host.startsWith('127.') || o.host.startsWith('192.168.'));
    }
  }
  return o;
}

export class NetSession {
  constructor(o = {}) {
    this.host = o.peerHost || '';
    this.name = o.name || 'Player';
    this.peer = null; this.conn = null;
    this.isHost = false; this.localIndex = 0;
    this.code = '';
    this.state = 'idle'; // idle | opening | waiting | connecting | connected | closed | error
    this.error = '';
    this.remoteName = '';
    this.rtt = 0; this.rttSamples = [];
    this.onMessage = null; this.onStatus = null; this.onDisconnect = null;
    this._pingTimer = null;
    this.resetLockstep();
  }

  status(s, err) { this.state = s; if (err) this.error = err; this.onStatus?.(s, err); }

  hostRoom() {
    return new Promise((resolve) => {
      this.isHost = true; this.localIndex = 0;
      const tryOpen = (attempt) => {
        this.code = makeCode();
        this.status('opening');
        const peer = new Peer(PREFIX + this.code, peerOptions(this.host));
        this.peer = peer;
        peer.on('open', () => { this.status('waiting'); resolve(true); });
        peer.on('connection', (conn) => {
          if (this.conn) { conn.on('open', () => { conn.send(JSON.stringify({ t: 'full' })); setTimeout(() => conn.close(), 200); }); return; }
          this.attach(conn);
        });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
          this.status('error', this.describe(e)); resolve(false);
        });
        peer.on('disconnected', () => { if (this.state === 'waiting') try { peer.reconnect(); } catch (_) {} });
      };
      tryOpen(0);
    });
  }

  joinRoom(code) {
    return new Promise((resolve) => {
      this.isHost = false; this.localIndex = 1;
      this.code = code.toUpperCase().trim();
      this.status('opening');
      const peer = new Peer(undefined, peerOptions(this.host));
      this.peer = peer;
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; this.status('error', 'Could not reach that room. Check the code and try again.'); resolve(false); } }, 15000);
      peer.on('open', () => {
        this.status('connecting');
        const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'raw' });
        this.attach(conn, () => { if (!done) { done = true; clearTimeout(timer); resolve(true); } });
      });
      peer.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); this.status('error', this.describe(e)); resolve(false); } });
    });
  }

  describe(e) {
    const t = e?.type || '';
    if (t === 'peer-unavailable') return 'No lobby with that code. Is it typed right?';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Cannot reach the matchmaking server. Check your connection.';
    if (t === 'browser-incompatible') return 'Your browser does not support WebRTC.';
    return 'Connection error: ' + (e?.message || t || 'unknown');
  }

  attach(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => {
      this.status('connected');
      this.sendRaw({ t: 'hello', name: this.name, v: 1 });
      this.startPing();
      onOpen?.();
    });
    conn.on('data', (d) => {
      let m;
      try { m = typeof d === 'string' ? JSON.parse(d) : JSON.parse(new TextDecoder().decode(d)); } catch (_) { return; }
      this.handle(m);
    });
    conn.on('close', () => this.lost('Opponent disconnected.'));
    conn.on('error', () => this.lost('Connection lost.'));
  }

  lost(msg) {
    if (this.state === 'closed') return;
    this.status('closed', msg);
    this.stopPing();
    this.onDisconnect?.(msg);
  }

  handle(m) {
    switch (m.t) {
      case 'hello': this.remoteName = String(m.name || 'Rival').slice(0, 14); this.onStatus?.('hello'); return;
      case 'full': this.status('error', 'That lobby is already full.'); return;
      case 'ping': this.sendRaw({ t: 'pong', ts: m.ts }); return;
      case 'pong': {
        const r = performance.now() - m.ts;
        this.rttSamples.push(r); if (this.rttSamples.length > 8) this.rttSamples.shift();
        this.rtt = this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length;
        return;
      }
      case 'in': this.recvInputs(m); return;
      case 'hash': this.recvHash(m); return;
      case 'snapReq': if (this.isHost && this.sim) this.sendSnapshot(); return;
      case 'snap': this.recvSnapshot(m); return;
      default: this.onMessage?.(m);
    }
  }

  sendRaw(m) { try { if (this.conn && this.conn.open) this.conn.send(JSON.stringify(m)); } catch (_) {} }
  send(m) { this.sendRaw(m); }

  startPing() {
    this.stopPing();
    this._pingTimer = setInterval(() => this.sendRaw({ t: 'ping', ts: performance.now() }), 800);
    this.sendRaw({ t: 'ping', ts: performance.now() });
  }
  stopPing() { if (this._pingTimer) clearInterval(this._pingTimer); this._pingTimer = null; }

  close() {
    this.stopPing();
    try { this.conn?.close(); } catch (_) {}
    try { this.peer?.destroy(); } catch (_) {}
    this.conn = null; this.peer = null;
    if (this.state !== 'error') this.state = 'closed';
  }

  // ------------------------------------------------------------------ lockstep
  resetLockstep(sim = null) {
    this.frame = 0;
    this.sim = sim;
    this.delay = Math.max(3, Math.min(10, Math.ceil((this.rtt || 60) / 2 / 16.67) + 2));
    this.localIn = new Map(); this.remoteIn = new Map();
    this.sentUpTo = -1;
    this.hashes = new Map();
    this.stalled = 0; this.lastStepAt = performance.now();
    this.desync = false; this.awaitSnap = false;
    for (let f = 0; f < this.delay; f++) this.localIn.set(f, 0);
    this.sentUpTo = this.delay - 1;
  }
  bindSim(sim) { this.resetLockstep(sim); this.flushInputs(); }

  recvInputs(m) {
    // m.f = first frame, m.i = array of inputs
    for (let k = 0; k < m.i.length; k++) this.remoteIn.set(m.f + k, m.i[k]);
  }
  flushInputs() {
    // send the last few inputs redundantly
    const from = Math.max(0, this.sentUpTo - 7);
    const arr = [];
    for (let f = from; f <= this.sentUpTo; f++) arr.push(this.localIn.get(f) ?? 0);
    this.sendRaw({ t: 'in', f: from, i: arr });
  }

  // Called by the match once per local tick. Returns true if a sim frame was simulated.
  stepLockstep(localBits, stepFn) {
    if (!this.sim || this.state === 'closed') return false;
    // schedule our input for frame + delay
    const target = this.frame + this.delay;
    while (this.sentUpTo < target) { this.sentUpTo++; this.localIn.set(this.sentUpTo, localBits); }
    this.flushInputs();
    const f = this.frame;
    if (!this.localIn.has(f) || !this.remoteIn.has(f)) {
      this.stalled = (performance.now() - this.lastStepAt) / 1000;
      return false;
    }
    const mine = this.localIn.get(f), theirs = this.remoteIn.get(f);
    const inputs = this.localIndex === 0 ? [mine, theirs] : [theirs, mine];
    stepFn(inputs);
    this.frame++;
    this.lastStepAt = performance.now(); this.stalled = 0;
    // prune
    if (f > 240) { this.localIn.delete(f - 240); this.remoteIn.delete(f - 240); this.hashes.delete(f - 600); }
    // desync check every 90 frames
    if (this.frame % 90 === 0) {
      const h = this.sim.hash();
      this.hashes.set(this.frame, h);
      if (this.isHost) this.sendRaw({ t: 'hash', f: this.frame, h });
      else if (this.pendingHash && this.pendingHash.f === this.frame) this.compareHash(this.pendingHash);
    }
    return true;
  }
  recvHash(m) {
    if (this.isHost) return;
    if (this.hashes.has(m.f)) this.compareHash(m); else this.pendingHash = m;
  }
  compareHash(m) {
    this.pendingHash = null;
    if (this.hashes.get(m.f) !== m.h && !this.awaitSnap) {
      this.desync = true; this.awaitSnap = true;
      this.sendRaw({ t: 'snapReq' });
    }
  }
  sendSnapshot() {
    // send state at our current frame plus the inputs we have from the guest beyond it
    this.sendRaw({ t: 'snap', f: this.frame, s: this.sim.snapshot() });
  }
  recvSnapshot(m) {
    if (this.isHost || !this.sim) return;
    // load host state at frame m.f and re-simulate any frames we are ahead
    const ahead = this.frame - m.f;
    this.sim.restore(m.s);
    this.sim.events = [];
    const cur = this.frame;
    this.frame = m.f;
    if (ahead > 0) {
      for (let f = m.f; f < cur; f++) {
        const mine = this.localIn.get(f) ?? 0, theirs = this.remoteIn.get(f) ?? 0;
        this.sim.step([theirs, mine]);
        this.sim.events = [];
        this.frame++;
      }
    }
    this.desync = false; this.awaitSnap = false;
  }
}

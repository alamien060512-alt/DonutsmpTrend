// Auction-house driver over Bedrock (Geyser). The Java chest GUI shows up as a
// container: container_open -> inventory_content/slot, and clicks are
// item_stack_request actions that must quote the server's stack ids.
// UNTESTED against the live server: run with `dry` on first and watch `log`.
const { clean } = require('./strategy');

class AhDriver {
  constructor(client, log) {
    this.c = client; this.log = log;
    this.win = null;          // { id, type, slots: Map<slot,item> }
    this.reqId = -1;          // item_stack_request ids are negative and decrease
    this.waiters = [];
    client.on('container_open', (p) => {
      this.win = { id: p.window_id, type: p.window_type, slots: new Map() };
      this._wake();
    });
    client.on('container_close', () => { this.win = null; });
    client.on('inventory_content', (p) => {
      if (!this.win || p.window_id !== this.win.id) return;
      p.input.forEach((it, i) => this.win.slots.set(i, it));
      this._wake();
    });
    client.on('inventory_slot', (p) => {
      if (this.win && p.window_id === this.win.id) { this.win.slots.set(p.slot, p.item); this._wake(); }
    });
  }
  _wake() { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
  _until(pred, ms = 8000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), ms);
      const check = () => { if (pred()) { clearTimeout(t); res(); } else this.waiters.push(check); };
      check();
    });
  }
  say(cmd) {
    this.c.queue('command_request', {
      command: cmd.startsWith('/') ? cmd : '/' + cmd,
      origin: { type: 'player', uuid: '00000000-0000-0000-0000-000000000000', request_id: '', player_entity_id: 0n }, internal: false, version: '52',
    });
  }
  async open(cmd = '/ah') {
    this.win = null; this.say(cmd);
    await this._until(() => this.win && this.win.slots.size > 0);
    return this.win;
  }
  nameOf(it) { return clean(it && (it.network_id ? it.__name || it.name : '') || ''); }
  // Click slot (Java left-click equals Bedrock take of the full stack into the cursor).
  click(slot, count) {
    const it = this.win.slots.get(slot);
    const id = this.reqId; this.reqId -= 2;
    this.c.queue('item_stack_request', { requests: [{
      request_id: id,
      actions: [{ type_id: 'take', count: count || it.count || 1,
        source: { slot_type: { container_id: 'container' }, slot, stack_id: it.stack_id || 0 },
        destination: { slot_type: { container_id: 'cursor' }, slot: 0, stack_id: 0 } }],
      custom_names: [], cause: -1,
    }] });
  }
  // All text found in an item's NBT (name + lore lines), colour codes removed.
  textOf(it) {
    const out = [];
    const walk = (v) => {
      if (typeof v === 'string') out.push(v.replace(/§./g, '').trim());
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(it && (it.extra && it.extra.nbt || it.nbt));
    return out.filter(Boolean);
  }
  // Price per listing: the first lore line that mentions "price" (or a $ amount) and has a number.
  priceOf(it) {
    const lines = this.textOf(it);
    const line = lines.find((l) => /price/i.test(l) && /\d/.test(l)) || lines.find((l) => /\$\s*[\d]/.test(l));
    if (!line) return NaN;
    const m = /\$?\s*([\d][\d,]*(?:\.\d+)?)\s*([kmbKMB]?)/.exec(line.replace(/^.*?price\s*:?/i, ''));
    if (!m) return NaN;
    return parseFloat(m[1].replace(/,/g, '')) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9 })[m[2].toLowerCase()];
  }
  close() {
    if (this.win) this.c.queue('container_close', { window_id: this.win.id, window_type: this.win.type, server: false });
    this.win = null;
  }
}
module.exports = { AhDriver };

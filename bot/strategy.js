// Pure trading logic, no network. A rule says: buy `item` at or below `maxPrice`
// (per unit), then relist at maxPrice-paid * sellMultiple (default 2x).
const clean = (s) => String(s || '').toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_');

// "1.5k" "2m" "3b" "250" -> number
function parsePrice(s) {
  const m = /^(\d+(?:\.\d+)?)([kmb]?)$/i.exec(String(s).trim());
  if (!m) return NaN;
  return +m[1] * { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()];
}

class Rules {
  constructor() { this.rules = new Map(); }
  add(item, maxPrice, sellMultiple = 2, maxStacks = 1) {
    const key = clean(item);
    if (!key || !(maxPrice > 0)) throw new Error('need an item and a positive price');
    const r = { item: key, maxPrice, sellMultiple, maxStacks };
    this.rules.set(key, r);
    return r;
  }
  remove(item) { return this.rules.delete(clean(item)); }
  list() { return [...this.rules.values()]; }
  // listing: { item, price (total), count }
  matches(listing) {
    const r = this.rules.get(clean(listing.item));
    if (!r || !(listing.count > 0)) return null;
    const unit = listing.price / listing.count;
    return unit <= r.maxPrice ? { rule: r, unit } : null;
  }
  sellPrice(item, paidUnit, count) {
    const r = this.rules.get(clean(item));
    const mult = r ? r.sellMultiple : 2;
    return Math.floor(paidUnit * mult * count);
  }
}

module.exports = { Rules, parsePrice, clean };

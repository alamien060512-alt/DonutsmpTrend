const assert = require('assert');
const { Rules, parsePrice } = require('./strategy');
assert.strictEqual(parsePrice('1.5k'), 1500); assert.strictEqual(parsePrice('2m'), 2e6); assert(isNaN(parsePrice('x')));
const r = new Rules(); r.add('minecraft:Diamond', 100, 2);
assert(r.matches({ item: 'diamond', price: 640, count: 8 }));        // 80/ea
assert(!r.matches({ item: 'diamond', price: 960, count: 8 }));       // 120/ea
assert(!r.matches({ item: 'dirt', price: 1, count: 1 }));
assert.strictEqual(r.sellPrice('diamond', 80, 8), 1280);
console.log('strategy ok');

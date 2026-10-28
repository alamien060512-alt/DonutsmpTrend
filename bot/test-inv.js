// Offline check of inventory tracking, bought-item detection and hotbar selection.
const assert = require('assert'), { EventEmitter } = require('events');
const { AhDriver } = require('./ah');
const c = new EventEmitter(); const sent = [];
c.queue = (n, p) => sent.push([n, p]); c.entityId = 7n;
const ah = new AhDriver(c, () => {});
const it = (id, n) => ({ network_id: id, count: n, metadata: 0, has_stack_id: true, stack_id: 1, block_runtime_id: 0, extra: { has_nbt: 0, can_place_on: [], can_destroy: [] } });
c.emit('inventory_content', { window_id: 'inventory', input: [it(5, 3), null, null, null, null, null, null, null, null, it(9, 1)] });
assert.strictEqual(ah.inv.size, 2);
const before = ah.snapshot();
c.emit('inventory_slot', { window_id: 'inventory', slot: 1, item: it(264, 1) });          // bought diamond lands in slot 1
assert.strictEqual(ah.newSlot(before), 1);
ah.select(0); assert.strictEqual(sent.length, 0);                                     // slot 0 already in hand: no packet
ah.select(1);
assert.strictEqual(sent[0][0], 'mob_equipment'); assert.strictEqual(sent[0][1].selected_slot, 1); assert.strictEqual(sent[0][1].runtime_entity_id, 7n);
assert.throws(() => ah.select(9), /main-inventory/); assert.throws(() => ah.select(4), /nothing in/);
c.emit('inventory_slot', { window_id: 'inventory', slot: 1, item: { network_id: 0, count: 0 } });
assert.strictEqual(ah.inv.has(1), false);
console.log('inventory ok');

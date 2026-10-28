// Usage: npm run rakdebug   -> runs the bot's RakNet handshake alone and prints every step.
require('./raknet-patch');
const { Client } = require('jsp-raknet');
const host = process.argv[2] || process.env.SERVER_HOST || 'donutsmp.net';
const port = +(process.argv[3] || process.env.SERVER_PORT || 19132);
const names = { 0x1c: 'UnconnectedPong', 0x06: 'OpenConnectionReply1', 0x08: 'OpenConnectionReply2', 0x19: 'IncompatibleProtocol', 0x14: 'NoFreeConnections', 0x11: 'ConnectionAttemptFailed' };
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const c = new Client(host, port);
const handle = c.handle.bind(c);
c.handle = (buf, r) => { console.log(at(), '<-', names[buf[0]] || (buf[0] > 0x80 ? 'datagram 0x' + buf[0].toString(16) : '0x' + buf[0].toString(16)), buf.length + ' bytes'); return handle(buf, r); };
const send = c.sendBuffer.bind(c);
c.sendBuffer = (b, to) => { console.log(at(), '->', '0x' + b[0].toString(16), b.length + ' bytes'); return send(b, to); };
c.on('connecting', (i) => console.log(at(), 'connecting', JSON.stringify(i)));
c.on('connected', () => { console.log(at(), 'RAKNET CONNECTED - handshake is fine'); process.exit(0); });
c.on('error', (e) => console.log(at(), 'error', e));
c.connect().catch((e) => console.log('connect error', e));
setTimeout(() => { console.log(at(), 'GAVE UP: no full connection'); process.exit(1); }, 20000);

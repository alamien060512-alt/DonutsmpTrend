// Usage: npm run ping [host] [port]   -> asks the server for its Bedrock status.
const dgram = require('dgram');
const host = process.argv[2] || process.env.SERVER_HOST || 'donutsmp.net';
const port = +(process.argv[3] || process.env.SERVER_PORT || 19132);
const s = dgram.createSocket('udp4');
const magic = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const ping = Buffer.concat([Buffer.from([0x01]), Buffer.alloc(8), magic, Buffer.alloc(8)]);
let tries = 0;
const send = () => { s.send(ping, port, host, (e) => e && console.log('send error:', e.message)); };
s.on('message', (m) => {
  const f = m.slice(35).toString().split(';');
  console.log(`ONLINE ${host}:${port}\n  name: ${f[1]}\n  game version: ${f[3]} (protocol ${f[2]})\n  players: ${f[4]}/${f[5]}\n  server's udp port: ${f[10] || '?'}`);
  process.exit(0);
});
send();
const t = setInterval(() => {
  if (++tries >= 4) { console.log(`No reply from ${host}:${port}. Wrong address/port, or your network blocks UDP.`); process.exit(1); }
  send();
}, 2000);

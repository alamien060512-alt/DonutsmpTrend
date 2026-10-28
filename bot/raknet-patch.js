// jsp-raknet fixes for current Bedrock servers:
//  - RakNet protocol 10 -> 11 (servers silently ignore 10)
//  - MTU probing: it only steps 1400 -> 1000 and then gives up, but DonutSMP's
//    path drops big packets. Step down in 200s all the way to 576 and try longer.
const fs = require('fs');
const f = require.resolve('jsp-raknet/js/Client.js');
let src = fs.readFileSync(f, 'utf8');
const before = src;
src = src.replace('const RAKNET_PROTOCOL = 10;', 'const RAKNET_PROTOCOL = 11;')
  .replace('const MAX_CONNECTION_TRIES = 5;', 'const MAX_CONNECTION_TRIES = 8;')
  .replace('this.mtuSize -= 100;', 'this.mtuSize = Math.max(576, this.mtuSize - 200);')
  .replace('await sleep(1500);', 'await sleep(1200);');
if (src !== before) fs.writeFileSync(f, src);

// The server's OpenConnectionReply1 is 32 bytes: it has "security" on and carries a
// 4-byte cookie that must be echoed (plus a challenge byte) in OpenConnectionRequest2.
// jsp-raknet ignores the cookie, so the server never answers step 2.
function patchFile(rel, pairs) {
  const file = require.resolve('jsp-raknet/js/' + rel);
  let s = fs.readFileSync(file, 'utf8'), o = s;
  for (const [a, b] of pairs) if (s.includes(a)) s = s.replace(a, b);
  if (s !== o) fs.writeFileSync(file, s);
}
patchFile('protocol/OpenConnectionReply1.js', [[
  'this.readByte(); // Secure\n        this.mtuSize = this.readShort();',
  'const secure = this.readByte(); // Secure\n        if (secure) this.cookie = this.read(4);\n        this.mtuSize = this.readShort();']]);
patchFile('protocol/OpenConnectionRequest2.js', [[
  'this.writeMagic();\n        this.writeAddress(this.serverAddress);',
  'this.writeMagic();\n        if (this.cookie) { this.append(this.cookie); this.writeByte(0); }\n        this.writeAddress(this.serverAddress);']]);
patchFile('Client.js', [[
  'packet.clientGUID = this.id;\n        packet.serverAddress',
  'packet.clientGUID = this.id;\n        packet.cookie = decodedPacket.cookie;\n        packet.serverAddress']]);

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

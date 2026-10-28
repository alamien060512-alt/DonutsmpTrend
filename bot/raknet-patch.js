// jsp-raknet hardcodes RakNet protocol 10; Bedrock 1.19.30+ servers (and Geyser)
// require 11 and silently ignore protocol 10, so the client just times out.
const fs = require('fs');
const f = require.resolve('jsp-raknet/js/Client.js');
const src = fs.readFileSync(f, 'utf8');
if (src.includes('const RAKNET_PROTOCOL = 10;')) {
  fs.writeFileSync(f, src.replace('const RAKNET_PROTOCOL = 10;', 'const RAKNET_PROTOCOL = 11;'));
}

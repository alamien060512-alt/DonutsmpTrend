// DonutSMP headless Bedrock trader.
//   DONUTSMP_API_KEY=xxx node bot/index.js            (dry run, never spends)
//   LIVE=1 ... node bot/index.js                       (really buys / sells)
// Console commands: help | status | rules | buy <item> <maxPrice> [x2] | drop <item>
//   | cmd <any /command> | scan | live on|off | quit      API: http://127.0.0.1:8080
const http = require('http');
const readline = require('readline');
const { Rules, parsePrice, clean } = require('./strategy');

const KEY = process.env.DONUTSMP_API_KEY;
const BASE = process.env.DONUTSMP_BASE || 'https://api.donutsmp.net/v1';
const HOST = process.env.SERVER_HOST || 'bedrock.donutsmp.net';
const PORT = +process.env.SERVER_PORT || 19132;
const API_PORT = +process.env.BOT_API_PORT || 8080;
const SCAN_MS = +process.env.SCAN_MS || 15000;
const state = { live: process.env.LIVE === '1', connected: false, spent: 0, log: [], holdings: [], prices: {} };
const rules = new Rules();
let ah = null, client = null;

const log = (m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; state.log.push(l); state.log = state.log.slice(-200); console.log(l); };

async function api(p) {
  const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${p}`);
  return r.json();
}
const rowsOf = (b) => b.result || b.data || [];
const toListing = (r) => ({
  item: clean((r.item && (r.item.id || r.item.name)) || ''), price: +r.price,
  count: (r.item && +r.item.count) || 1, seller: r.seller && r.seller.name,
});

// AUTH_TITLE=android|ios|playstation|switch picks which Minecraft app identity signs in.
function authOptions() {
  const T = require('prismarine-auth').Titles;
  const t = { android: ['MinecraftAndroid', 'Android'], ios: ['MinecraftIOS', 'iOS'], playstation: ['MinecraftPlaystation', 'PlayStation'], switch: ['MinecraftNintendoSwitch', 'Nintendo'] }[process.env.AUTH_TITLE];
  const [title, deviceType] = t || ['MinecraftAndroid', 'Android']; // Android is MinecraftAuth's default too
  return { flow: process.env.AUTH_FLOW || 'live', authTitle: T[title], deviceType };
}

// ---- bot connection (Xbox login: first run prints a microsoft.com/link code) ----
function connect() {
  // Phones (Termux) can't build raknet-native; fall back to the pure-JS RakNet.
  let backend = process.env.RAKNET || 'raknet-native';
  try { require('raknet-native'); } catch {
    backend = 'jsp-raknet';
    const Module = require('module'), load = Module._load;
    Module._load = function (req, ...r) { return req === 'raknet-native' ? {} : load.call(this, req, ...r); };
  }
  require('./msa-patch');
  const bedrock = require('bedrock-protocol'); // lazy so the API/console work without it
  client = bedrock.createClient({
    host: HOST, port: PORT, username: process.env.XBOX_ACCOUNT || 'bot',
    profilesFolder: './data/auth', offline: false, raknetBackend: backend, skipPing: backend === 'jsp-raknet', ...(process.env.BEDROCK_VERSION && { version: process.env.BEDROCK_VERSION }),
    ...authOptions(),
    conLog: () => {},
  });
  const { AhDriver } = require('./ah');
  ah = new AhDriver(client, log);
  client.on('join', () => { state.connected = true; log('joined server'); });
  client.on('spawn', () => log('spawned'));
  client.on('close', () => { state.connected = false; log('disconnected; retry in 30s'); setTimeout(connect, 30000); });
  client.on('error', (e) => log('client error: ' + e.message));
  client.on('text', (p) => { if (p.message) log('chat: ' + String(p.message).slice(0, 120)); });
}

// ---- trading ----
let busy = false;
async function scan() {
  if (busy || !rules.list().length) return [];
  busy = true;
  try {
    const hits = [];
    if (!KEY) { // no API key: read the auction house in game
      if (!state.connected) return [];
      for (const r of rules.list()) {
        const win = await ah.open('/ah ' + r.item.replace(/_/g, ' '));
        for (const [slot, it] of win.slots) {
          if (!it || !it.network_id) continue;
          const price = ah.priceOf(it), count = it.count || 1;
          const l = { item: r.item, price, count }, m = price > 0 && rules.matches(l);
          if (m) hits.push({ ...l, unit: m.unit, rule: r, slot });
          if (price > 0) (state.prices[r.item] ||= { low: Infinity }).low = Math.min(state.prices[r.item].low, price / count);
        }
        ah.close();
      }
      hits.sort((a, b) => a.unit - b.unit);
      if (hits[0]) await buy(hits[0]);
      return hits;
    }
    for (const page of [1, 2, 3]) {
      for (const r of rowsOf(await api('/auction/list/' + page))) {
        const l = toListing(r), m = rules.matches(l);
        const s = (state.prices[l.item] ||= { low: Infinity });
        s.low = Math.min(s.low, l.price / l.count); s.t = Date.now();
        if (m) hits.push({ ...l, unit: m.unit, rule: m.rule });
      }
    }
    hits.sort((a, b) => a.unit - b.unit);
    if (hits[0]) await buy(hits[0]);
    return hits;
  } catch (e) { log('scan failed: ' + e.message); return []; } finally { busy = false; }
}

async function buy(h) {
  log(`${state.live ? 'BUY' : 'DRY-BUY'} ${h.count}x ${h.item} @ ${h.unit.toFixed(2)}/ea (total ${h.price}) -> relist ${rules.sellPrice(h.item, h.unit, h.count)}`);
  if (!state.live || !state.connected) return;
  try {
    const win = await ah.open('/ah ' + h.item.replace(/_/g, ' '));
    // Search results are sorted by price in the stock UI; slot 0 is the cheapest match.
    const slot = h.slot ?? [...win.slots.entries()].find(([, it]) => it && it.network_id)?.[0];
    if (slot === undefined) throw new Error('no listing slot found');
    ah.click(slot); await new Promise((r) => setTimeout(r, 600));
    ah.click(slot); // confirm screen reuses the first slot in the stock UI
    state.spent += h.price;
    state.holdings.push({ item: h.item, count: h.count, paidUnit: h.unit, t: Date.now() });
    ah.close();
    ah.say(`/ah sell ${rules.sellPrice(h.item, h.unit, h.count)}`);
    log('relisted at 2x');
  } catch (e) { log('buy failed: ' + e.message); ah.close(); }
}

// ---- commands (console + API) ----
async function run(line) {
  const [c, ...a] = line.trim().split(/\s+/);
  switch ((c || '').toLowerCase()) {
    case 'help': return 'status | rules | buy <item> <maxPrice> [multiple] | drop <item> | cmd </command> | scan | live on|off | quit';
    case 'status': return { connected: state.connected, live: state.live, spent: state.spent, rules: rules.list().length };
    case 'rules': return rules.list();
    case 'buy': { const p = parsePrice(a[1]); return rules.add(a[0], p, +a[2] || 2); }
    case 'drop': return rules.remove(a[0]);
    case 'cmd': if (!client) return 'not connected'; ah.say(a.join(' ')); return 'sent';
    case 'scan': return scan();
    case 'live': state.live = a[0] === 'on'; return { live: state.live };
    case 'quit': process.exit(0);
    default: return 'unknown command; try help';
  }
}

// ---- HTTP API (CORS open, for your future live-price website) ----
http.createServer(async (req, res) => {
  const send = (o, c = 200) => { res.writeHead(c, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/status') return send({ connected: state.connected, live: state.live, spent: state.spent });
    if (u.pathname === '/rules') return send(rules.list());
    if (u.pathname === '/log') return send(state.log);
    if (u.pathname === '/holdings') return send(state.holdings);
    if (u.pathname === '/prices') return send(state.prices);
    if (u.pathname === '/command' && req.method === 'POST') {
      let b = ''; for await (const d of req) b += d;
      return send({ result: await run(JSON.parse(b).command) });
    }
    send({ error: 'not found', routes: ['/status', '/rules', '/log', '/holdings', '/prices', 'POST /command'] }, 404);
  } catch (e) { send({ error: e.message }, 400); }
}).listen(API_PORT, '127.0.0.1', () => log(`API on http://127.0.0.1:${API_PORT}`));

if (require.main === module) {
  if (!KEY) console.log('No API key: reading the auction house in game instead.');
  log(state.live ? 'LIVE mode' : 'DRY RUN (set LIVE=1 to spend money)');
  if (process.env.NO_CONNECT !== '1') connect();
  setInterval(scan, SCAN_MS);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'bot> ' });
  rl.prompt();
  rl.on('line', async (l) => { try { const r = await run(l); console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1)); } catch (e) { console.log('error:', e.message); } rl.prompt(); });
}
module.exports = { run, rules, state };

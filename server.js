// DonutSMP price trend website. Zero dependencies, Node 18+.
//   DONUTSMP_API_KEY=xxxx node server.js     (get a key with /api in-game)
// Polls the real DonutSMP API for auction sales, stores them on disk, and serves
// a stock-market style candlestick UI at http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const KEY = process.env.DONUTSMP_API_KEY;
const BASE = process.env.DONUTSMP_BASE || 'https://api.donutsmp.net/v1';
const PORT = +process.env.PORT || 3000;
const POLL_MS = +process.env.POLL_MS || 30000;
const PAGES = +process.env.PAGES || 3; // transaction pages per poll (45 per min rate budget is fine)
const DATA_FILE = path.join(__dirname, 'data', 'sales.json');
const MAX_SALES = 500000;

if (!KEY) {
  console.error('Missing DONUTSMP_API_KEY. Run: DONUTSMP_API_KEY=your_key node server.js');
  process.exit(1);
}

// sales: [{ k: dedupe key, i: item id, p: unit price, c: count, t: ms }]
let sales = [];
const seen = new Set();
try {
  sales = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  sales.forEach((s) => seen.add(s.k));
} catch {}
let status = { lastPoll: null, lastError: null, polls: 0 };

async function api(p) {
  const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${p}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function itemName(it) {
  return String((it && (it.id || it.name || it.display_name)) || 'unknown').replace(/^minecraft:/, '');
}

async function poll() {
  try {
    let added = 0;
    for (let page = 1; page <= PAGES; page++) {
      const body = await api(`/auction/transactions/${page}`);
      const rows = body.result || body.data || [];
      for (const r of rows) {
        const count = r.item && r.item.count ? +r.item.count : 1;
        const price = +r.price;
        const t = +(r.unix_millis_date_sold || r.time || Date.now());
        if (!(price > 0)) continue;
        const i = itemName(r.item);
        const k = `${i}|${price}|${t}|${r.seller && r.seller.name}`;
        if (seen.has(k)) continue;
        seen.add(k);
        sales.push({ k, i, p: price / count, c: count, t });
        added++;
      }
    }
    if (sales.length > MAX_SALES) sales = sales.slice(-MAX_SALES);
    if (added) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(sales));
    }
    status = { lastPoll: Date.now(), lastError: null, polls: status.polls + 1, added };
  } catch (e) {
    status.lastError = String(e.message || e);
    console.error('poll failed:', status.lastError);
  }
}

// ---- aggregation ----
function candles(item, bucketMs, limit = 200) {
  const m = new Map();
  for (const s of sales) {
    if (s.i !== item) continue;
    const b = Math.floor(s.t / bucketMs) * bucketMs;
    let c = m.get(b);
    if (!c) m.set(b, (c = { t: b, o: s.p, h: s.p, l: s.p, c: s.p, v: 0, _f: s.t, _l: s.t }));
    if (s.t < c._f) { c._f = s.t; c.o = s.p; }
    if (s.t >= c._l) { c._l = s.t; c.c = s.p; }
    c.h = Math.max(c.h, s.p);
    c.l = Math.min(c.l, s.p);
    c.v += s.c;
  }
  return [...m.values()].sort((a, b) => a.t - b.t).slice(-limit).map(({ _f, _l, ...c }) => c);
}

function items() {
  const day = Date.now() - 864e5;
  const m = new Map();
  for (const s of sales) {
    let e = m.get(s.i);
    if (!e) m.set(s.i, (e = { item: s.i, last: s.p, lastT: s.t, vol: 0, first24: null, n: 0 }));
    if (s.t >= e.lastT) { e.last = s.p; e.lastT = s.t; }
    if (s.t >= day) { e.vol += s.c; e.n++; if (e.first24 === null || s.t < e.first24t) { e.first24 = s.p; e.first24t = s.t; } }
  }
  return [...m.values()]
    .map((e) => ({ item: e.item, last: e.last, vol24: e.vol, trades24: e.n, change24: e.first24 ? ((e.last - e.first24) / e.first24) * 100 : 0 }))
    .sort((a, b) => b.trades24 - a.trades24);
}

const json = (res, o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/items') return json(res, { status, sales: sales.length, items: items() });
  if (u.pathname === '/api/candles') {
    const mins = Math.max(1, +u.searchParams.get('minutes') || 60);
    return json(res, candles(u.searchParams.get('item'), mins * 60000));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(PORT, () => {
  console.log(`DonutSMP Trend on http://localhost:${PORT}`);
  poll();
  setInterval(poll, POLL_MS);
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DonutSMP Trend</title><style>
:root{--bg:#0b0e11;--panel:#141a20;--line:#232b33;--tx:#d7dde3;--mu:#7d8a96;--up:#26a69a;--dn:#ef5350}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px system-ui,sans-serif;display:flex;height:100vh}
#side{width:300px;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--panel)}
#side input{margin:10px;padding:8px;background:var(--bg);border:1px solid var(--line);color:var(--tx);border-radius:6px}
#list{overflow:auto;flex:1}.row{display:flex;justify-content:space-between;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--line)}
.row:hover,.row.on{background:#1c242c}.mu{color:var(--mu);font-size:12px}.up{color:var(--up)}.dn{color:var(--dn)}
#main{flex:1;display:flex;flex-direction:column;min-width:0}#head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
#head h1{margin:0;font-size:20px}#tf{margin-left:auto;display:flex;gap:6px}
button{background:var(--panel);color:var(--tx);border:1px solid var(--line);padding:5px 10px;border-radius:6px;cursor:pointer}button.on{background:#2a3642}
#cv{flex:1;width:100%;min-height:0}#st{padding:6px 18px;color:var(--mu);font-size:12px;border-top:1px solid var(--line)}
@media(max-width:700px){body{flex-direction:column}#side{width:100%;height:35vh}}
</style></head><body>
<div id="side"><input id="q" placeholder="Search items..."><div id="list"></div></div>
<div id="main"><div id="head"><h1 id="name">Select an item</h1><span id="px"></span><span id="ch"></span>
<div id="tf"></div></div><canvas id="cv"></canvas><div id="st"></div></div>
<script>
const TFS={'5m':5,'15m':15,'1h':60,'4h':240,'1d':1440};let tf='1h',cur=null,all=[],data=[];
const $=id=>document.getElementById(id);
const fmt=n=>n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(2)+'K':n.toFixed(n<10?2:0);
$('tf').innerHTML=Object.keys(TFS).map(k=>'<button data-k="'+k+'">'+k+'</button>').join('');
$('tf').onclick=e=>{if(e.target.dataset.k){tf=e.target.dataset.k;load()}};
$('q').oninput=renderList;
function renderList(){const q=$('q').value.toLowerCase();
$('list').innerHTML=all.filter(x=>x.item.includes(q)).slice(0,300).map(x=>'<div class="row'+(x.item===cur?' on':'')+'" data-i="'+x.item+'"><div>'+x.item.replace(/_/g,' ')+'<div class="mu">'+x.trades24+' trades 24h</div></div><div style="text-align:right">'+fmt(x.last)+'<div class="'+(x.change24>=0?'up':'dn')+'">'+(x.change24>=0?'+':'')+x.change24.toFixed(1)+'%</div></div></div>').join('')||'<div class="row mu">No data yet. The first sales appear after the first poll.</div>'}
$('list').onclick=e=>{const r=e.target.closest('.row');if(r&&r.dataset.i){cur=r.dataset.i;renderList();load()}};
async function refresh(){const j=await (await fetch('/api/items')).json();all=j.items;renderList();
const s=j.status;$('st').textContent=j.sales+' sales recorded · '+(s.lastPoll?'last poll '+new Date(s.lastPoll).toLocaleTimeString():'waiting for first poll')+(s.lastError?' · ERROR: '+s.lastError:'');
if(!cur&&all.length){cur=all[0].item;renderList()}if(cur)load()}
async function load(){document.querySelectorAll('#tf button').forEach(b=>b.classList.toggle('on',b.dataset.k===tf));
if(!cur)return;data=await (await fetch('/api/candles?item='+encodeURIComponent(cur)+'&minutes='+TFS[tf])).json();
$('name').textContent=cur.replace(/_/g,' ');const l=data[data.length-1],f=data[0];
if(l){$('px').textContent=fmt(l.c)+' / each';const c=(l.c-f.o)/f.o*100;$('ch').textContent=(c>=0?'+':'')+c.toFixed(2)+'%';$('ch').className=c>=0?'up':'dn'}draw()}
function draw(){const cv=$('cv'),d=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;cv.width=W*d;cv.height=H*d;
const g=cv.getContext('2d');g.scale(d,d);g.clearRect(0,0,W,H);if(!data.length){g.fillStyle='#7d8a96';g.fillText('No sales recorded for this item yet',20,30);return}
const pad={l:10,r:70,t:16,b:24},vh=H*0.18,ph=H-pad.t-pad.b-vh;
const hi=Math.max(...data.map(c=>c.h)),lo=Math.min(...data.map(c=>c.l)),rng=(hi-lo)||hi*0.02||1,mv=Math.max(...data.map(c=>c.v));
const y=p=>pad.t+(hi+rng*.05-p)/(rng*1.1)*ph,w=(W-pad.l-pad.r)/data.length;
g.font='11px system-ui';g.strokeStyle='#232b33';g.fillStyle='#7d8a96';
for(let i=0;i<=5;i++){const p=lo+rng*i/5,yy=y(p);g.beginPath();g.moveTo(pad.l,yy);g.lineTo(W-pad.r,yy);g.stroke();g.fillText(fmt(p),W-pad.r+6,yy+4)}
data.forEach((c,i)=>{const x=pad.l+i*w+w/2,up=c.c>=c.o;g.fillStyle=g.strokeStyle=up?'#26a69a':'#ef5350';
g.beginPath();g.moveTo(x,y(c.h));g.lineTo(x,y(c.l));g.stroke();const bw=Math.max(1,w*.7),t=y(Math.max(c.o,c.c)),bh=Math.max(1,Math.abs(y(c.o)-y(c.c)));g.fillRect(x-bw/2,t,bw,bh);
g.globalAlpha=.35;const h=c.v/mv*vh;g.fillRect(x-bw/2,H-pad.b-h,bw,h);g.globalAlpha=1});
g.fillStyle='#7d8a96';const step=Math.ceil(data.length/6);data.forEach((c,i)=>{if(i%step===0){const dt=new Date(c.t);g.fillText(TFS[tf]>=1440?dt.toLocaleDateString():dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),pad.l+i*w,H-6)}})}
addEventListener('resize',draw);refresh();setInterval(refresh,30000);
</script></body></html>`;

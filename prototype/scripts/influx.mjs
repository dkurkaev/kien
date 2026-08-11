import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
// force lots of food so influx wants to be high
for(let i=0;i<6;i++){ await p.evaluate(()=>{window.__forceMess(0);window.__spawnCrumbs();}); }
async function alive(){ return (await p.evaluate(()=>window.__diag())).alive; }
for (const t of [5,10,20,30]) { await sleep(t===5?5000:(t*1000-(t-5)*1000)); }
await sleep(0);
// sample stabilised population
console.log('population over time (target=220):');
for (let s=0;s<4;s++){ console.log('  alive=', await alive()); await sleep(4000); }
// KILL a chunk with spray across the counter, then watch recovery rate
await p.keyboard.press('Digit2'); await sleep(500);
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
for (const [x,z] of [[-2,-1],[-1,0],[0,1],[1,-1],[2,0],[3,1],[-3,0]]) { const s=await proj(x,0.02,z); await p.mouse.click(s[0],s[1]); await sleep(60); }
const k0 = await alive();
console.log('after kill:', k0);
await sleep(5000);
const k5 = await alive();
console.log('after +5s:', k5, ' -> recovered', k5-k0, '(should be ~15, i.e. ~3/sec, not a flood)');
await b.close();

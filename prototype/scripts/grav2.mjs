import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1200);
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(150);
await p.keyboard.press('Digit3'); await sleep(500);
// continuous sweep from centre PAST the open edge (x=-4)
const A=await proj(0.6,0.02,0), C=await proj(-4.3,0.02,0);
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for(let s=1;s<=12;s++){ await p.mouse.move(A[0]+(C[0]-A[0])*s/12, A[1]+(C[1]-A[1])*s/12); await sleep(35);} await p.mouse.up();
// sample the fall trajectory
for (const t of [30, 120, 250, 450]) { await sleep(t===30?30:120);
  const a = await p.evaluate(()=>window.__airStats());
  console.log(`t+${t}:`, JSON.stringify(a));
}
await p.screenshot({ path: '/tmp/kien-grav.png' });
console.log('final crumbs:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs));
await b.close();

import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1500);
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
async function drag(a,c){ const A=await proj(...a),C=await proj(...c);
  await p.mouse.move(A[0],A[1]); await p.mouse.down();
  for(let t=0;t<=1.01;t+=0.1){await p.mouse.move(A[0]+(C[0]-A[0])*t,A[1]+(C[1]-A[1])*t);await sleep(30);} await p.mouse.up(); await sleep(80);}
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
await p.keyboard.press('Digit3'); await sleep(500);
console.log('before sweep:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs));
for(let i=0;i<3;i++) await drag([0.3,0.02,0],[-3.9,0.02,0]);
for (const t of [100, 400, 900, 1600]) { await sleep(t===100?100:t-100);
  const d = (await p.evaluate(()=>window.__diag())).crumbs;
  console.log(`t+${t}ms:`, JSON.stringify(d), 'alive=', d.counter+d.air);
}
await b.close();

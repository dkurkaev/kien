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
  for(let t=0;t<=1.01;t+=0.08){await p.mouse.move(A[0]+(C[0]-A[0])*t,A[1]+(C[1]-A[1])*t);await sleep(25);} await p.mouse.up(); await sleep(120);}

// (1/4) broom sweeps crumbs toward OPEN edge (x=-4) -> should fall to floor
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
await p.keyboard.press('Digit3'); await sleep(500);
for(let i=0;i<3;i++) await drag([0.3,0.02,0],[-3.9,0.02,0]);
await sleep(900);
console.log('sweep to OPEN edge -> crumbs:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs));

// (4) sweep crumbs toward WALL edge (x=+4) -> should pile, NOT go airborne/void
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
for(let i=0;i<3;i++) await drag([-0.3,0.02,0],[3.9,0.02,0]);
await sleep(600);
console.log('sweep to WALL edge -> crumbs:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs), '(air should be ~0)');

// (2) cloth must NOT move crumbs off
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
const before = (await p.evaluate(()=>window.__diag())).crumbs;
await p.keyboard.press('Digit1'); await sleep(500);
for(let i=0;i<3;i++) await drag([-1,0.02,0],[1,0.02,0]);
const after = (await p.evaluate(()=>window.__diag())).crumbs;
console.log('cloth over crumbs -> before/after floor:', before.floor, '/', after.floor, '(should not increase)');

// (6) broom must NOT erase liquid
await p.evaluate(()=>window.__forceMess(0)); await sleep(200);
const wetBefore = (await p.evaluate(()=>window.__diag())).wetCellsPerSurface[0];
await p.keyboard.press('Digit3'); await sleep(500);
for(let i=0;i<3;i++) await drag([-0.5,0.02,-0.5],[0.5,0.02,0.5]);
const wetAfter = (await p.evaluate(()=>window.__diag())).wetCellsPerSurface[0];
console.log('broom over liquid -> wet before/after:', wetBefore, '/', wetAfter, '(should stay ~same)');
await p.screenshot({ path: '/tmp/kien-fixes.png' });
await b.close();

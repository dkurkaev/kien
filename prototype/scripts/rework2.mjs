import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1400,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
async function drag(a, c, slow){
  const A = await proj(...a), C = await proj(...c);
  await p.mouse.move(A[0],A[1]); await p.mouse.down();
  for (let t=0;t<=1.01;t+=0.1){ await p.mouse.move(A[0]+(C[0]-A[0])*t, A[1]+(C[1]-A[1])*t); await sleep(slow?70:20);} 
  await p.mouse.up(); await sleep(120);
}
await sleep(9000);
console.log('after 9s:', JSON.stringify(await p.evaluate(()=>window.__diag())));
await p.screenshot({ path: '/tmp/kien-liq-scene.png' });

// spill on counter, wipe only the LEFT half (native local wipe)
await p.evaluate(()=>window.__forceMess(0)); await sleep(200);
let d = await p.evaluate(()=>window.__diag()); console.log('wet cells after spill:', d.wetCellsPerSurface[0]);
await p.keyboard.press('Digit1'); await sleep(500);
await drag([-0.6,0.02,-0.5],[-0.6,0.02,0.5], true); // wipe a stripe on one side
d = await p.evaluate(()=>window.__diag()); console.log('wet cells after partial wipe:', d.wetCellsPerSurface[0], '(want fewer, not 0)');
await p.screenshot({ path: '/tmp/kien-liq-wiped.png' });

// crumbs -> broom sweep off the LEFT open edge -> fall to floor
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
console.log('crumbs after spawn:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs));
await p.keyboard.press('Digit3'); await sleep(500);
for (let i=0;i<4;i++) await drag([0.2,0.02,0],[-3.9,0.02,0], false); // sweep toward x=-4 open edge
await sleep(800); // let them fall
console.log('crumbs after sweep+fall:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs));
await p.screenshot({ path: '/tmp/kien-liq-crumbfall.png' });
await b.close();

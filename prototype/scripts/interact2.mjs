import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1500);
async function drag(a, c, slow){ // a,c = world [x,y,z]
  const A = await p.evaluate((x,y,z)=>window.__project(x,y,z), ...a);
  const C = await p.evaluate((x,y,z)=>window.__project(x,y,z), ...c);
  await p.mouse.move(A[0],A[1]); await p.mouse.down();
  for (let t=0;t<=1.01;t+=0.12){ await p.mouse.move(A[0]+(C[0]-A[0])*t, A[1]+(C[1]-A[1])*t); await sleep(slow?90:15);} 
  await p.mouse.up(); await sleep(150);
}
// CLOTH edge-wipe cleans a spill (grazes edge, not centre)
await p.evaluate(()=>window.__forceMess(0));
await sleep(150);
console.log('spill radii before:', JSON.stringify(await p.evaluate(()=>window.__spillRadii())));
await p.keyboard.press('Digit1'); await sleep(500);
for (let i=0;i<3;i++) await drag([0.6,0.02,-0.7],[0.6,0.02,0.7], true); // slow wipes grazing the edge
console.log('spill radii after 3 edge-wipes:', JSON.stringify(await p.evaluate(()=>window.__spillRadii())));
// BROOM sweeps a controlled crumb cluster off the front edge
await p.evaluate(()=>window.__spawnCrumbs(0));
await sleep(150);
console.log('crumbs before sweep:', (await p.evaluate(()=>window.__diag())).crumbPerSurface[0]);
await p.keyboard.press('Digit3'); await sleep(500);
for (let i=0;i<3;i++) await drag([0,0.02,-0.2],[0,0.02,1.9], false); // sweep toward front edge
console.log('crumbs after sweep:', (await p.evaluate(()=>window.__diag())).crumbPerSurface[0], '(want fewer)');
await b.close();

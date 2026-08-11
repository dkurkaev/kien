import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1500);

// --- cloth cleans a spill when the stroke grazes its EDGE (not centre) ---
await p.evaluate(()=>window.__forceMess(0)); // spill at counter centre, r=0.7
await sleep(200);
let d = await p.evaluate(()=>window.__diag()); console.log('spills before wipe:', d.spillPerSurface[0]);
await p.keyboard.press('Digit1'); await sleep(500); // cloth
// drag a slow stroke offset ~0.6 world from the spill centre (grazes the edge)
let A = await p.evaluate(()=>window.__project(0.55,0.02,-0.7));
let B = await p.evaluate(()=>window.__project(0.55,0.02,0.7));
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for (let t=0;t<=1.01;t+=0.15){ await p.mouse.move(A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t); await sleep(40);} 
await p.mouse.up(); await sleep(200);
d = await p.evaluate(()=>window.__diag()); console.log('spills after edge-wipe:', d.spillPerSurface[0], '(want fewer)');

// --- broom sweeps crumbs off the surface ---
await p.evaluate(()=>{ const s=[0]; }); // noop
// spawn a crumb cluster near the front edge via natural? force via internal: use a helper
await p.evaluate(()=>window.__spawnCrumbs && window.__spawnCrumbs());
await sleep(200);
d = await p.evaluate(()=>window.__diag()); const c0 = d.crumbPerSurface[0]; console.log('crumbs before sweep:', c0);
await p.keyboard.press('Digit3'); await sleep(500); // broom
// sweep from centre toward the near/front edge
let C = await p.evaluate(()=>window.__project(0,0.02,0));
let D = await p.evaluate(()=>window.__project(0,0.02,1.9));
await p.mouse.move(C[0],C[1]); await p.mouse.down();
for (let t=0;t<=1.01;t+=0.1){ await p.mouse.move(C[0]+(D[0]-C[0])*t, C[1]+(D[1]-C[1])*t); await sleep(30);} 
await p.mouse.up(); await sleep(200);
d = await p.evaluate(()=>window.__diag()); console.log('crumbs after sweep:', d.crumbPerSurface[0], '(want fewer/moved)');
await b.close();

import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1500);
await p.evaluate(()=>window.__forceMess(0)); await sleep(150);
console.log('radii before:', JSON.stringify(await p.evaluate(()=>window.__spillRadii())));
await p.keyboard.press('Digit1'); await sleep(500);
// wipe offset 0.5 world from centre (grazes the blob edge, misses the centre)
const A = await p.evaluate(()=>window.__project(0.5,0.02,-0.5));
const C = await p.evaluate(()=>window.__project(0.5,0.02,0.5));
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for (let t=0;t<=1.01;t+=0.15){ await p.mouse.move(A[0]+(C[0]-A[0])*t, A[1]+(C[1]-A[1])*t); await sleep(90);} 
await p.mouse.up(); await sleep(150);
console.log('counts:', JSON.stringify(await p.evaluate(()=>window.__icounts())));
console.log('radii after edge-graze wipe:', JSON.stringify(await p.evaluate(()=>window.__spillRadii())));
await b.close();

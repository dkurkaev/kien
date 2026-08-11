import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1500);
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
await p.keyboard.press('Digit3'); await sleep(500);
const A=await proj(0.3,0.02,0), C=await proj(-3.9,0.02,0);
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for(let t=0;t<=1.01;t+=0.15){await p.mouse.move(A[0]+(C[0]-A[0])*t,A[1]+(C[1]-A[1])*t);await sleep(25);} await p.mouse.up();
await sleep(160); // catch them mid-fall
await p.screenshot({ path: '/tmp/kien-fall.png' });
await b.close();

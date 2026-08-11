import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1600,1000'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1000);
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
// BIG blob: several overlapping stamps
await p.evaluate(()=>{ for(let i=0;i<6;i++) window.__forceMess(0); });
await sleep(300);
// wipe just the LEFT part (one short stroke through the left side)
await p.keyboard.press('Digit1'); await sleep(400);
const A=await proj(-0.7,0.02,-0.6), C=await proj(-0.7,0.02,0.6);
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for(let t=0;t<=1.01;t+=0.12){ await p.mouse.move(A[0]+(C[0]-A[0])*t, A[1]+(C[1]-A[1])*t); await sleep(70);} await p.mouse.up();
await p.mouse.move(50,50); // hide cursor
await sleep(200);
await p.screenshot({ path: '/tmp/kien-bigwipe.png', clip:{x:540,y:380,width:560,height:400} });
await b.close();

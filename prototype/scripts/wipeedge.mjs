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
// one big spill at counter centre
await p.evaluate(()=>{ window.__forceMess(0); window.__forceMess(0); });
await sleep(300);
await p.screenshot({ path: '/tmp/kien-spill1.png', clip:{x:560,y:400,width:520,height:360} });
// wipe a diagonal stripe THROUGH it (slow = erase)
await p.keyboard.press('Digit1'); await sleep(400);
const A=await proj(-0.9,0.02,-0.6), C=await proj(0.9,0.02,0.6);
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for(let t=0;t<=1.01;t+=0.1){ await p.mouse.move(A[0]+(C[0]-A[0])*t, A[1]+(C[1]-A[1])*t); await sleep(80);} await p.mouse.up();
await sleep(200);
await p.screenshot({ path: '/tmp/kien-spill2.png', clip:{x:560,y:400,width:520,height:360} });
await b.close();

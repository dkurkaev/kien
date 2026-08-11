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
async function box(){ return await p.evaluate(()=>window.__crumbBox()); }
// same short path (~1 world), different SPEED
async function flick(perStepMs, shot){
  await p.evaluate(()=>window.__spawnCrumbs()); await sleep(150);
  const A=await proj(-0.4,0.02,0), C=await proj(0.6,0.02,0);
  await p.mouse.move(A[0],A[1]); await p.mouse.down();
  const n = perStepMs<10 ? 2 : 6;
  for(let s=1;s<=n;s++){ await p.mouse.move(A[0]+(C[0]-A[0])*s/n, A[1]+(C[1]-A[1])*s/n); await sleep(perStepMs);} 
  await p.mouse.up(); await sleep(700); // let them coast & settle
  const bx = await box(); console.log(shot, JSON.stringify(bx));
  await p.screenshot({ path: `/tmp/kien-${shot}.png` });
}
await p.keyboard.press('Digit3'); await sleep(500);
await flick(5, 'FAST');   // whip
// reset crumbs by reloading
await p.reload({ waitUntil:'networkidle2' }); await sleep(1200); await p.keyboard.press('Digit3'); await sleep(500);
await flick(130, 'SLOW'); // deliberate push
await b.close();

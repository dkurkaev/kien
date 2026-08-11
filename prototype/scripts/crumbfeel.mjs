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
// tight cluster at counter centre, measure spread before/after a LIGHT tap-drag
await p.evaluate(()=>window.__spawnCrumbs()); await sleep(200);
async function spread(){ return await p.evaluate(()=>{
  let sx=0,sz=0,n=0,minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  const C=window.__crumbPos ? window.__crumbPos() : null; return C; }); }
await p.keyboard.press('Digit3'); await sleep(500);
// a LIGHT touch: short slow drag ~0.3 world
const A = await proj(0,0.02,-0.15), Cc = await proj(0,0.02,0.15);
await p.mouse.move(A[0],A[1]); await p.mouse.down();
for (let t=0;t<=1.01;t+=0.25){ await p.mouse.move(A[0]+(Cc[0]-A[0])*t, A[1]+(Cc[1]-A[1])*t); await sleep(60);} 
await p.mouse.up(); await sleep(900);
console.log('after light touch, crumbs:', JSON.stringify((await p.evaluate(()=>window.__diag())).crumbs));
await p.screenshot({ path: '/tmp/kien-crumbfeel.png' });
await b.close();

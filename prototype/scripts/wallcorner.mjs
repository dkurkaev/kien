import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(3000); await p.keyboard.press('Digit2'); await sleep(600);
// pointer ON the back wall near the vertical corner
const [sx,sy] = await p.evaluate(()=>window.__project(3.7, 1.2, 2));
await p.mouse.move(sx,sy); await p.mouse.move(sx+1,sy+1);
console.log('on back wall near corner -> discs [counter,back,right] =', JSON.stringify(await p.evaluate(()=>window.__cursor().map(d=>d.vis))));
await p.screenshot({ path: '/tmp/kien-wallcorner.png' });
await b.close();

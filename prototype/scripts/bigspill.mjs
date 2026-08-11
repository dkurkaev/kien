import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(2500);
await p.keyboard.press('Digit2'); await sleep(600);
const [sx,sy] = await p.evaluate(()=>window.__project(3.95,0.02,-0.5));
await p.mouse.move(sx,sy); await p.mouse.move(sx+1,sy+1);
// sample green pixels in the whole canvas via reading the screenshot is hard; instead check disc info
console.log('cursor:', JSON.stringify(await p.evaluate(()=>window.__cursor())));
// test an actual on-ring point on the wall: center (x=4-off, y≈-0.06, z=-0.5), outer ring top ~ y=1.5
const d = await p.evaluate(()=>window.__clip(2, 3.97, 1.0, -0.5));
console.log('clip at ring-top (3.97,1.0,-0.5):', JSON.stringify(d));
await p.screenshot({ path: '/tmp/kien-bigspill.png' });
await b.close();

import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1400,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(12000);
console.log('after 12s:', JSON.stringify(await p.evaluate(()=>window.__diag())));
await p.screenshot({ path: '/tmp/kien-rework.png' });
// single-click spray test (no drag)
await p.keyboard.press('Digit2'); await sleep(600);
const before = await p.evaluate(()=>window.__diag());
const [sx,sy] = await p.evaluate(()=>window.__project(0,0.02,0)); // counter centre
await p.mouse.click(sx, sy);   // pure click, no movement
await sleep(150);
const after = await p.evaluate(()=>window.__diag());
console.log('spray click noFood before/after:', JSON.stringify(before.noFoodPerSurface), '->', JSON.stringify(after.noFoodPerSurface));
await b.close();

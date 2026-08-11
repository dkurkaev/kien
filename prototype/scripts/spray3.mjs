import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(4000);
await p.keyboard.press('Digit2'); await sleep(600);
// aim just inside the 3-way corner (counter meets both walls at world (4,0,2))
const [sx, sy] = await p.evaluate(() => window.__project(3.4, 0.02, 1.4));
console.log('corner screen', sx.toFixed(0), sy.toFixed(0));
await p.mouse.move(sx, sy); await p.mouse.move(sx+1, sy+1);
await p.screenshot({ path: '/tmp/kien-3way-hover.png' });
await p.mouse.down(); await p.mouse.move(sx+2, sy); await p.mouse.up();
await p.keyboard.press('KeyH'); await sleep(300);
await p.mouse.move(sx, sy); await p.mouse.move(sx+1, sy+1);
await p.screenshot({ path: '/tmp/kien-3way-heat.png' });
await b.close();

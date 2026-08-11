import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(4000);
await p.keyboard.press('Digit2'); await sleep(600);          // spray
// hover near the counter/back-wall seam -> ring should bend onto the wall
const pt = [690, 350];
await p.mouse.move(pt[0], pt[1]); await p.mouse.move(pt[0]+1, pt[1]+1);
await p.screenshot({ path: '/tmp/kien-spray-hover.png' });
// spray there, then heatmap on to see the no-food zone across surfaces
await p.mouse.down(); await p.mouse.move(pt[0]+2, pt[1]); await p.mouse.up();
await p.keyboard.press('KeyH'); await sleep(300);
await p.mouse.move(pt[0], pt[1]); await p.mouse.move(pt[0]+1, pt[1]+1);
await p.screenshot({ path: '/tmp/kien-spray-corner.png' });
await b.close();

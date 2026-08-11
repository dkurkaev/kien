import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(3000);
await p.keyboard.press('Digit2');        // spray
await sleep(600);
await p.mouse.move(600, 460); await p.mouse.down();
await p.mouse.move(605, 462); await p.mouse.move(600, 460); await p.mouse.up();
await p.keyboard.press('KeyH');          // heatmap on
await sleep(300);
await p.mouse.move(600, 460); await p.mouse.move(601, 461);
await p.screenshot({ path: '/tmp/kien-spray-disc.png' });
await b.close();

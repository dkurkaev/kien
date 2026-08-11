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
const [sx,sy] = await p.evaluate(()=>window.__project(3.65,0.02,-1.0));
await p.mouse.move(sx,sy); await p.mouse.move(sx+1,sy+1);
const info = await p.evaluate(()=>window.__cursor());
console.log('disc2 (right wall):', JSON.stringify(info[2]));
// test an arc point that should be KEPT: on right wall y=0.5,z=-0.99
const d = await p.evaluate(()=>window.__clip(2, 3.97, 0.5, -0.99));
console.log('clip dist at (3.97,0.5,-0.99):', JSON.stringify(d), '(all >=0 means kept)');
await b.close();

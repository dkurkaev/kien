import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1400,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
// spawn several crumb clusters so ants gather densely on/among them
for (let i=0;i<4;i++){ await p.evaluate(()=>window.__spawnCrumbs()); }
await sleep(14000); // let ants swarm the crumb food
console.log('diag:', JSON.stringify(await p.evaluate(()=>window.__diag())));
await p.screenshot({ path: '/tmp/kien-zorder.png' });
await b.close();

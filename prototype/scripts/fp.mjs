import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(3000);
await p.keyboard.press('Digit2'); await sleep(600);
async function sprayAt(x,y,z,label){
  const [sx,sy] = await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z);
  await p.mouse.move(sx,sy); await p.mouse.down(); await p.mouse.move(sx+2,sy); await p.mouse.up();
  await sleep(150);
  const d = await p.evaluate(()=>window.__diag());
  console.log(label, `screen=(${sx.toFixed(0)},${sy.toFixed(0)})`, 'noFoodPerSurface=', JSON.stringify(d.noFoodPerSurface));
}
await sprayAt(3.4,0.02,1.4,'near 3-way corner');
await b.close();

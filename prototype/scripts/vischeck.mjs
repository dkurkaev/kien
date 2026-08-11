import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1200,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(2500); await p.keyboard.press('Digit2'); await sleep(600);
for (const [x,y,z,n] of [[3.4,0.02,1.4,'corner'],[3.4,0.02,-0.5,'right-only'],[-0.5,0.02,1.4,'back-only']]) {
  const [sx,sy] = await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z);
  await p.mouse.move(sx,sy); await p.mouse.move(sx+1,sy+1);
  const c = await p.evaluate(()=>window.__cursor().map(d=>d.vis));
  console.log(n, 'discs visible [counter,back,right] =', JSON.stringify(c));
}
await b.close();

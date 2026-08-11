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
async function hover(x,y,z,name){
  const [sx,sy] = await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z);
  await p.mouse.move(sx,sy); await p.mouse.move(sx+1,sy+1);
  const info = await p.evaluate(()=>window.__cursor());
  console.log(name, JSON.stringify(info));
}
await hover(0,0.02,1.65,'backspill ');
await hover(3.65,0.02,-1.0,'rightspill');
await b.close();

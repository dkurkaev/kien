import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1600,1000'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(1000);
async function proj(x,y,z){ return await p.evaluate((x,y,z)=>window.__project(x,y,z), x,y,z); }
await p.evaluate(()=>{ window.__forceMess(0); window.__forceMess(0); });
await p.keyboard.press('Digit2'); await sleep(500);
const s = await proj(-1.6,0.02,0.4); await p.mouse.click(s[0], s[1]);
await sleep(500);
await p.screenshot({ path: '/tmp/kien-hires2.png', clip:{x:520,y:380,width:640,height:420} });
await b.close();

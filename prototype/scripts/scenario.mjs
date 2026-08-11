import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5200/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1200,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle2' });

// let ants build trails toward the messes for a while
await sleep(9000);

// 1) cloth cursor mid-drag over the counter (should show a blue ring + erase trail)
await page.mouse.move(470, 360);
await page.mouse.down();
for (let x = 470; x <= 640; x += 15) await page.mouse.move(x, 380);
await page.screenshot({ path: '/tmp/kien-cloth.png' });
await page.mouse.up();

// 2) heatmap on — see the pheromone trails
await page.keyboard.press('h');
await sleep(400);
await page.mouse.move(520, 360); // nudge so nothing else changes
await page.screenshot({ path: '/tmp/kien-heat.png' });
await page.keyboard.press('h');

// 3) spray cursor (green, larger reach)
await page.keyboard.press('2');
await sleep(600);
await page.mouse.move(520, 380);
await page.mouse.move(521, 381);
await page.screenshot({ path: '/tmp/kien-spray.png' });

const diag = await page.evaluate(() => ({
  ants: window,  // placeholder
}));
void diag;
console.log('ERRS', errs.length ? errs.join(' | ') : 'none');
await browser.close();

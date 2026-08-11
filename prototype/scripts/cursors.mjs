import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1200,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' });
await sleep(6000);

// clean shot (pointer parked off-canvas so cursor is hidden)
await page.mouse.move(5, 5);
await page.screenshot({ path: '/tmp/kien-clean.png' });

const spots = { counter: [600, 520], back: [520, 250], right: [770, 380] };
for (const [name, [x, y]] of Object.entries(spots)) {
  await page.mouse.move(x, y);
  await page.mouse.move(x + 1, y + 1);
  await page.screenshot({ path: `/tmp/kien-cur-${name}.png` });
}
await browser.close();

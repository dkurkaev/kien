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

// force food onto the back wall (1) and right wall (2) so ants must climb
await page.evaluate(() => { window.__forceMess(1); window.__forceMess(2); });

for (let t = 5; t <= 25; t += 5) {
  await sleep(5000);
  const d = await page.evaluate(() => window.__diag());
  console.log(`t=${t}s`, JSON.stringify(d));
}
await browser.close();

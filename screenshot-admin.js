const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000');
  await page.fill('input[type=password]', 'worthscale2026');
  await page.click('button[type=submit]');
  // Wait for dashboard to appear (sidebar nav)
  await page.waitForSelector('.sidebar', { timeout: 10000 });
  await page.waitForTimeout(2500); // let table load
  await page.screenshot({ path: 'C:/Users/91703/OneDrive/Desktop/admin-dashboard.png' });
  console.log('Dashboard screenshot saved');
  // Click New Blog in sidebar
  await page.click('[data-panel="new"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/91703/OneDrive/Desktop/admin-new-blog.png' });
  console.log('New Blog panel screenshot saved');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

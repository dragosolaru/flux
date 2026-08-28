import { chromium } from "@playwright/test";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await p.goto("file://" + process.argv[2]);
await p.screenshot({ path: process.argv[3], fullPage: true });
await b.close();

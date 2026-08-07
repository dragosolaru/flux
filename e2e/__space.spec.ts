import { test } from "@playwright/test";
for (const p of ["/", "/login", "/pricing"]) {
test(`space ${p}`, async ({ page }) => {
  await page.goto(p, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,[role="button"],a[href]')).filter(e=>{
      const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;});
    const boxes = els.map(e=>{const r=e.getBoundingClientRect();return {r, d:getComputedStyle(e).display,
      n:(e as HTMLElement).innerText?.replace(/\s+/g,' ').trim().slice(0,25)||e.getAttribute('aria-label')||'', t:e.tagName.toLowerCase()};});
    return boxes.filter(b=>b.r.width<24||b.r.height<24).map(b=>{
      const cx=b.r.x+b.r.width/2, cy=b.r.y+b.r.height/2;
      let min=Infinity;
      for(const o of boxes){ if(o===b) continue;
        const ox=o.r.x+o.r.width/2, oy=o.r.y+o.r.height/2;
        min=Math.min(min, Math.hypot(cx-ox, cy-oy)); }
      return `${b.t} "${b.n}" ${Math.round(b.r.width)}x${Math.round(b.r.height)} disp=${b.d} minCenterDist=${Math.round(min)}`;
    });
  });
  console.log(`\n### ${p}\n` + out.join("\n"));
});
}

import { test, expect } from './harness';

function axes(transform: string) {
 if (!transform || transform === 'none') return { x: 1, y: 1 };
 const match = transform.match(/matrix\(([^)]+)\)/);
 if (!match) return { x: 1, y: 1 };
 const parts = match[1].split(',').map(part => Number(part.trim()));
 return { x: parts[0], y: parts[3] };
}

test('zoom do canvas não escala a barra de cima nem a de baixo', async ({ page, studio }) => {
 await page.goto(studio.url);
 const top = page.locator('.topbar');
 const bar = page.locator('.toolbar');
 const world = page.locator('.world');
 const frame = page.locator('article[aria-label="Base clara"]');
 const frameBefore = await frame.boundingBox();
 const topBefore = await top.boundingBox();
 const barBefore = await bar.boundingBox();
 if (!frameBefore || !topBefore || !barBefore) throw new Error('Chrome ou frame invisível');
 const worldScale = () => world.evaluate(element => {
  const transform = getComputedStyle(element).transform;
  const match = transform.match(/matrix\(([^)]+)\)/);
  return match ? Number(match[1].split(',')[0]) : 1;
 });
 const before = await worldScale();
 await page.getByRole('button', { name: 'Aumentar zoom', exact: true }).click();
 await expect.poll(worldScale).toBeGreaterThan(before * 1.1);
 await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeGreaterThan(frameBefore.width + 8);
 const topAfter = await top.boundingBox();
 const barAfter = await bar.boundingBox();
 expect(Math.abs((topAfter?.width ?? 0) - topBefore.width)).toBeLessThan(1);
 expect(Math.abs((topAfter?.height ?? 0) - topBefore.height)).toBeLessThan(1);
 expect(Math.abs((barAfter?.height ?? 0) - barBefore.height)).toBeLessThan(1);
 const chrome = await page.evaluate(() => ({
  top: getComputedStyle(document.querySelector('.topbar')!).transform,
  bar: getComputedStyle(document.querySelector('.toolbar')!).transform,
  scale: window.visualViewport?.scale ?? 1,
 }));
 expect(axes(chrome.top)).toEqual({ x: 1, y: 1 });
 expect(axes(chrome.bar)).toEqual({ x: 1, y: 1 });
 expect(chrome.scale).toBe(1);
 const mid = await worldScale();
 await page.evaluate(() => {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: -80, ctrlKey: true, bubbles: true, cancelable: true }));
 });
 await expect.poll(worldScale).toBeGreaterThan(mid * 1.04);
 await page.locator('.canvas').hover({ position: { x: 80, y: 80 } });
 await page.keyboard.down('Control');
 await page.mouse.wheel(0, -200);
 await page.keyboard.up('Control');
 expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
 const topWheel = await top.boundingBox();
 const barWheel = await bar.boundingBox();
 expect(Math.abs((topWheel?.width ?? 0) - topBefore.width)).toBeLessThan(1);
 expect(Math.abs((topWheel?.height ?? 0) - topBefore.height)).toBeLessThan(1);
 expect(Math.abs((barWheel?.height ?? 0) - barBefore.height)).toBeLessThan(1);
 const scaled = await page.evaluate(() => ({
  top: getComputedStyle(document.querySelector('.topbar')!).transform,
  bar: getComputedStyle(document.querySelector('.toolbar')!).transform,
 }));
 expect(axes(scaled.top)).toEqual({ x: 1, y: 1 });
 expect(axes(scaled.bar)).toEqual({ x: 1, y: 1 });
});

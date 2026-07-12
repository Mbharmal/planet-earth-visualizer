// M2 verification: dots render, clicking the Ulm dot opens Einstein's card, flyTo moves the camera.
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.loaded() && window.__map.getLayer('view-points'), { timeout: 30_000 })
await new Promise((r) => setTimeout(r, 6_000)) // let tiles settle

await page.screenshot({ path: process.argv[2] ?? 'm2_dots.png' })

// Click Einstein's dot (Ulm) via projected screen coordinates.
const pt = await page.evaluate(() => {
  const p = window.__map.project([9.9876, 48.4011])
  return { x: p.x, y: p.y }
})
console.log('Ulm projects to', pt)
await page.mouse.click(pt.x, pt.y)
await new Promise((r) => setTimeout(r, 4_000)) // flyTo + image load

const cardText = await page.evaluate(() => document.querySelector('aside')?.innerText ?? null)
const zoom = await page.evaluate(() => window.__map.getZoom())
const center = await page.evaluate(() => window.__map.getCenter())
console.log('card:', cardText ? cardText.slice(0, 120).replaceAll('\n', ' | ') : 'NOT FOUND')
console.log('zoom after flyTo:', zoom.toFixed(2), 'center:', center.lng.toFixed(2), center.lat.toFixed(2))

await page.screenshot({ path: process.argv[3] ?? 'm2_card.png' })
await browser.close()

// M4 verification against the real generated datasets: clustering at global
// zoom, the Paris irreducible-cluster popover on scientists, and view switching.
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto('http://localhost:5173/#view=scientists', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await new Promise((r) => setTimeout(r, 6_000))
await page.screenshot({ path: process.argv[2] ?? 'm4_scientists.png' })

// Test 1: cluster click at mid zoom → cluster exists (zoom ≤ clusterMaxZoom).
await page.evaluate(() => window.__map.jumpTo({ center: [2.3522, 48.8566], zoom: 9 }))
await new Promise((r) => setTimeout(r, 4_000))
const clusterPt = await page.evaluate(() => {
  const feats = window.__map.queryRenderedFeatures(undefined, { layers: ['view-clusters'] })
  if (!feats.length) return null
  const p = window.__map.project(feats[0].geometry.coordinates)
  return { x: p.x, y: p.y, count: feats[0].properties.point_count }
})
console.log('cluster at zoom 9:', clusterPt)
if (clusterPt) {
  await page.mouse.click(clusterPt.x, clusterPt.y)
  await new Promise((r) => setTimeout(r, 2_500))
  const popover = await page.evaluate(
    () => document.querySelector('[aria-label="People at this location"]')?.innerText ?? null,
  )
  console.log(
    popover
      ? 'PASS  irreducible cluster popover: ' + popover.slice(0, 90).replaceAll('\n', ' | ')
      : 'INFO  cluster expanded by zoom instead (fine if members not coincident)',
  )
}

// Test 2: stacked coincident dots past clusterMaxZoom → multi-feature click popover.
await page.evaluate(() => window.__map.jumpTo({ center: [2.3522, 48.8567], zoom: 12.5 }))
await new Promise((r) => setTimeout(r, 4_000))
const parisPt = await page.evaluate(() => {
  const p = window.__map.project([2.3522, 48.8567])
  return { x: p.x, y: p.y }
})
await page.mouse.click(parisPt.x, parisPt.y)
await new Promise((r) => setTimeout(r, 1_500))
const stackPopover = await page.evaluate(
  () => document.querySelector('[aria-label="People at this location"]')?.innerText ?? null,
)
console.log(
  stackPopover
    ? 'PASS  stacked-dots popover: ' + stackPopover.slice(0, 90).replaceAll('\n', ' | ')
    : 'FAIL  no popover on stacked coincident dots',
)
await page.screenshot({ path: process.argv[3] ?? 'm4_paris.png' })

// Switch to artists, check dots render.
await page.evaluate(() => {
  window.__map.jumpTo({ center: [10, 45], zoom: 3.5 })
  const chip = [...document.querySelectorAll('nav[aria-label="Views"] button')].find((b) =>
    b.textContent.includes('Artists'),
  )
  chip?.click()
})
await new Promise((r) => setTimeout(r, 5_000))
const artistFeatures = await page.evaluate(
  () => window.__map.queryRenderedFeatures(undefined, { layers: ['view-points', 'view-clusters'] }).length,
)
console.log(artistFeatures > 0 ? `PASS  artists view renders ${artistFeatures} features` : 'FAIL  no artist features')
await page.screenshot({ path: process.argv[4] ?? 'm4_artists.png' })

await browser.close()

// Migration-arcs verification: toggle renders arcs, hash deep link works,
// arcs respect the era filter, and the exodus showcase view.
import puppeteer from 'puppeteer-core'

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

const arcState = () =>
  page.evaluate(() => ({
    visibility: window.__map.getLayoutProperty('view-arcs', 'visibility'),
    rendered: window.__map.queryRenderedFeatures(undefined, { layers: ['view-arcs'] }).length,
  }))

// 1. Arcs hidden by default, toggle shows them
await page.goto('http://localhost:5173/#view=scientists', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-arcs'), { timeout: 30_000 })
await settle(4_000)
const before = await arcState()
check('arcs hidden by default', before.visibility === 'none')
await page.click('[aria-pressed="false"][title*="arcs"]')
await settle(3_000)
const after = await arcState()
const hash = await page.evaluate(() => location.hash)
check('toggle renders arcs and sets hash', after.visibility === 'visible' && after.rendered > 0 && hash.includes('arcs=1'), `${after.rendered} arc segments, ${hash}`)
await page.screenshot({ path: process.argv[2] ?? 'arcs_global.png' })

// 2. The exodus showcase: era 1880:1910 (scientists who fled Europe died in the US)
await page.goto('about:blank')
await page.goto('http://localhost:5173/#view=scientists&era=1880:1910&arcs=1', {
  waitUntil: 'networkidle2',
  timeout: 60_000,
})
await page.waitForFunction(() => window.__map?.getLayer('view-arcs'), { timeout: 30_000 })
await page.evaluate(() => window.__map.jumpTo({ center: [-30, 45], zoom: 2.4 }))
await settle(5_000)
const exodus = await arcState()
check('era-filtered arcs render (exodus era)', exodus.visibility === 'visible' && exodus.rendered > 0, `${exodus.rendered} arc segments over the Atlantic`)
await page.screenshot({ path: process.argv[3] ?? 'arcs_exodus.png' })

// 3. Era filter actually constrains the arcs source
const arcCounts = await page.evaluate(async () => {
  const filtered = window.__map.querySourceFeatures('view-arcs-src').length
  return { filtered }
})
check('arc source is era-filtered (subset of all arcs)', arcCounts.filtered > 0 && arcCounts.filtered < 363, `${arcCounts.filtered} features in source tiles`)

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)

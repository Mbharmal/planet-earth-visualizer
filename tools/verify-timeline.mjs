// Timeline verification: era slider filters (with re-clustering), deep links,
// time-lapse playback, and reset.
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

const countVisible = () =>
  page.evaluate(() => {
    const feats = window.__map.queryRenderedFeatures(undefined, { layers: ['view-points', 'view-clusters'] })
    return feats.reduce((sum, f) => sum + (f.properties.point_count ?? 1), 0)
  })

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. Unfiltered scientists over Europe
await page.goto('http://localhost:5173/#view=scientists', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await page.evaluate(() => window.__map.jumpTo({ center: [10, 48], zoom: 4 }))
await settle(5_000)
const fullCount = await countVisible()
const barLabels = await page.$$eval('[aria-label="Era filter"] span', (els) => els.map((e) => e.textContent))
check('timeline bar shows year bounds', barLabels.length === 2, barLabels.join(' – '))
check('unfiltered view has many points over Europe', fullCount > 50, `${fullCount} visible`)

// 2. Era deep link filters and re-clusters
await page.goto('about:blank')
await page.goto('http://localhost:5173/#view=scientists&era=1600:1700', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await page.evaluate(() => window.__map.jumpTo({ center: [10, 48], zoom: 4 }))
await settle(5_000)
const eraCount = await countVisible()
const eraLabels = await page.$$eval('[aria-label="Era filter"] span', (els) => els.map((e) => e.textContent))
check(
  'era deep link 1600–1700 reduces visible points',
  eraCount > 0 && eraCount < fullCount,
  `${eraCount} vs ${fullCount}`,
)
check('slider labels reflect the deep-linked era', eraLabels.join('–') === '1600–1700', eraLabels.join('–'))
await page.screenshot({ path: process.argv[2] ?? 'timeline_era.png' })

// 3. Reset button clears the filter
await page.click('[aria-label="Reset era filter"]')
await settle(3_000)
const resetCount = await countVisible()
const hashAfterReset = await page.evaluate(() => location.hash)
check('reset restores all points and cleans hash', resetCount === fullCount && !hashAfterReset.includes('era'), `${resetCount}, ${hashAfterReset}`)

// 4. The play button now belongs to the cinematic tour (covered by verify-tour.mjs);
//    here we only assert it exists alongside the manual era slider.
const playBtn = await page.evaluate(() => !!document.querySelector('[aria-label="Play tour"]'))
check('tour play button present in timeline bar', playBtn)
await page.screenshot({ path: process.argv[3] ?? 'timeline_play.png' })

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)

// Cinematic tour verification: play → layers + card + colored dot + advancing
// year; pause on drag; speed cycle; stop → teardown and era/hash restoration.
import puppeteer from 'puppeteer-core'

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto('http://localhost:5173/#view=scientists&era=1700:1800', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await settle(4_000)

// 1. Start the tour
await page.click('[aria-label="Play tour"]')
await settle(6_000) // first flight + reveal
const during = await page.evaluate(() => ({
  tourLayers: ['tour-arcs', 'tour-arcs-glow', 'tour-points', 'tour-points-halo'].every((l) => !!window.__map.getLayer(l)),
  card: document.querySelector('[class*="TourCard"], [class*="tourCard"], [class*="stack"]')?.innerText ?? null,
  pauseBtn: !!document.querySelector('[aria-label="Pause tour"]'),
  progress: [...document.querySelectorAll('[aria-label="Era filter"] span')].map((e) => e.textContent),
  eraInHash: location.hash.includes('era='),
  hash: location.hash,
  staticArcsHidden: window.__map.getLayoutProperty('view-arcs', 'visibility'),
  tourPointCount: window.__map.queryRenderedFeatures(undefined, { layers: ['tour-points'] }).length,
}))
check('tour layers exist', during.tourLayers)
check('tour is playing (pause button shown)', during.pauseBtn)
check('face card visible', !!during.card && during.card.length > 3, (during.card ?? '').slice(0, 60).replaceAll('\n', ' | '))
check('era suppressed in hash during tour', !during.eraInHash, during.hash)
check('static arcs hidden during tour', during.staticArcsHidden === 'none')
await page.screenshot({ path: process.argv[2] ?? 'tour_stop1.png' })

// 2. Year advances between stops
const yearA = await page.evaluate(
  () => [...document.querySelectorAll('[aria-label="Era filter"] span')].map((e) => e.textContent).at(-1),
)
await settle(8_000)
const yearB = await page.evaluate(
  () => [...document.querySelectorAll('[aria-label="Era filter"] span')].map((e) => e.textContent).at(-1),
)
check('tour year advances across stops', yearA !== yearB, `${yearA} → ${yearB}`)

// 3. Colored tour dot rendered
const dot = await page.evaluate(() => {
  const feats = window.__map.queryRenderedFeatures(undefined, { layers: ['tour-points'] })
  return feats[0]?.properties ?? null
})
check('tour dot rendered with journey color', !!dot?.color, JSON.stringify(dot))

// 3b. Card click → expands and pauses the tour (wait out any in-flight phase)
const hadCard = await page
  .waitForSelector('[aria-expanded="false"]', { timeout: 15_000 })
  .then(() => true)
  .catch(() => false)
if (hadCard) {
  await page.click('[aria-expanded="false"]')
  await settle(800)
  const expandState = await page.evaluate(() => ({
    expanded: !!document.querySelector('[aria-expanded="true"]'),
    paused: !!document.querySelector('[aria-label="Resume tour"]'),
    detail: document.querySelector('[aria-expanded="true"]')?.innerText?.slice(0, 100) ?? '',
  }))
  check('card click expands and pauses', expandState.expanded && expandState.paused, expandState.detail.replaceAll('\n', ' | ').slice(0, 80))
  await page.screenshot({ path: process.argv[4] ?? 'tour_expanded.png' })
  // Clicking the expanded card again collapses it AND resumes the tour.
  await page.click('[aria-expanded="true"]')
  await settle(600)
  const afterCollapse = await page.evaluate(() => ({
    collapsed: !document.querySelector('[aria-expanded="true"]'),
    playing: !!document.querySelector('[aria-label="Pause tour"]'),
  }))
  check('collapse click resumes the tour', afterCollapse.collapsed && afterCollapse.playing)
} else {
  check('card click expands and pauses', false, 'no card visible to click (timing)')
  check('collapse click resumes the tour', false, 'skipped')
}

// 3c. Canvas click toggles pause/play
await page.mouse.click(640, 280)
await settle(600)
const pausedByClick = await page.evaluate(() => !!document.querySelector('[aria-label="Resume tour"]'))
await page.mouse.click(640, 280)
await settle(600)
const resumedByClick = await page.evaluate(() => !!document.querySelector('[aria-label="Pause tour"]'))
check('canvas click toggles pause/play', pausedByClick && resumedByClick)

// 3d. Spacebar toggles pause/play
await page.keyboard.press('Space')
await settle(600)
const pausedByKey = await page.evaluate(() => !!document.querySelector('[aria-label="Resume tour"]'))
await page.keyboard.press('Space')
await settle(600)
const resumedByKey = await page.evaluate(() => !!document.querySelector('[aria-label="Pause tour"]'))
check('spacebar toggles pause/play', pausedByKey && resumedByKey)

// 4. Drag pauses the tour
await page.mouse.move(640, 400)
await page.mouse.down()
await page.mouse.move(700, 430, { steps: 5 })
await page.mouse.up()
await settle(1_000)
const pausedAfterDrag = await page.evaluate(() => !!document.querySelector('[aria-label="Resume tour"]'))
check('map drag pauses the tour', pausedAfterDrag)

// 5. Resume + speed cycle
await page.click('[aria-label="Resume tour"]')
await page.click('[aria-label="Tour speed"]')
await settle(500)
const speedText = await page.evaluate(() => document.querySelector('[aria-label="Tour speed"]')?.textContent)
check('speed cycles', speedText !== '×1', speedText ?? 'missing')
await page.screenshot({ path: process.argv[3] ?? 'tour_running.png' })

// 6. Stop: teardown + restoration
await page.click('[aria-label="Stop tour"]')
await settle(1_500)
const after = await page.evaluate(() => ({
  tourLayersGone: ['tour-arcs', 'tour-points'].every((l) => !window.__map.getLayer(l)),
  playBtn: !!document.querySelector('[aria-label="Play tour"]'),
  hash: location.hash,
  labels: [...document.querySelectorAll('[aria-label="Era filter"] span')].map((e) => e.textContent),
}))
check('stop removes tour layers', after.tourLayersGone)
check('play button restored', after.playBtn)
check(
  'era filter restored from snapshot (1700:1800)',
  after.hash.includes('era=1700%3A1800') && after.labels[0] === '1700' && after.labels[1] === '1800',
  `${after.hash} · ${after.labels.join('–')}`,
)

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)

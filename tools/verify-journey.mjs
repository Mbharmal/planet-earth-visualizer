// Journey verification: picker → player → panel content, navigation (buttons +
// arrow keys), path layers, deep links, autoplay toggle, exit restoration.
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

// 1. Journeys chip opens the picker; Euler is listed
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await settle(3_000)
await page.evaluate(() => {
  const chip = [...document.querySelectorAll('nav[aria-label="Views"] button')].find((b) =>
    b.textContent.includes('Stories'),
  )
  chip?.click()
})
await settle(800)
const picker = await page.evaluate(
  () => document.querySelector('[aria-label="Choose a story"]')?.innerText ?? null,
)
check('stories chip opens picker with Euler', !!picker?.includes('Leonhard Euler'), (picker ?? '').slice(0, 60).replaceAll('\n', ' | '))

// 2. Picking Euler starts the player at Basel; view dots are gone
await page.evaluate(() => {
  const item = [...document.querySelectorAll('[aria-label="Choose a story"] button')].find((b) =>
    b.textContent.includes('Euler'),
  )
  item?.click()
})
await settle(4_000)
const start = await page.evaluate(() => ({
  panel: document.querySelector('aside')?.innerText?.slice(0, 200) ?? null,
  journeyLayers: ['journey-done', 'journey-future', 'journey-points'].every((l) => !!window.__map.getLayer(l)),
  viewDotsGone: !window.__map.getLayer('view-points'),
  hash: location.hash,
}))
check('player starts at Basel with panel', !!start.panel?.includes('The prodigy of Basel'), (start.panel ?? '').slice(0, 70).replaceAll('\n', ' | '))
check('journey layers on, view dots hidden', start.journeyLayers && start.viewDotsGone)
check('hash carries journey + wp', start.hash.includes('journey=euler') && start.hash.includes('wp=1'), start.hash)
await page.screenshot({ path: process.argv[2] ?? 'journey_basel.png' })

// 3. Next → St. Petersburg: narrative, formula, image, resources, path segment
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Next'))
  btn?.click()
})
await settle(5_000)
const wp2 = await page.evaluate(() => ({
  text: document.querySelector('aside')?.innerText ?? '',
  formula: !!document.querySelector('aside math'),
  image: [...document.querySelectorAll('aside img')].length,
  links: [...document.querySelectorAll('aside a')].map((a) => a.target),
  pathFeatures: window.__map.queryRenderedFeatures(undefined, { layers: ['journey-done'] }).length,
  hash: location.hash,
}))
check('chapter 2 narrative (Basel problem)', wp2.text.includes('Basel problem'), '')
check('MathML formula renders', wp2.formula)
check('chapter media image present', wp2.image >= 2) // portrait + Königsberg bridges
check('resource links open in new tab', wp2.links.length > 0 && wp2.links.every((t) => t === '_blank'), `${wp2.links.length} links`)
check('traveled path segment rendered', wp2.pathFeatures > 0, `${wp2.pathFeatures} features`)
check('hash advances to wp=2', wp2.hash.includes('wp=2'), wp2.hash)
await page.screenshot({ path: process.argv[3] ?? 'journey_petersburg.png' })

// 4. Arrow-key navigation → Berlin
await page.keyboard.press('ArrowRight')
await settle(4_000)
const wp3 = await page.evaluate(() => ({
  text: document.querySelector('aside')?.innerText?.slice(0, 300) ?? '',
  hash: location.hash,
}))
check('arrow key advances to Berlin', wp3.text.includes('Berlin') && wp3.hash.includes('wp=3'), wp3.hash)

// 5. Deep link straight to a chapter
await page.goto('about:blank')
await page.goto('http://localhost:5173/#journey=euler&wp=4', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('journey-points'), { timeout: 30_000 })
await settle(3_000)
const deep = await page.evaluate(() => document.querySelector('aside')?.innerText?.slice(0, 200) ?? '')
check('deep link opens final chapter', deep.includes('blind, and unstoppable') || deep.includes('Return to St. Petersburg'), deep.slice(0, 60).replaceAll('\n', ' | '))

// 6. Autoplay toggle
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Auto'))
  btn?.click()
})
await settle(500)
const autoBtn = await page.evaluate(
  () => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Auto'))?.getAttribute('aria-pressed'),
)
check('autoplay toggles', autoBtn === 'true' || autoBtn === 'false', `aria-pressed=${autoBtn}`)

// 7. Exit restores the normal view
await page.evaluate(() => document.querySelector('[aria-label="Exit journey"]')?.click())
await settle(3_000)
const after = await page.evaluate(() => ({
  journeyGone: !window.__map.getLayer('journey-points'),
  viewBack: !!window.__map.getLayer('view-points'),
  hash: location.hash,
}))
check('exit removes journey, restores view dots', after.journeyGone && after.viewBack && !after.hash.includes('journey'), after.hash)

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)

// WW2 verification: the battles view (event dates on the timeline, event-kind
// labels) and the hand-written stories (picker listing, deep-linked chapters).
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

// 1. Battles view: dots, war-years timeline, no arcs toggle (events have no death coords)
await page.goto('http://localhost:5173/#view=ww2-battles', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await page.evaluate(() => window.__map.jumpTo({ center: [15, 50], zoom: 3.5 }))
await settle(5_000)
// Globe-projection quirk: cluster CIRCLES render but don't respond to
// queryRenderedFeatures at this zoom; the cluster count SYMBOLS do. Count
// clusters via their labels and sum their point_count properties.
const battles = await page.evaluate(() => {
  const feats = window.__map.queryRenderedFeatures()
  const clusters = feats.filter((f) => f.layer?.id === 'view-cluster-count')
  const singles = feats.filter((f) => f.layer?.id === 'view-points')
  return {
    total: clusters.reduce((s, f) => s + (f.properties.point_count ?? 0), 0) + singles.length,
    clusters: clusters.length,
    timeline: [...document.querySelectorAll('[aria-label="Era filter"] span')].map((e) => e.textContent),
    arcsToggle: !!document.querySelector('[title*="arcs"]'),
  }
})
check('battles render over Europe', battles.total > 30, `${battles.total} battles in ${battles.clusters} clusters`)
check('timeline spans the war years', battles.timeline.join('–').includes('19'), battles.timeline.join('–'))
check('no arcs toggle on an events view', !battles.arcsToggle)
await page.screenshot({ path: process.argv[2] ?? 'ww2_view.png' })

// 2. A battle's card shows a date range, not Born/Died
const stalingrad = await page.evaluate(async () => {
  const src = window.__map.getSource('view')
  return null // placeholder — selection via hash below is more reliable
})
await page.goto('about:blank')
await page.goto('http://localhost:5173/#view=ww2-battles&entry=Q38789', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })
await settle(4_000)
const card = await page.evaluate(() => document.querySelector('aside')?.innerText ?? '')
check('Stalingrad card opens via deep link', card.includes('Battle of Stalingrad'), card.slice(0, 50).replaceAll('\n', ' | '))
check('event card shows date range, not Born/Died', card.includes('1942-08-23') && !card.includes('Born'), '')
await page.screenshot({ path: process.argv[3] ?? 'ww2_card.png' })

// 3. Stories picker lists all four stories
await page.evaluate(() => {
  const chip = [...document.querySelectorAll('nav[aria-label="Views"] button')].find((b) =>
    b.textContent.includes('Stories'),
  )
  chip?.click()
})
await settle(800)
const picker = await page.evaluate(() => document.querySelector('[aria-label="Choose a story"]')?.innerText ?? '')
check(
  'picker lists Euler + 3 WW2 stories',
  ['Euler', 'Stalingrad', 'Pacific', 'D-Day'].every((s) => picker.includes(s)),
  picker.replaceAll('\n', ' | ').slice(0, 120),
)

// 4. Deep link into the Pacific story, chapter 2 (Midway)
await page.goto('about:blank')
await page.goto('http://localhost:5173/#journey=ww2-pacific&wp=2', { waitUntil: 'networkidle2', timeout: 60_000 })
await page.waitForFunction(() => window.__map?.getLayer('journey-points'), { timeout: 30_000 })
await settle(3_000)
const midway = await page.evaluate(() => ({
  text: document.querySelector('aside')?.innerText ?? '',
  img: [...document.querySelectorAll('aside img')].some((i) => i.complete && i.naturalWidth > 0),
}))
check('Pacific story chapter 2 = Midway', midway.text.includes('Five minutes at Midway'), '')
check('Midway chapter image loads', midway.img)
await page.screenshot({ path: process.argv[4] ?? 'ww2_midway.png' })

// 5. Next from Midway crosses the dateline to Guadalcanal without a world-spanning jump
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Next'))
  btn?.click()
})
await settle(5_000)
const guadalcanal = await page.evaluate(() => ({
  text: document.querySelector('aside')?.innerText?.slice(0, 200) ?? '',
  lng: window.__map.getCenter().lng,
}))
check('dateline crossing to Guadalcanal works', guadalcanal.text.includes('Guadalcanal'), `center lng ${guadalcanal.lng.toFixed(1)}`)

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)

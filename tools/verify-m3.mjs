// M3 verification: runtime view discovery, view switching, irreducible-cluster
// popover, deep links, and graceful error state for corrupt data.
// Installs test-view fixtures into the datasets dir and restores it afterwards.
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const datasetsDir = join(root, 'app/public/datasets')
const indexPath = join(datasetsDir, 'index.json')
const originalIndex = await readFile(indexPath, 'utf8')

async function installFixtures() {
  for (const id of ['test-pair', 'test-broken']) {
    await cp(join(root, 'tools/fixtures', id), join(datasetsDir, 'views', id), { recursive: true })
  }
  const index = JSON.parse(originalIndex)
  index.views = index.views.filter((v) => !v.id.startsWith('test-')) // in case a previous run crashed
  index.views.push(
    { id: 'test-pair', title: 'Test Pair', emoji: '🧪', color: '#2eaf6e', path: 'views/test-pair' },
    { id: 'test-broken', title: 'Test Broken', emoji: '💥', color: '#c0392b', path: 'views/test-broken' },
  )
  await writeFile(indexPath, JSON.stringify(index, null, 2))
}

async function restoreDatasets() {
  const index = JSON.parse(originalIndex)
  index.views = index.views.filter((v) => !v.id.startsWith('test-'))
  await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n')
  for (const id of ['test-pair', 'test-broken']) {
    await rm(join(datasetsDir, 'views', id), { recursive: true, force: true })
  }
}

await installFixtures()

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
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

const waitForLayer = () =>
  page.waitForFunction(() => window.__map?.getLayer('view-points'), { timeout: 30_000 })

// 1. Discovery: switcher lists all three views from index.json
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60_000 })
await waitForLayer()
const chips = await page.$$eval('nav[aria-label="Views"] button', (els) => els.map((el) => el.textContent.trim()))
check('switcher lists views from index.json', chips.length === 3, chips.join(', '))

// 2. Switch to Test Pair view
await page.evaluate(() => {
  const chip = [...document.querySelectorAll('nav[aria-label="Views"] button')].find((b) =>
    b.textContent.includes('Test Pair'),
  )
  chip?.click()
})
await new Promise((r) => setTimeout(r, 2_500))
const hashAfterSwitch = await page.evaluate(() => location.hash)
check('view switch updates hash', hashAfterSwitch.includes('view=test-pair'), hashAfterSwitch)

// 3. Click the Paris cluster (two identical-coordinate entries) → popover
const parisPt = await page.evaluate(() => {
  const p = window.__map.project([2.3522, 48.8566])
  return { x: p.x, y: p.y }
})
await page.mouse.click(parisPt.x, parisPt.y)
await new Promise((r) => setTimeout(r, 1_500))
const popover = await page.evaluate(() => {
  const el = document.querySelector('[aria-label="People at this location"]')
  return el ? el.innerText : null
})
check(
  'irreducible cluster opens ClusterList popover',
  !!popover && popover.includes('Paris Person One') && popover.includes('Paris Person Two'),
  popover ? popover.slice(0, 80).replaceAll('\n', ' | ') : 'no popover',
)

// 4. Pick a person from the popover → InfoCard
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[aria-label="People at this location"] button')].find((b) =>
    b.textContent.includes('Paris Person Two'),
  )
  btn?.click()
})
await new Promise((r) => setTimeout(r, 2_000))
const cardAfterCluster = await page.evaluate(() => document.querySelector('aside')?.innerText ?? null)
check('picking from popover opens card', !!cardAfterCluster?.includes('Paris Person Two'), '')

// 5. Deep link: fresh load with #view=scientists&entry=Q935 → Newton card
await page.goto('about:blank')
await page.goto('http://localhost:5173/#view=scientists&entry=Q935', { waitUntil: 'networkidle2', timeout: 60_000 })
await waitForLayer()
await new Promise((r) => setTimeout(r, 3_000))
const deepCard = await page.evaluate(() => document.querySelector('aside')?.innerText ?? null)
const deepZoom = await page.evaluate(() => window.__map.getZoom())
check('deep link opens Newton card', !!deepCard?.includes('Isaac Newton'), `zoom=${deepZoom.toFixed(1)}`)

// 6. Corrupt dataset → error banner, no crash
await page.goto('about:blank')
await page.goto('http://localhost:5173/#view=test-broken', { waitUntil: 'networkidle2', timeout: 60_000 })
await new Promise((r) => setTimeout(r, 3_000))
const banner = await page.evaluate(() => document.querySelector('.error-banner')?.textContent ?? null)
const stillAlive = await page.evaluate(() => !!document.querySelector('nav[aria-label="Views"]'))
check('corrupt data shows error banner without crashing', !!banner && stillAlive, banner ?? 'no banner')

await page.screenshot({ path: process.argv[2] ?? 'm3_final.png' })
await browser.close()
await restoreDatasets()

if (results.some((r) => !r.ok)) process.exit(1)
console.log('ALL PASS')

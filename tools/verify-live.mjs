// Live-site verification against a deployed URL (production build: no window.__map).
// Usage: node tools/verify-live.mjs https://user.github.io/repo/ [screenshot-prefix]
import puppeteer from 'puppeteer-core'

const base = (process.argv[2] ?? 'http://localhost:4173/').replace(/\/?$/, '/')
const prefix = process.argv[3] ?? 'live'

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
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(err.message))

// 1. Landing page: map canvas alive, three views discovered, no fatal panel
await page.goto(base, { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 10_000))
const landing = await page.evaluate(() => {
  const canvas = document.querySelector('.maplibregl-canvas')
  return {
    canvas: !!canvas && canvas.clientWidth > 0 && canvas.clientHeight > 100,
    chips: [...document.querySelectorAll('nav[aria-label="Views"] button')].map((b) => b.textContent.trim()),
    fatal: document.querySelector('.fatal-panel')?.textContent ?? null,
    banner: document.querySelector('.error-banner')?.textContent ?? null,
  }
})
check('map canvas renders at full size', landing.canvas)
check('view switcher lists 3 views', landing.chips.length === 3, landing.chips.join(', '))
check('no fatal/error panels', !landing.fatal && !landing.banner, landing.fatal ?? landing.banner ?? '')
await page.screenshot({ path: `${prefix}_landing.png` })

// 2. Deep link opens a card (datasets fetch + hash routing on the subpath)
await page.goto('about:blank')
await page.goto(`${base}#view=scientists&entry=Q937`, { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 8_000))
const card = await page.evaluate(() => document.querySelector('aside')?.innerText ?? null)
check('deep link opens Einstein card', !!card?.includes('Albert Einstein'))
const imgOk = await page.evaluate(() => {
  const img = document.querySelector('aside img')
  return !!img && img.complete && img.naturalWidth > 0
})
check('card image loaded from Wikimedia', imgOk)
await page.screenshot({ path: `${prefix}_deeplink.png` })

// 3. View switching works in production
await page.evaluate(() => {
  const chip = [...document.querySelectorAll('nav[aria-label="Views"] button')].find((b) =>
    b.textContent.includes('Chess'),
  )
  chip?.click()
})
await new Promise((r) => setTimeout(r, 5_000))
const afterSwitch = await page.evaluate(() => ({
  hash: location.hash,
  banner: document.querySelector('.error-banner')?.textContent ?? null,
}))
check('switch to Chess Players view', afterSwitch.hash.includes('chess-players') && !afterSwitch.banner, afterSwitch.hash)

const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e))
check('no console errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)

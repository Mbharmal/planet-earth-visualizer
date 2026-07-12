// Dev verification helper: screenshot the running app with system Chrome.
// Usage: node tools/screenshot.mjs <output.png> [url] [waitMs]
import puppeteer from 'puppeteer-core'

const [, , out = 'screenshot.png', url = 'http://localhost:5173/', waitMs = '12000'] = process.argv

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})

const page = await browser.newPage()
page.on('console', (msg) => {
  const type = msg.type()
  if (type === 'error' || type === 'warn') console.log(`[console.${type}]`, msg.text())
})
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
await new Promise((r) => setTimeout(r, Number(waitMs)))
await page.screenshot({ path: out })
console.log('saved', out)
await browser.close()

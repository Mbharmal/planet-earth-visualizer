import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('response', (res) => {
  if (!res.ok() && res.status() !== 304) console.log('[http]', res.status(), res.url().slice(0, 120))
})
page.on('requestfailed', (req) => console.log('[reqfail]', req.failure()?.errorText, req.url().slice(0, 120)))
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60_000 })
await new Promise((r) => setTimeout(r, 10_000))

const info = await page.evaluate(() => {
  const canvas = document.querySelector('.maplibregl-canvas')
  const ctrl = document.querySelector('.maplibregl-ctrl-zoom-in')
  const mapDiv = document.querySelector('[class*="map"]')
  return {
    rootChildren: document.getElementById('root')?.innerHTML.slice(0, 300),
    canvasFound: !!canvas,
    canvasSize: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
    navControl: !!ctrl,
    mapDivClass: mapDiv?.className,
    mapDivSize: mapDiv ? { w: mapDiv.clientWidth, h: mapDiv.clientHeight } : null,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()

// Prints each view's tour roster (the ~40 picks) with a bucket histogram,
// for eyeballing regional spread. Usage: node tools/check-roster.mjs [view-id]
import { readFile } from 'node:fs/promises'

// Mirror of app/src/tour/roster.ts selection (kept in sync by eyeball — this
// is a diagnostic, not a test).
const BUCKET_DEG = 15
const BUCKET_CAP = 6
const TARGET = 40

const entryYear = (e) => {
  const m = e.card.birth?.date?.match(/^(-?\d+)/)
  return m ? Number(m[1]) : null
}

function selectRoster(entries) {
  const dated = entries.filter((e) => entryYear(e) !== null)
  const withImage = dated.filter((e) => e.card.image)
  const pool = withImage.length >= TARGET * 2 ? withImage : dated
  const score = (e) => (e.fame ?? 0) * (e.card.image ? 1 : 0.7)
  const sorted = [...pool].sort((a, b) => score(b) - score(a))
  const picked = []
  const counts = new Map()
  for (const e of sorted) {
    if (picked.length >= TARGET) break
    const key = `${Math.floor(e.lat / BUCKET_DEG)},${Math.floor(e.lng / BUCKET_DEG)}`
    const c = counts.get(key) ?? 0
    if (c >= BUCKET_CAP) continue
    counts.set(key, c + 1)
    picked.push(e)
  }
  if (picked.length < TARGET) {
    const chosen = new Set(picked)
    for (const e of sorted) {
      if (picked.length >= TARGET) break
      if (!chosen.has(e)) picked.push(e)
    }
  }
  return { picked, counts }
}

const views = process.argv[2] ? [process.argv[2]] : ['scientists', 'artists', 'chess-players']
for (const view of views) {
  const points = JSON.parse(await readFile(`app/public/datasets/views/${view}/points.json`, 'utf8'))
  const { picked, counts } = selectRoster(points)
  console.log(`\n=== ${view}: ${picked.length} picks ===`)
  const sorted = [...picked].sort((a, b) => entryYear(a) - entryYear(b))
  for (const e of sorted) {
    console.log(
      `  ${String(entryYear(e)).padStart(5)}  ${e.name.padEnd(32)} ${(e.card.birth?.place ?? '').slice(0, 24).padEnd(24)} fame=${e.fame}`,
    )
  }
  console.log('  bucket histogram (bucket: count):', [...counts.entries()].map(([k, v]) => `${k}:${v}`).join('  '))
}

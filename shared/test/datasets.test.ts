import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JourneySchema, ViewIndexSchema, ViewManifestSchema, ViewPointsSchema } from '../src/schema'

/** Validate every committed dataset against the shared schema, so a bad
 *  generator run or hand edit fails CI instead of breaking the app at runtime. */

const DATASETS_DIR = new URL('../../app/public/datasets/', import.meta.url).pathname

const indexRaw = JSON.parse(await readFile(join(DATASETS_DIR, 'index.json'), 'utf8'))
const index = ViewIndexSchema.parse(indexRaw)

describe('datasets/index.json', () => {
  it('parses and lists at least one view', () => {
    expect(index.views.length).toBeGreaterThan(0)
  })

  it('has unique view ids', () => {
    const ids = index.views.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lists every view folder on disk (no drift)', async () => {
    const dirs = (await readdir(join(DATASETS_DIR, 'views'), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    expect(index.views.map((v) => v.id).sort()).toEqual(dirs)
  })
})

describe('journeys', () => {
  it('every journey listed in the index parses and matches its summary', async () => {
    for (const summary of index.journeys ?? []) {
      const journey = JourneySchema.parse(JSON.parse(await readFile(join(DATASETS_DIR, summary.path), 'utf8')))
      expect(journey.id).toBe(summary.id)
      expect(journey.color).toBe(summary.color)
      expect(journey.subject.name).toBe(summary.subject)
      // Chronological waypoints, each resource link is https-ish
      const years = journey.waypoints.map((w) => w.from)
      expect([...years].sort((a, b) => a - b)).toEqual(years)
    }
  })

  it('every journey file on disk is listed in the index', async () => {
    const files = (await readdir(join(DATASETS_DIR, 'journeys'))).filter((f) => f.endsWith('.json')).sort()
    const listed = (index.journeys ?? []).map((j) => j.path.split('/').pop()).sort()
    expect(files).toEqual(listed)
  })
})

describe.each(index.views.map((v) => [v.id, v] as const))('view %s', (_id, summary) => {
  const load = async () => {
    const dir = join(DATASETS_DIR, summary.path)
    const manifest = ViewManifestSchema.parse(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')))
    const points = ViewPointsSchema.parse(JSON.parse(await readFile(join(dir, 'points.json'), 'utf8')))
    return { manifest, points }
  }

  it('manifest and points validate against the schema', async () => {
    await expect(load()).resolves.toBeDefined()
  })

  it('manifest matches the index entry and the points', async () => {
    const { manifest, points } = await load()
    expect(manifest.id).toBe(summary.id)
    expect(manifest.color).toBe(summary.color)
    expect(manifest.count).toBe(points.length)
  })

  it('entry ids are unique', async () => {
    const { points } = await load()
    const ids = points.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a reasonable amount of card content', async () => {
    const { points } = await load()
    const withImage = points.filter((p) => p.card.image).length
    const withSummary = points.filter((p) => p.card.summary.length > 0).length
    expect(withImage / points.length).toBeGreaterThan(0.7)
    expect(withSummary / points.length).toBeGreaterThan(0.9)
  })

  it('generated entries carry a fame score', async () => {
    const { manifest, points } = await load()
    if (manifest.source !== 'wikidata') return
    const withFame = points.filter((p) => typeof p.fame === 'number').length
    expect(withFame / points.length).toBeGreaterThan(0.95)
  })
})

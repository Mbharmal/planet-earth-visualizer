import { JourneySchema, ViewIndexSchema, ViewManifestSchema, ViewPointsSchema, type ViewEntry, type ViewIndex, type ViewManifest } from '@pev/shared'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ViewConfig } from './config'

export const DATASETS_DIR = new URL('../../app/public/datasets/', import.meta.url).pathname

export async function writeView(config: ViewConfig, entries: ViewEntry[]): Promise<ViewManifest> {
  const manifest: ViewManifest = ViewManifestSchema.parse({
    id: config.id,
    title: config.title,
    description: config.description,
    emoji: config.emoji,
    color: config.color,
    source: 'wikidata',
    generatedAt: new Date().toISOString(),
    count: entries.length,
    attribution: 'Data: Wikidata (CC0). Images: Wikimedia Commons.',
  })
  const points = ViewPointsSchema.parse(entries)

  const viewDir = join(DATASETS_DIR, 'views', config.id)
  await mkdir(viewDir, { recursive: true })
  await writeFile(join(viewDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(viewDir, 'points.json'), JSON.stringify(points, null, 2) + '\n')
  return manifest
}

/** Rebuild index.json by scanning the datasets directories, so it can never drift from reality. */
export async function rebuildIndex(): Promise<ViewIndex> {
  const viewsDir = join(DATASETS_DIR, 'views')
  const dirs = (await readdir(viewsDir, { withFileTypes: true })).filter((d) => d.isDirectory())

  const views = []
  for (const dir of dirs) {
    const manifestRaw = await readFile(join(viewsDir, dir.name, 'manifest.json'), 'utf8')
    const manifest = ViewManifestSchema.parse(JSON.parse(manifestRaw))
    views.push({
      id: manifest.id,
      title: manifest.title,
      emoji: manifest.emoji,
      color: manifest.color,
      path: `views/${dir.name}`,
    })
  }
  views.sort((a, b) => a.title.localeCompare(b.title))

  // Journeys are hand-authored files in datasets/journeys/ — scan and summarize.
  const journeys = []
  const journeysDir = join(DATASETS_DIR, 'journeys')
  try {
    const files = (await readdir(journeysDir)).filter((f) => f.endsWith('.json'))
    for (const file of files.sort()) {
      const journey = JourneySchema.parse(JSON.parse(await readFile(join(journeysDir, file), 'utf8')))
      journeys.push({
        id: journey.id,
        title: journey.title,
        person: journey.person.name,
        color: journey.color,
        path: `journeys/${file}`,
      })
    }
  } catch {
    // no journeys directory yet — fine
  }

  const index = ViewIndexSchema.parse({ schemaVersion: 1, views, ...(journeys.length > 0 ? { journeys } : {}) })
  await writeFile(join(DATASETS_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  return index
}

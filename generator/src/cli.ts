import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ViewConfigSchema, type ViewConfig } from './config'
import { buildEventsQuery, buildQuery, runQuery } from './sparql'
import { bindingsToEntries, bindingsToEventEntries } from './transform'
import { fetchKnownFor } from './works'
import { rebuildIndex, writeView } from './writeView'

const CONFIGS_DIR = new URL('../view-configs/', import.meta.url).pathname

async function loadConfigs(): Promise<ViewConfig[]> {
  const files = (await readdir(CONFIGS_DIR)).filter((f) => f.endsWith('.json')).sort()
  return Promise.all(
    files.map(async (file) => ViewConfigSchema.parse(JSON.parse(await readFile(join(CONFIGS_DIR, file), 'utf8')))),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const all = args.length === 0 || args.includes('--all')

  const configs = await loadConfigs()
  const targets = all ? configs : configs.filter((c) => args.includes(c.id))
  if (targets.length === 0) {
    console.error(`No matching view configs. Available: ${configs.map((c) => c.id).join(', ')}`)
    process.exit(1)
  }

  for (const config of targets) {
    const events = config.kind === 'events'
    const detail = events
      ? `${config.eventClasses?.join('+')} in ${config.eventFrom}..${config.eventTo}`
      : (config.occupationNote ?? config.occupations?.join(', '))
    console.log(`Generating "${config.id}" (${detail}, sitelinks ≥ ${config.minSitelinks}) ...`)
    const bindings = await runQuery(events ? buildEventsQuery(config) : buildQuery(config))
    const entries = events ? bindingsToEventEntries(bindings) : bindingsToEntries(bindings)
    if (!events) {
      const knownFor = await fetchKnownFor(entries)
      for (const entry of entries) {
        const info = knownFor.get(entry.id)
        if (info) entry.card.knownFor = info
      }
    }
    const manifest = await writeView(config, entries)
    console.log(`  ${bindings.length} rows → ${manifest.count} entries written`)
  }

  const index = await rebuildIndex()
  console.log(`index.json rebuilt: ${index.views.map((v) => v.id).join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

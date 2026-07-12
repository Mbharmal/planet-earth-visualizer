import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ViewConfigSchema, type ViewConfig } from './config'
import { buildQuery, runQuery } from './sparql'
import { bindingsToEntries } from './transform'
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
    console.log(`Generating "${config.id}" (${config.occupationNote ?? config.occupations.join(', ')}, sitelinks ≥ ${config.minSitelinks}) ...`)
    const bindings = await runQuery(buildQuery(config))
    const entries = bindingsToEntries(bindings)
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

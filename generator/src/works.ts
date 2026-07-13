import type { ViewEntry } from '@pev/shared'
import { commonsImageUrls } from './commons'
import { runQuery, type SparqlBinding } from './sparql'

/**
 * Second-pass enrichment: for every entry, find its single most famous notable
 * work (highest sitelinks), preferring works that carry an image (P18) or a
 * defining formula (P2534, MathML). SAMPLE() in the main query would pick an
 * arbitrary work — Leonardo would get a sketch instead of the Mona Lisa.
 */

const CHUNK_SIZE = 150

interface WorkInfo {
  title: string
  sitelinks: number
  imageUrl?: string
  formula?: string
}

function buildWorksQuery(personQids: string[]): string {
  const values = personQids.map((q) => `wd:${q}`).join(' ')
  return `
SELECT ?person ?work ?workLabel ?sitelinks (SAMPLE(?img) AS ?image) (SAMPLE(?formulaRaw) AS ?formula)
WHERE {
  VALUES ?person { ${values} }
  ?person wdt:P800 ?work .
  ?work wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?work wdt:P18 ?img }
  OPTIONAL { ?work wdt:P2534 ?formulaRaw }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?person ?work ?workLabel ?sitelinks
`.trim()
}

/** Keep MathML only if it looks like plain presentation markup. */
function sanitizeMathML(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const value = raw.trim()
  if (!value.startsWith('<math')) return undefined
  if (/<\s*script|on\w+\s*=|href\s*=|xlink/i.test(value)) return undefined
  if (value.length > 4000) return undefined
  return value
}

function qidOf(binding: SparqlBinding, variable: string): string | undefined {
  return binding[variable]?.value.split('/').pop()
}

export async function fetchKnownFor(entries: ViewEntry[]): Promise<Map<string, NonNullable<ViewEntry['card']['knownFor']>>> {
  const qids = entries.map((e) => e.id).filter((id) => /^Q\d+$/.test(id))
  const byPerson = new Map<string, WorkInfo[]>()

  for (let i = 0; i < qids.length; i += CHUNK_SIZE) {
    const chunk = qids.slice(i, i + CHUNK_SIZE)
    const bindings = await runQuery(buildWorksQuery(chunk))
    for (const binding of bindings) {
      const person = qidOf(binding, 'person')
      const title = binding.workLabel?.value
      if (!person || !title || /^Q\d+$/.test(title)) continue
      const works = byPerson.get(person) ?? []
      works.push({
        title,
        sitelinks: Number(binding.sitelinks?.value ?? 0),
        imageUrl: binding.image?.value,
        formula: sanitizeMathML(binding.formula?.value),
      })
      byPerson.set(person, works)
    }
  }

  const result = new Map<string, NonNullable<ViewEntry['card']['knownFor']>>()
  for (const [person, works] of byPerson) {
    works.sort((a, b) => b.sitelinks - a.sitelinks)
    // Highest-ranked work that carries media (image/formula); else the most famous, text-only.
    const chosen = works.find((w) => w.imageUrl || w.formula) ?? works[0]!
    result.set(person, {
      title: chosen.title,
      ...(chosen.imageUrl ? { image: commonsImageUrls(chosen.imageUrl) } : {}),
      ...(chosen.formula ? { formula: chosen.formula } : {}),
    })
  }
  return result
}

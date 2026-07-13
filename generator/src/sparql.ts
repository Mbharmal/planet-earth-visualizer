import type { ViewConfig } from './config'

const ENDPOINT = 'https://query.wikidata.org/sparql'

// Wikimedia etiquette: descriptive User-Agent with contact info, sequential
// queries only, backoff on 429/5xx. https://meta.wikimedia.org/wiki/User-Agent_policy
const USER_AGENT = 'PlanetEarthVisualizer/0.1 (https://github.com/Mbharmal/planet-earth-visualizer)'

export interface SparqlBinding {
  [variable: string]: { type: string; value: string } | undefined
}

/** Dated events (battles etc.): class-family members dated within a window.
 *  Part-of chains (P361) to umbrella events are 4–6 hops deep and irregular in
 *  Wikidata — Iwo Jima → campaign → Japan Campaign → Pacific War → WW2 — so
 *  membership is selected by class + date instead. */
export function buildEventsQuery(config: ViewConfig): string {
  const classes = (config.eventClasses ?? []).map((qid) => `wd:${qid}`).join(' ')
  return `
SELECT ?event ?eventLabel ?eventDescription ?sitelinks
       (SAMPLE(?coordRaw) AS ?coord)
       (SAMPLE(?img) AS ?image)
       (SAMPLE(?startRaw) AS ?start)
       (SAMPLE(?endRaw) AS ?end)
       (SAMPLE(?whenRaw) AS ?when)
       (SAMPLE(?article) AS ?wikipedia)
WHERE {
  VALUES ?cls { ${classes} }
  ?event wdt:P31/wdt:P279* ?cls .
  ?event wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${config.minSitelinks})
  ?event wdt:P625 ?coordRaw .
  ?event (wdt:P585|wdt:P580) ?anchor .
  FILTER("${config.eventFrom}T00:00:00Z"^^xsd:dateTime <= ?anchor && ?anchor <= "${config.eventTo}T23:59:59Z"^^xsd:dateTime)
  OPTIONAL { ?event wdt:P580 ?startRaw }
  OPTIONAL { ?event wdt:P582 ?endRaw }
  OPTIONAL { ?event wdt:P585 ?whenRaw }
  OPTIONAL { ?event wdt:P18 ?img }
  OPTIONAL { ?article schema:about ?event ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?event ?eventLabel ?eventDescription ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT ${config.limit}
`.trim()
}

export function buildQuery(config: ViewConfig): string {
  const occupations = (config.occupations ?? []).map((qid) => `wd:${qid}`).join(' ')
  return `
SELECT ?person ?personLabel ?personDescription ?sitelinks
       (SAMPLE(?coordRaw) AS ?coord)
       (SAMPLE(?img) AS ?image)
       (SAMPLE(?birthDate) AS ?birth)
       (SAMPLE(?deathDate) AS ?death)
       (SAMPLE(?birthplaceLabelRaw) AS ?birthplaceLabel)
       (SAMPLE(?deathCoordRaw) AS ?deathCoord)
       (SAMPLE(?deathplaceLabelRaw) AS ?deathplaceLabel)
       (SAMPLE(?article) AS ?wikipedia)
       (GROUP_CONCAT(DISTINCT ?workLabel; separator="|") AS ?works)
WHERE {
  VALUES ?occ { ${occupations} }
  ?person wdt:P106 ?occ ;
          wdt:P19 ?birthplace ;
          wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${config.minSitelinks})
  ?birthplace wdt:P625 ?coordRaw .
  OPTIONAL { ?person wdt:P18 ?img }
  OPTIONAL { ?person wdt:P569 ?birthDate }
  OPTIONAL { ?person wdt:P570 ?deathDate }
  OPTIONAL {
    ?person wdt:P20 ?deathplace .
    ?deathplace wdt:P625 ?deathCoordRaw .
    OPTIONAL { ?deathplace rdfs:label ?deathplaceLabelRaw . FILTER(LANG(?deathplaceLabelRaw) = "en") }
  }
  OPTIONAL { ?person wdt:P800 ?work . ?work rdfs:label ?workLabel . FILTER(LANG(?workLabel) = "en") }
  OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?birthplace rdfs:label ?birthplaceLabelRaw . FILTER(LANG(?birthplaceLabelRaw) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?person ?personLabel ?personDescription ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT ${config.limit}
`.trim()
}

export async function runQuery(query: string, maxAttempts = 4): Promise<SparqlBinding[]> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(90_000),
      })

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
        console.warn(`  HTTP ${res.status}, retrying in ${waitMs / 1000}s (attempt ${attempt}/${maxAttempts})`)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      if (!res.ok) {
        throw new Error(`SPARQL request failed: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 300))}`)
      }

      const json = (await res.json()) as { results: { bindings: SparqlBinding[] } }
      return json.results.bindings
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        const waitMs = 2 ** attempt * 1000
        console.warn(`  ${err instanceof Error ? err.message : err}, retrying in ${waitMs / 1000}s`)
        await new Promise((r) => setTimeout(r, waitMs))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

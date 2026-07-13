import type { ViewEntry } from '@pev/shared'
import { commonsImageUrls } from './commons'
import type { SparqlBinding } from './sparql'

// P625 comes back as WKT: "Point(<longitude> <latitude>)" — longitude FIRST.
const WKT_POINT = /^Point\(([-+\d.eE]+) ([-+\d.eE]+)\)$/i

const MAX_FACTS = 5

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  // Wikidata timestamps look like "1879-03-14T00:00:00Z" (possibly with a
  // leading "-" for BCE). Keep the date part only.
  const match = value.match(/^(-?\d{1,6}-\d{2}-\d{2})/)
  return match ? match[1] : undefined
}

export function bindingsToEntries(bindings: SparqlBinding[]): ViewEntry[] {
  const seen = new Set<string>()
  const entries: ViewEntry[] = []

  for (const binding of bindings) {
    const personUri = binding.person?.value
    const name = binding.personLabel?.value
    const wkt = binding.coord?.value
    if (!personUri || !name || !wkt) continue

    const qid = personUri.split('/').pop() ?? personUri
    if (seen.has(qid)) continue
    // Entities without an English label fall back to their QID — skip those.
    if (/^Q\d+$/.test(name)) continue

    const coordMatch = wkt.match(WKT_POINT)
    if (!coordMatch) continue
    const lng = Number(coordMatch[1])
    const lat = Number(coordMatch[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue

    seen.add(qid)

    const facts = (binding.works?.value ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_FACTS)

    const birthDate = parseDate(binding.birth?.value)
    const birthPlace = binding.birthplaceLabel?.value
    const deathDate = parseDate(binding.death?.value)
    const deathPlace = binding.deathplaceLabel?.value

    // Death place coordinates (optional) — power the migration-arc layer.
    let deathLat: number | undefined
    let deathLng: number | undefined
    const deathCoordMatch = binding.deathCoord?.value?.match(WKT_POINT)
    if (deathCoordMatch) {
      const dLng = Number(deathCoordMatch[1])
      const dLat = Number(deathCoordMatch[2])
      if (Number.isFinite(dLat) && Number.isFinite(dLng) && Math.abs(dLat) <= 90 && Math.abs(dLng) <= 180) {
        deathLat = dLat
        deathLng = dLng
      }
    }

    const entry: ViewEntry = {
      id: qid,
      name,
      lat,
      lng,
      ...(deathLat !== undefined && deathLng !== undefined ? { deathLat, deathLng } : {}),
      card: {
        ...(binding.image?.value ? { image: commonsImageUrls(binding.image.value) } : {}),
        summary: binding.personDescription?.value ?? '',
        ...(birthDate || birthPlace ? { birth: { ...(birthDate && { date: birthDate }), ...(birthPlace && { place: birthPlace }) } } : {}),
        ...(deathDate || deathPlace ? { death: { ...(deathDate && { date: deathDate }), ...(deathPlace && { place: deathPlace }) } } : {}),
        facts,
        links: {
          ...(binding.wikipedia?.value ? { wikipedia: binding.wikipedia.value } : {}),
          wikidata: `https://www.wikidata.org/wiki/${qid}`,
        },
      },
    }
    entries.push(entry)
  }

  return entries
}

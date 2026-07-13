import { z } from 'zod'

/**
 * The data contract of the whole project.
 *
 * A "view" is pure data: a manifest describing the theme plus a flat list of
 * point entries. The app discovers views at runtime from datasets/index.json,
 * so adding a view means adding files — never code.
 */

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase slug expected')
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color expected')

export const ViewSummarySchema = z.object({
  id: slug,
  title: z.string().min(1),
  emoji: z.string().min(1),
  color: hexColor,
  /** Path of the view folder relative to the datasets root, e.g. "views/scientists". */
  path: z.string().min(1),
})

export const JourneySummarySchema = z.object({
  id: slug,
  title: z.string().min(1),
  subject: z.string().min(1),
  color: hexColor,
  /** Path of the story file relative to the datasets root, e.g. "journeys/euler.json". */
  path: z.string().min(1),
})

export const ViewIndexSchema = z.object({
  schemaVersion: z.literal(1),
  views: z.array(ViewSummarySchema),
  /** Guided multi-waypoint life stories. Optional so older indexes stay valid. */
  journeys: z.array(JourneySummarySchema).optional(),
})

export const PointStyleSchema = z.object({
  radius: z.number().positive().optional(),
  strokeColor: z.string().optional(),
  clusterColor: z.string().optional(),
})

export const ViewManifestSchema = z.object({
  id: slug,
  title: z.string().min(1),
  description: z.string(),
  emoji: z.string().min(1),
  color: hexColor,
  /** What the entries are — drives date labels ("Born/Died" vs "Began/Ended"). Default: people. */
  kind: z.enum(['people', 'events']).optional(),
  pointStyle: PointStyleSchema.optional(),
  source: z.enum(['wikidata', 'manual']),
  generatedAt: z.iso.datetime(),
  count: z.int().nonnegative(),
  attribution: z.string(),
})

export const ViewEntrySchema = z.object({
  /** Stable unique id; Wikidata QID (e.g. "Q937") for generated views. */
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Death place coordinates, when known — enables birth→death migration arcs. */
  deathLat: z.number().min(-90).max(90).optional(),
  deathLng: z.number().min(-180).max(180).optional(),
  /** Notability proxy (Wikipedia sitelink count) — drives tour roster selection. */
  fame: z.int().nonnegative().optional(),
  card: z.object({
    image: z
      .object({
        url: z.url(),
        thumbUrl: z.url(),
      })
      .optional(),
    summary: z.string(),
    birth: z.object({ date: z.string().optional(), place: z.string().optional() }).optional(),
    death: z.object({ date: z.string().optional(), place: z.string().optional() }).optional(),
    /** Short notable facts / works, rendered as a list. */
    facts: z.array(z.string()).max(5),
    /** The single most famous work — shown during tour stops and on cards. */
    knownFor: z
      .object({
        title: z.string().min(1),
        image: z.object({ url: z.url(), thumbUrl: z.url() }).optional(),
        /** Sanitized MathML markup (browsers render it natively). */
        formula: z.string().optional(),
      })
      .optional(),
    links: z.object({
      wikipedia: z.url().optional(),
      wikidata: z.url().optional(),
    }),
  }),
})

/** Contents of a view's points.json: a flat array of entries (not GeoJSON — portable to native SDKs). */
export const ViewPointsSchema = z.array(ViewEntrySchema)

/** Sanitized MathML markup (browsers render it natively; content is repo-authored). */
const mathML = z.string().startsWith('<math').max(4000)

const imageRef = z.object({
  url: z.url(),
  thumbUrl: z.url(),
  caption: z.string().optional(),
})

const resourceLink = z.object({
  label: z.string().min(1),
  url: z.url(),
})

export const JourneyWaypointSchema = z.object({
  id: slug,
  title: z.string().min(1),
  place: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Year span at this place (negative = BCE). `to` omitted for a single-year event. */
  from: z.int(),
  to: z.int().optional(),
  /** Short chapter tag shown above the title, e.g. "Born here", "The turning point". */
  label: z.string().min(1).max(40),
  /** The story of this chapter — a paragraph or two of plain text. */
  narrative: z.string().min(1),
  media: z
    .object({
      image: imageRef.optional(),
      formula: mathML.optional(),
      formulaCaption: z.string().optional(),
    })
    .optional(),
  /** Keywords of works produced in this period, rendered as chips. */
  works: z.array(z.string()).max(8).optional(),
  /** Further reading for this specific chapter. */
  resources: z.array(resourceLink).max(6).optional(),
})

export const JourneySchema = z.object({
  id: slug,
  title: z.string().min(1),
  /** Who or what the story is about — a person (journey) or an event (story). */
  subject: z.object({
    name: z.string().min(1),
    /** Shown under the name: a lifespan for people, a date range for events. */
    subtitle: z.string().min(1),
    image: imageRef.optional(),
    link: z.url().optional(),
  }),
  summary: z.string().min(1),
  color: hexColor,
  waypoints: z.array(JourneyWaypointSchema).min(2),
  /** Further reading for the whole journey. */
  resources: z.array(resourceLink).max(10).optional(),
  attribution: z.string(),
})

export type ViewSummary = z.infer<typeof ViewSummarySchema>
export type ViewIndex = z.infer<typeof ViewIndexSchema>
export type JourneySummary = z.infer<typeof JourneySummarySchema>
export type JourneyWaypoint = z.infer<typeof JourneyWaypointSchema>
export type Journey = z.infer<typeof JourneySchema>
export type PointStyle = z.infer<typeof PointStyleSchema>
export type ViewManifest = z.infer<typeof ViewManifestSchema>
export type ViewEntry = z.infer<typeof ViewEntrySchema>

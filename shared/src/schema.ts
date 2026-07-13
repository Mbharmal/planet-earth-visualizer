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

export const ViewIndexSchema = z.object({
  schemaVersion: z.literal(1),
  views: z.array(ViewSummarySchema),
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

export type ViewSummary = z.infer<typeof ViewSummarySchema>
export type ViewIndex = z.infer<typeof ViewIndexSchema>
export type PointStyle = z.infer<typeof PointStyleSchema>
export type ViewManifest = z.infer<typeof ViewManifestSchema>
export type ViewEntry = z.infer<typeof ViewEntrySchema>

import { z } from 'zod'

export const ViewConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    description: z.string(),
    emoji: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    /** 'people' (default): birthplaces by occupation. 'events': dated happenings. */
    kind: z.enum(['people', 'events']).optional(),
    /** People views: Wikidata occupation QIDs (P106 values), e.g. "Q169470" = physicist. */
    occupations: z.array(z.string().regex(/^Q\d+$/)).min(1).optional(),
    occupationNote: z.string().optional(),
    /** Event views: instance-of class families (P31/P279*), e.g. battle + offensive.
     *  Selection is class ∈ families AND dated within [from, to] — part-of chains in
     *  Wikidata are too deep/irregular to climb reliably. */
    eventClasses: z.array(z.string().regex(/^Q\d+$/)).min(1).optional(),
    eventFrom: z.iso.date().optional(),
    eventTo: z.iso.date().optional(),
    /** Notability threshold: minimum number of Wikipedia sitelinks. */
    minSitelinks: z.int().positive(),
    limit: z.int().positive().max(2000),
  })
  .refine((c) => (c.kind === 'events' ? !!c.eventClasses && !!c.eventFrom && !!c.eventTo : !!c.occupations), {
    message: 'people views need occupations; event views need eventClasses + eventFrom + eventTo',
  })

export type ViewConfig = z.infer<typeof ViewConfigSchema>

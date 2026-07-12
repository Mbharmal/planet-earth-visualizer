import { z } from 'zod'

export const ViewConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string(),
  emoji: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Wikidata occupation QIDs (P106 values), e.g. "Q169470" = physicist. */
  occupations: z.array(z.string().regex(/^Q\d+$/)).min(1),
  occupationNote: z.string().optional(),
  /** Notability threshold: minimum number of Wikipedia sitelinks. */
  minSitelinks: z.int().positive(),
  limit: z.int().positive().max(2000),
})

export type ViewConfig = z.infer<typeof ViewConfigSchema>

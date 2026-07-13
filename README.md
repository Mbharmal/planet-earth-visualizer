# 🌍 Planet Earth Visualizer

An interactive 3D globe of thematic "views" — famous scientists, artists and chess players mapped where they were born. Click a dot to see who it is; click a cluster to zoom in or pick from the people at that spot.

Built with [MapLibre GL JS](https://maplibre.org/) (globe projection) on the free [OpenFreeMap](https://openfreemap.org/) basemap, React 19 + TypeScript + Vite. Datasets are generated from [Wikidata](https://www.wikidata.org/) — no backend, the whole site is static files.

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build (`app/dist/`) |
| `npm run preview` | serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm test` | validate every committed dataset against the schema |
| `npm run generate -- <view-id>` | regenerate a view from Wikidata (`--all` for everything) |
| `node tools/verify-m3.mjs out.png` | end-to-end browser verification (needs Chrome) |

> 📐 **Deep dive:** [docs/DESIGN.md](docs/DESIGN.md) — the full design & architecture document: every technology choice and its alternatives, implementation internals, the bugs that shaped the code, testing philosophy, and the roadmap.

## How it works

```
shared/     zod schemas — the data contract (ViewIndex, ViewManifest, ViewEntry)
generator/  Wikidata SPARQL → app/public/datasets/views/<id>/{manifest,points}.json
app/        React + MapLibre; fetches datasets at runtime, never imports them
```

**A view is data, not code.** The app discovers views from `datasets/index.json` at runtime. Adding a view:

1. Add `generator/view-configs/<id>.json` — occupation QIDs, a notability threshold (`minSitelinks`), title/emoji/color.
2. `npm run generate -- <id>` — queries Wikidata, writes the dataset, rebuilds `index.json`.
3. Refresh. The view appears in the switcher. No code changes.

(Hand-curated views work too: write `manifest.json` + `points.json` by hand and rerun the generator or add the index entry yourself — `npm test` validates both kinds.)

### The coincident-coordinates problem

Wikidata birthplaces resolve to city centroids, so e.g. nine famous scientists share the exact coordinates of Paris. Clusters that can't be separated by zooming open a "pick a person" popover instead; past the clustering zoom, a click that hits several stacked dots does the same.

## Deploying

Pushing to `main` deploys automatically to GitHub Pages via `.github/workflows/deploy.yml` (test → build → deploy). The Vite base is relative (`./`), so the same build works at the Pages subpath, a custom domain, or any other static host.

## Notes

- **Blank globe / "WebGL2 context" error in a remote-desktop session:** virtual displays (Chrome Remote Desktop, VNC) have no GPU, and Chrome ≥139 blocks software WebGL by default. Relaunch Chrome with `--enable-unsafe-swiftshader` (software rendering, works fine), or use Firefox, or open the app on a machine with GPU access.

- Node 18+ works today (Vite is pinned to v6 for that reason); `.nvmrc` points at Node 22 — after upgrading you can bump to Vite 7.
- The Wikidata generator sends a descriptive User-Agent (see `generator/src/sparql.ts` — update the contact address if you fork this) and backs off on 429s.
- Images are hotlinked from Wikimedia Commons as 400px thumbs, loaded one at a time when a card opens.

## Attribution

Map: © [OpenMapTiles](https://openmaptiles.org/) © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), tiles by [OpenFreeMap](https://openfreemap.org/). Data: [Wikidata](https://www.wikidata.org/) (CC0). Images: [Wikimedia Commons](https://commons.wikimedia.org/).

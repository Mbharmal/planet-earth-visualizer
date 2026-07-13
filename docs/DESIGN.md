# Planet Earth Visualizer — Design & Architecture

*A layered walkthrough of everything in this project: what it is, why each piece was chosen, how it works, the bugs that shaped it, and where it goes next. Written to be readable top-to-bottom by someone new to web/geo development — each layer goes one level deeper than the last. Terms of art are **bolded** on first use and defined in the [Glossary](#12-glossary).*

---

## Table of contents

1. [The macro view — what this is](#1-the-macro-view--what-this-is)
2. [The design forces — constraints that shaped everything](#2-the-design-forces--constraints-that-shaped-everything)
3. [Technology choices and the roads not taken](#3-technology-choices-and-the-roads-not-taken)
4. [The pieces and how they fit together](#4-the-pieces-and-how-they-fit-together)
5. [Software principles we followed](#5-software-principles-we-followed)
6. [The Hows — implementation deep dives](#6-the-hows--implementation-deep-dives)
7. [War stories — bugs that taught us things](#7-war-stories--bugs-that-taught-us-things)
8. [Testing & verification philosophy](#8-testing--verification-philosophy)
9. [Deployment — local and GitHub Pages](#9-deployment--local-and-github-pages)
10. [Licensing, attribution & etiquette](#10-licensing-attribution--etiquette)
11. [Extending the design — roadmap and recipes](#11-extending-the-design--roadmap-and-recipes)
12. [Glossary](#12-glossary)

---

## 1. The macro view — what this is

A website that renders an interactive 3D globe. Countries are labelled by default; cities appear as you zoom. On top of the globe sit **views** — thematic datasets of points (birthplaces of famous scientists, artists, chess players). Clicking a dot opens a card about the person. A timeline filters any view by era, "Life arcs" draws each person's birth→death path, and a cinematic **tour** flies the camera through the view's history figure by figure, with face cards and their most famous works.

The whole thing is **static files**: HTML, JavaScript, JSON. There is no server, no database, no API of our own. A CDN (GitHub Pages) hands the files to the browser and everything else happens client-side. The only external services touched at runtime are the map-tile provider (OpenFreeMap) and Wikimedia (person/work images).

### The one architectural idea that matters most

> **A view is data, not code.**

The app never imports a dataset. It *fetches* `datasets/index.json` at runtime, discovers which views exist, and fetches each view's `manifest.json` + `points.json` when selected. Adding a new view means adding JSON files — no code change, no rebuild of the JavaScript. Every feature since (era filter, arcs, tours) was designed to derive its behavior from the data, keeping that property intact.

### Macro data flow

```
 ┌───────────────┐   build time    ┌──────────────────────┐
 │   Wikidata    │  ──SPARQL──▶    │  generator (Node/TS)  │
 │ (SPARQL API)  │                 │  query → transform →  │
 └───────────────┘                 │  validate → write     │
                                   └──────────┬───────────┘
                                              ▼
                       app/public/datasets/…/{manifest,points}.json   (committed to git)
                                              │
              ── deploy (GitHub Actions → GitHub Pages CDN) ──
                                              │ runtime fetch
                                              ▼
 ┌───────────────┐                 ┌──────────────────────┐
 │  OpenFreeMap  │ ──vector tiles─▶│   React app + MapLibre│──▶ WebGL canvas (the globe)
 │ (basemap CDN) │                 │   (browser)           │
 └───────────────┘                 └──────────┬───────────┘
 ┌───────────────┐                            │ card opens
 │   Wikimedia   │ ◀──image thumbnails────────┘
 │    Commons    │
 └───────────────┘
```

Two clocks matter: **build time** (we run the generator by hand; its output is committed) and **runtime** (the browser fetches static JSON). Nothing computes on a server in between.

---

## 2. The design forces — constraints that shaped everything

Understanding *why* the architecture looks like this requires knowing what pressures produced it. Four forces did most of the work:

**Force 1 — $0/month.** A hobby project must cost nothing to leave running for years. This single constraint eliminated: our own tile server, any backend/database, paid map APIs (Mapbox), and image re-hosting. It *selected*: static hosting (GitHub Pages, free), a keyless free tile provider (OpenFreeMap), hotlinked Wikimedia thumbnails, and build-time data generation instead of live queries.

**Force 2 — one person maintains this.** Every dependency is a liability someone has to update. So: no state-management library (plain React state), no router (the URL hash), no CSS framework (CSS Modules are built into Vite), no math/formula library (native browser MathML), no test-runner in the app package (browser verification scripts instead). The `package.json` dependency list of the app is exactly four runtime packages.

**Force 3 — the data must scale editorially, not technically.** 400 points per view is technically trivial. The hard problem is *authorship*: nobody will hand-type 400 biographies. Wikidata solves this — it is a structured, machine-queryable database underlying Wikipedia where "give me all physicists with a birthplace, birth date, photo and notable works" is one query. The design bet: **generate first drafts from Wikidata; hand-curation is an override, never a requirement.**

**Force 4 — a future beyond the browser.** Android/iOS apps are a stated goal. This tipped several choices: MapLibre (it has native mobile SDKs sharing the same style/layer concepts), flat JSON datasets rather than GeoJSON as the storage format (portable to native code), and keeping all map logic in plain TypeScript modules rather than React-flavored code.

---

## 3. Technology choices and the roads not taken

Each table row is a decision: the candidates we weighed, what we picked, and the deciding argument.

### 3.1 The globe renderer — the decision that dominated everything

| Candidate | What it is | Why not / why yes |
|---|---|---|
| **MapLibre GL JS v5** ✅ | Open-source **vector-tile** map engine with a true `globe` projection | Country/city labels at the right zooms come *free* from the basemap; smooth zoom from space to street; native Android/iOS SDKs; no API key; first-class custom point/line layers |
| three.js / globe.gl | General 3D engine / a "cinematic globe" wrapper over it | Gorgeous at planetary scale (the GitHub homepage globe), but labels, zoom-to-city detail, and mobile would all be hand-built — we'd re-implement what map engines give away |
| CesiumJS | Full 3D geospatial engine (terrain, satellite imagery, time-dynamic data) | The most "real Earth," but the heaviest bundle and steepest API for what is, at heart, labeled dots with cards |
| Mapbox GL JS | MapLibre's commercial ancestor | Requires an access token and metered billing — violates Force 1 |

The killer detail: our #1 stated requirement ("countries labelled by default, cities appear as you zoom") is not a feature we built. It is *inherent* to any vector-tile basemap — label layers carry zoom ranges and the engine fades them in. Choosing the right substrate made a requirement disappear.

### 3.2 The basemap tiles

| Candidate | Why not / why yes |
|---|---|
| **OpenFreeMap** (`liberty` style) ✅ | No API key, no registration, no usage caps, production use explicitly allowed. Standard OpenMapTiles schema. Donation-funded (risk noted below) |
| MapTiler free tier | Needs a key, session-capped |
| Protomaps (self-hosted PMTiles) | Excellent tech, but we'd host a multi-GB file ourselves — cost and ops |

Risk management: the style URL lives in **one constant** (`app/src/config.ts` → `STYLE_URL`). If OpenFreeMap ever folds, we change one line to a MapTiler key or self-hosted PMTiles.

### 3.3 Application framework & language

| Candidate | Why not / why yes |
|---|---|
| **React 19 + TypeScript + Vite** ✅ | Biggest ecosystem; TypeScript keeps the data contract honest end-to-end; Vite needs zero config for our shape of app |
| Svelte | Genuinely attractive for a solo project (less boilerplate), smaller ecosystem for map UI patterns |
| Vanilla TS | MapLibre doesn't need React at all — but the surrounding UI (cards, switcher, timeline) accumulates state fast, and hand-rolled DOM code rots |

A nuance: we deliberately did **not** use `react-map-gl` (the popular React wrapper for MapLibre). Reasons: it lags MapLibre releases (globe support arrived late), and our interactions are inherently **imperative** — `flyTo`, cluster expansion, `queryRenderedFeatures` — which the declarative wrapper doesn't help with. Instead the boundary is one hook (`useMapLibre`) owning the map's lifecycle, and plain TS modules (`viewLayers.ts`, `interactions.ts`, `tour/*`) doing the map work. React renders the *chrome*; MapLibre renders the *world*.

Version pin nuance: system Node was 18 and Vite 7 requires ≥20.19, so Vite is pinned to `^6` (which officially supports Node 18). `.nvmrc` says `22` as the upgrade path.

### 3.4 Data validation

| Candidate | Why not / why yes |
|---|---|
| **zod v4** ✅ | One schema definition yields both the TypeScript types (via `z.infer`) and runtime validation. Used at *three* checkpoints: generator output, app runtime fetch, CI dataset tests |
| JSON Schema | Language-neutral, but needs codegen for TS types and a separate validator library; zod can *emit* JSON Schema later if ever needed |

### 3.5 Everything else, quickly

- **Styling: CSS Modules** — built into Vite, zero dependencies; Tailwind's payoff doesn't cover its setup for ~10 components floating over a fullscreen canvas.
- **State: plain `useState` in `App`** — `activeViewId`, `selectedId`, `eraRange`, `showArcs`; mirrored into the **URL hash** for shareable deep links. No Redux/Zustand/router; the app has one screen.
- **Formulas: native MathML** — Wikidata returns formulas as MathML markup, and Chrome/Firefox/Safari all render MathML natively now. We nearly reached for KaTeX (~100 KB + fonts) before discovering rendering was free.
- **Monorepo: npm workspaces** — three packages (`shared`, `generator`, `app`) in one repo with `shared` as the contract both sides import. No Turborepo/Nx; plain workspaces suffice at this scale.
- **Hosting: GitHub Pages + Actions** — free, wired to the repo, deploys on push. Cloudflare Pages was the runner-up (better caching, no subpath issue) and remains a fallback.

---

## 4. The pieces and how they fit together

One level down. The repo:

```
planet_earth_visualizer/
├── shared/          @pev/shared    — the data contract (zod schemas) + dataset tests
├── generator/       @pev/generator — Wikidata SPARQL → dataset JSON files
├── app/             @pev/app       — the website (React + MapLibre)
│   └── public/datasets/           — generated output, committed, served as-is
├── tools/                          — browser verification scripts (puppeteer)
└── .github/workflows/deploy.yml    — CI: test → build → deploy to Pages
```

### 4.1 `shared` — the contract everything obeys

Three schemas define the entire data model (`shared/src/schema.ts`):

- **`ViewIndex`** — `datasets/index.json`: the list of available views `{id, title, emoji, color, path}`. This is what makes views discoverable at runtime.
- **`ViewManifest`** — per view: identity (title, description, emoji, color), provenance (`source`, `generatedAt`, `count`), attribution text, optional point styling.
- **`ViewEntry`** — one point: `id` (Wikidata QID — the stable dedupe key), `name`, `lat/lng` (validated ±90/±180), optional `deathLat/deathLng` (arcs), optional `fame` (tour ranking), and a `card` (image, summary, birth/death, facts, `knownFor` work, links).

Design nuance: `points.json` is a **flat array of entries, not GeoJSON**. GeoJSON is what MapLibre consumes, but as a *storage* format it buries attributes inside `properties` and welds them to geometry. Flat entries are friendlier to future native apps and to human eyes; a 20-line adapter (`entriesToGeoJSON`) converts at the edge.

### 4.2 `generator` — the data factory

Modules, in pipeline order:

| Module | Job |
|---|---|
| `config.ts` | zod schema for per-view configs (`view-configs/*.json`: occupation QIDs, `minSitelinks` threshold, limit) |
| `sparql.ts` | Builds the main query; HTTP client with descriptive User-Agent, retry + exponential backoff honoring `Retry-After` |
| `transform.ts` | SPARQL result rows → `ViewEntry[]`: WKT coordinate parsing, date truncation, dedupe by QID, drop label-less entities |
| `works.ts` | Second-pass query: each person's notable works ranked by sitelinks → the single `knownFor` work (see §6.2) |
| `commons.ts` | Image URL normalization: Commons `Special:FilePath` URL + `?width=400` thumbnail variant |
| `writeView.ts` | zod-validate everything, write the view folder, **rebuild `index.json` by scanning the views directory** so the index can never drift from what exists |
| `cli.ts` | `npm run generate -- <view-id>` / `--all` |

### 4.3 `app` — the website

```
src/
├── config.ts            STYLE_URL, DATASETS_BASE (derived from Vite's base — see §9)
├── hash.ts              deep-link codec: #view=…&entry=…&era=from:to&arcs=1
├── map/
│   ├── useMapLibre.ts   map lifecycle: create, globe projection, atmosphere, WebGL preflight, error surfacing
│   ├── MapView.tsx      the one component owning the map's <div>
│   ├── viewLayers.ts    base layers: clustered dots, counts, labels, arc + glow lines
│   └── interactions.ts  hover/click wiring: select, cluster expansion, stacked-dot popover
├── data/
│   ├── useViewIndex.ts  fetch + validate index.json
│   ├── useViewData.ts   fetch + validate a view (state machine: idle/loading/ready/error)
│   ├── geojson.ts       entries → GeoJSON; entryYear() (BCE-aware year parsing)
│   └── arcs.ts          spherical math: bowed arcs, self-loops, angular distance
├── tour/
│   ├── roster.ts        pure functions: pick ~40 figures, build camera stops, palette
│   ├── tourEngine.ts    the state machine driving the cinematic tour (class, no React)
│   ├── tourLayers.ts    the tour's own map sources/layers (colored arcs, halo dots)
│   └── useTour.ts       thin React binding around the engine
└── components/          TitleBadge, ViewSwitcher, TimelineBar, InfoCard, TourCard,
                         ClusterList, ArcsToggle, LoadingOverlay  (each + module CSS)
```

`App.tsx` is the composition root: it owns all cross-cutting state, wires map ↔ data ↔ tour, and renders the overlay components. Everything below it is either a pure function, a self-contained component, or an imperative map module.

### 4.4 The map's layer stack

MapLibre renders layers in the order they were added (later = on top). Ours, bottom to top:

```
basemap (OpenFreeMap style: land, water, boundaries, road, country/city labels)
└─ view-arcs-glow      wide, blurred line   (Life arcs halo)
└─ view-arcs           crisp bowed line
└─ view-clusters       circles sized by member count
└─ view-cluster-count  the number inside each cluster
└─ view-points         individual dots (hover-reactive via feature-state)
└─ view-labels         person names (collision-managed, optional)
└─ tour-arcs-glow ┐
└─ tour-arcs      │   added only while a tour runs — always on top,
└─ tour-points-halo│  torn down on tour end
└─ tour-points    ┘
```

A structural rule falls out of this: **anything that re-adds base layers (switching views) must tear down tour layers first**, or the fresh base layers would stack above the tour. `App.switchView` cancels the tour synchronously before changing state.

---

## 5. Software principles we followed

Named, because they were used deliberately — not in hindsight.

1. **Open/closed via data (views-as-data).** The system is *open* to new views, *closed* to modification: extension happens purely by adding data files. This is the Open/Closed Principle applied at the content layer.
2. **Single source of truth.** The zod schema *is* the type system *is* the validator. There is exactly one definition of what a view looks like, and both producer and consumer import it. Likewise `index.json` is rebuilt from the filesystem, never edited independently.
3. **Validate at the boundaries.** Data is checked where it crosses trust lines: leaving the generator, entering the app, and in CI. Inside those boundaries, code trusts its types.
4. **Separate the imperative from the declarative.** React declaratively renders UI chrome; MapLibre is driven imperatively; the boundary is explicit (one hook + plain TS modules). The tour engine takes this further — it's a class with a `requestAnimationFrame` loop, *not* React effects, because interleaved animation/timers/camera callbacks modeled as effects become an unmaintainable cleanup dance.
5. **Pure logic, thin shell.** Roster selection, stop building, arc math, year parsing — all pure functions of their inputs, trivially testable, no framework in sight. The React layer is a thin adapter.
6. **State machines over booleans.** Data loading is `idle | loading | ready | error` (impossible states are unrepresentable). The tour is `idle | playing | paused` × phase `flying | revealing | dwelling`, advanced by a virtual clock.
7. **Fail visibly.** A corrupt dataset shows an error banner, not a blank screen. A browser without WebGL2 gets an explanatory panel with the fix, not silence. (Both of these were reactions to real incidents — see §7.)
8. **Verify behavior, not code.** Every feature was verified by driving a real browser against the running app — clicking dots, reading cards, counting rendered features — locally *and* on the deployed site. See §8.
9. **Be a polite API citizen.** Descriptive User-Agent, sequential queries, backoff on 429s, thumbnail-sized image requests, load-on-demand. See §10.

---

## 6. The Hows — implementation deep dives

### 6.1 The data pipeline, anatomically

The main SPARQL query (simplified shape):

```sparql
SELECT ?person ?personLabel ?personDescription ?sitelinks
       (SAMPLE(?coordRaw) AS ?coord) (SAMPLE(?img) AS ?image) …
WHERE {
  VALUES ?occ { wd:Q169470 wd:Q170790 wd:Q593644 }   # physicist, mathematician, chemist
  ?person wdt:P106 ?occ ;                             # occupation
          wdt:P19 ?birthplace ;                       # place of birth
          wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 45)                            # notability threshold
  ?birthplace wdt:P625 ?coordRaw .                    # coordinates of that place
  OPTIONAL { ?person wdt:P18 ?img }                   # portrait
  OPTIONAL { ?person wdt:P569 ?birthDate }            # + death date/place/coords, works, enwiki link
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?person ?personLabel ?personDescription ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT 400
```

Nuances that matter:

- **The sitelink filter must be *inside* the query.** Broad occupations (actor ≈ 100k+ people) hit the endpoint's 60-second timeout if you try to fetch-then-filter. Filtering by "number of Wikipedia language editions with an article" both bounds the query and *is* our fame metric.
- **`SAMPLE()` collapses multi-valued properties** (a person can have several recorded birth dates from different sources) so each person is one row.
- **P625 coordinates arrive as WKT: `Point(9.98 48.40)` — longitude first.** The #1 classic geo bug is swapping this. Our parser is explicit about the order.
- **Dates can be BCE**: `"-0287-01-01T00:00:00Z"` (Archimedes). Every year-parsing site uses a `^(-?\d+)` regex, never `parseInt` (which would stop at the second `-` and silently corrupt).
- **Entities without an English label** come back with their QID as the label ("Q123456"); we drop those rows.
- **Images are never downloaded.** We store the Commons `Special:FilePath` URL plus a `?width=400` variant that redirects to a server-rendered thumbnail. Storage cost: one URL string.

### 6.2 `knownFor` — why there are two queries

First attempt: add `SAMPLE(?workImage)` to the main query. Result: Leonardo's "most famous work" was an obscure sketch, Einstein's was a photo of laser pointers. `SAMPLE()` means *"pick one, any one."*

Fix: a **second-pass query** (chunks of 150 people per request) fetching *all* notable works with their own sitelink counts, then in code: sort by sitelinks, take the highest-ranked work that has an image or formula, else the most famous text-only. That's how Leonardo → *Mona Lisa* and Pythagoras → *Pythagorean theorem*.

Bonus discovery: Wikidata's "defining formula" (P2534) returns **MathML**, which browsers now render natively — so cards show genuinely typeset formulas with zero libraries. The generator sanitizes the markup (must start `<math`, no scripts/handlers/links, size cap) before committing it.

### 6.3 Rendering points: clustering and its trap

The view's GeoJSON source is created with `cluster: true, clusterRadius: 45, clusterMaxZoom: 11`. MapLibre (via supercluster) groups nearby points into cluster features with a `point_count`; our layer stack styles clusters, counts, dots, labels separately.

**The trap — coincident coordinates.** Wikidata birthplaces resolve to *city centroids*. Nine famous scientists were "born" at the exact same point in Paris. Consequences and fixes:

1. Zooming can never separate them, so a cluster of them is *irreducible*. On cluster click we ask `getClusterExpansionZoom`; if the answer exceeds `clusterMaxZoom`, we don't zoom — we fetch the members (`getClusterLeaves`) and open a "9 people · Paris — pick one" popover.
2. Past `clusterMaxZoom`, clustering turns off and they render as **stacked dots** — a click hits all of them at once (`e.features` has >1 entry), so the same popover opens from the click handler.

Labels: person-name labels use `text-optional: true` and a `minzoom`, so when they lose the collision fight against basemap city labels they *disappear* rather than fight — losing a label is fine; losing a dot never happens (dots are circles, which don't participate in symbol collision).

### 6.4 The era filter: why `setData`, not `setFilter`

MapLibre layers accept filters, and the obvious era-filter implementation is `map.setFilter(layer, ['>=', 'year', from])`. **This is wrong here**: filters apply per-layer *after* clustering, so cluster circles would still show counts that include filtered-out people — the map would lie.

Instead, era filtering **replaces the source data**: filter the entry array in JS, `source.setData(newGeoJSON)`. The source re-clusters, so counts are always true. For ~400 points this costs microseconds and is fast enough to animate (the tour advances the year continuously).

Corollary: entry years are computed once in the GeoJSON adapter (`entryYear` handles BCE), and the timeline's play button doesn't drive the map directly — it drives React state, and one effect owns the `setData`.

### 6.5 Arc math: staying on the sphere

Straight lines on maps are wrong twice: the shortest path between two points on a sphere is a **great circle** (it looks curved on a map), and even correct great circles look like straight ticks at short range. Our arcs:

1. Convert endpoints to 3D unit vectors on the sphere.
2. Find the great-circle midpoint; rotate it toward the circle's **poleward normal** by `δ = min(0.10, ω·0.22)` radians (ω = arc length) — a deliberate lateral "bow," capped so long arcs stay honest.
3. Sample a **spherical quadratic Bézier** through that control point (de Casteljau's algorithm, but each interpolation is a **slerp** — spherical linear interpolation — so every sample stays exactly on the sphere).
4. **Unwrap longitudes**: walking the samples, keep each longitude within ±180° of the previous (adding/subtracting 360) so a Tokyo→San Francisco arc doesn't zigzag across the entire map at the antimeridian. MapLibre happily renders out-of-range longitudes.

Self-loops (people who died where they were born — otherwise "no arc" is ambiguous with "no data") are a small circle *through* the person's point: take the point, define a circle center 85 km poleward, and rotate the point around that center's axis in 36 steps (Rodrigues' rotation formula). Starts and ends exactly at the dot.

Rendering: two line layers per arc set — a wide, blurred, low-opacity **glow** underneath a crisp line — with zoom-interpolated widths and opacity that *decreases* as you zoom in (more arcs visible per screen ⇒ fade them to keep the map readable).

### 6.6 The tour engine: a virtual clock, not React

The tour interleaves: camera flights (MapLibre's own animation), arc-draw animation (per-frame `setData`), timers (dwell), user interruptions (drag, click, spacebar), and speed changes. Modeling that as React effects would mean every pause/resume path threads through effect cleanups with stale-closure hazards. Instead:

- **`TourEngine` is a plain class** with one `requestAnimationFrame` loop and a **virtual clock**: `virtualMs += (now - lastReal) * speed`. Pause = stop accumulating. Speed change = the multiplier changes. Nothing else needs to know.
- **Phases per stop** — `flying → revealing → dwelling` — each with a duration budget on the virtual clock. Transitions compare `virtualMs` to the budget. Crucially, phase transitions **never listen to MapLibre's `moveend`**: that event also fires when an animation is interrupted (by `map.stop()` or a user drag), which would corrupt the sequence. The clock is the only truth; `flyTo` is issued with a duration matching the phase budget so camera and clock agree.
- **The React side** (`useTour`) holds the engine in a ref and mirrors its callbacks into state for rendering. The engine is single-use: every tour constructs a fresh one; `stop()` tears down layers, listeners and timers idempotently.

Camera choreography numbers: flight duration `clamp(1800 + distanceKm/8, 1800, 3200)` ms (regional hops ~2 s, transcontinental ~3 s), `curve: 1.25` (gentler zoom-out arc than the default), bearing/pitch pinned to 0, and targets' longitudes unwrapped so the camera never flies the long way around. `prefers-reduced-motion` users get MapLibre's automatic snap-instead-of-fly, and the virtual clock keeps the tour coherent regardless.

Stops are built by pure functions: `selectRoster` (fame-sorted greedy pick with a cap of 6 per 15°×15° grid bucket, so Europe leads but can't monopolize; second pass ignores caps for sparse views), then `buildTourStops` (chronological sweep merging figures born within 5 years *and* 500 km, max 3 per stop, centroid computed with longitude unwrapping).

Colors: each stop cycles a 6-hue palette — validated with a color-vision-deficiency checker against the actual basemap surface (worst adjacent-pair ΔE 37.7; the sub-contrast hues are "relieved" by white dot strokes and the named face card). The palette deliberately contains no blue, because blue is the scientists view's identity color.

### 6.7 Deep links & interaction routing

The URL hash is the only router: `#view=scientists&entry=Q937&era=1600:1750&arcs=1`. Written with `history.replaceState` (no history spam), parsed on load and on `hashchange` (which also makes back/forward work). The era separator is `:` because years can be negative. The tour is deliberately **not** deep-linkable (transient state; the era param is even suppressed while touring so a copied URL doesn't freeze a random moment).

During a tour, input routing changes: base dot/cluster clicks are gated off (a canvas click means pause/toggle, not "select this dot and fly to it" — which would fight the tour's camera), the InfoCard drawer and static arcs are hidden (they compete with tour visuals), and the pre-tour era/arcs state is snapshotted and restored on exit.

---

## 7. War stories — bugs that taught us things

The most instructive part of the project. Each: symptom → cause → lesson.

**7.1 The invisible map.** First render: a completely blank page. The map container `<div>` had `position: absolute; inset: 0` — but MapLibre's own stylesheet forces `.maplibregl-map { position: relative }`, which overrode ours, and a relative div with no explicit height collapses to **0 pixels tall**. The canvas existed — 1280×300 (MapLibre's fallback) inside a 0-height parent. *Fix:* explicit `width/height: 100%`. *Lesson:* when two stylesheets disagree, later-loaded wins at equal specificity; and debugging "nothing renders" starts with measuring the container, not reading code.

**7.2 The cluster that wouldn't open.** (§6.3.) Nine people at one exact point can never be separated by zoom. *Lesson:* know your data's failure modes — "coordinates" from a knowledge base are centroids, not addresses. UX must handle identity, not just proximity — and in **two** code paths (irreducible clusters *and* stacked dots past clusterMaxZoom).

**7.3 The deep link that didn't.** Tests navigating from `#view=a` to `#view=b` passed a fresh page load but failed in-session. Changing only the hash is a *same-document navigation* — no reload, no module re-evaluation — and we had no `hashchange` listener. *Fix:* listen for it (which was needed for back/forward support anyway). *Lesson:* a failing test that "should obviously pass" is usually testing a different scenario than you think.

**7.4 `SAMPLE()` picks garbage.** (§6.2.) *Lesson:* aggregate functions in query languages satisfy the query, not your intent. When "any one" isn't acceptable, rank explicitly.

**7.5 The drag that un-paused itself.** Dragging the map paused the tour — then it un-paused ~300 ms later. Diagnosis (by recording map events with timestamps): MapLibre emits a trailing **`click` after every drag gesture**, with environment-dependent lag, sometimes even before `dragend` — and our canvas-click-to-toggle handler treated it as a user click. A time-window suppression failed (the lag exceeded any reasonable window). *Fix:* swallow exactly **one** click after each `dragend` (with a 1 s expiry). *Lesson:* browser event streams around gestures are messier than documentation implies; when timing is unpredictable, count events instead of timing them.

**7.6 The blank page that wasn't our bug.** The site worked in every test but showed nothing on the developer's own screen. Cause: the machine is accessed via **Chrome Remote Desktop**, whose virtual display has no GPU, and Chrome ≥139 refuses to fall back to software WebGL silently. The map constructor threw inside a React effect, unmounting the entire tree — blank page, no message. *Fixes:* (a) a WebGL2 preflight check that renders an explanatory panel instead of dying, (b) surfacing basemap-fetch failures instead of an infinite spinner, (c) for the dev environment: `google-chrome --enable-unsafe-swiftshader`. *Lesson:* your environment is part of your system; fail loudly with a diagnosis, because "blank" is the most expensive symptom to debug remotely.

**7.7 The label that lied about years.** BCE dates like `-0287-01-01` break naive parsing (`parseInt` stops at the second hyphen). All year extraction goes through one regex helper. *Lesson:* centralize parsing of any format with edge cases; the second implementation *will* forget the edge case.

**7.8 The deploy that couldn't.** First deployment failed twice: the repo was private (GitHub Pages needs public on the free plan — diagnosed externally by anonymous API calls returning 404), then the workflow lacked permission to enable Pages (one manual Settings toggle). *Lesson:* platform failures are often *permissions and product-tier* issues, not code; check those before re-reading YAML.

**7.9 The subpath that 404'd everything (almost).** Project pages serve at `/repo-name/`, and the app assumed it lived at `/` in three places (Vite base, dataset fetch root, favicon). Caught *before* deploying by simulating: symlink the build into a subdirectory, serve it, and browser-test against `http://localhost/planet-earth-visualizer/`. *Fix:* relative base (`./`) + `DATASETS_BASE` derived from `import.meta.env.BASE_URL`. *Lesson:* deployment differences are testable locally — simulate the target topology instead of deploying to find out.

---

## 8. Testing & verification philosophy

A WebGL map app is nearly untestable by classic unit tests: the interesting failures are "the dot didn't render," "the click hit the wrong layer," "the camera flew the long way around" — none visible to a function-level test. So the strategy has three tiers:

**Tier 1 — data tests (vitest, in `shared/`).** Every committed dataset is validated against the schema: parseable, unique IDs, lat/lng in range, manifest counts match, ≥70% images / ≥95% fame coverage, and `index.json` exactly matches the folders on disk. These run in CI on every push, so a bad generator run cannot deploy.

**Tier 2 — browser verification (`tools/verify-*.mjs`).** Puppeteer drives the real app in headless Chrome (`--enable-unsafe-swiftshader` provides software WebGL). These scripts *act like a user and assert on outcomes*: project a city's coordinates to screen pixels and click the dot; assert the card names Einstein and his photo actually loaded; count rendered features before/after an era filter; drag the canvas and assert the tour paused; press space and assert it resumed. The dev server exposes `window.__map` (dev builds only) so scripts can query the map's internal state. Test fixtures (a two-people-same-coordinates view; a deliberately corrupt view) are installed into the datasets folder before the run and removed after — the repo stays clean, and the suite is self-contained and rerunnable.

**Tier 3 — live-site verification.** After every deploy, the same style of script runs against the *production URL* (no `__map` there, so it drives the DOM exactly like a visitor). This has repeatedly caught classes of problems local testing can't: base-path regressions, CDN propagation, third-party fetch behavior from the public origin.

Supporting habit: every feature landed with a screenshot from headless Chrome, visually inspected — the palette validator can prove colors are distinguishable, but only eyes catch "the arcs are spaghetti at zoom 5, fade them."

---

## 9. Deployment — local and GitHub Pages

### Local

```sh
npm install          # one install for all three workspaces
npm run dev          # Vite dev server (default http://localhost:5173)
npm test             # dataset validation (vitest, in shared/)
npm run typecheck    # tsc across all workspaces
npm run generate -- --all    # regenerate datasets from Wikidata (network)
npm run build && npm run preview   # production build + local serving of it
node tools/verify-tour.mjs   # browser verification (needs Chrome; dev server running)
```

Dev-environment quirk: on a remote-desktop session (no GPU), Chrome needs `--enable-unsafe-swiftshader` to create a WebGL context (§7.6).

### The pipeline

`.github/workflows/deploy.yml`, on every push to `main`:

```
checkout → Node 22 + npm cache → npm ci → npm test → npm run build
→ upload app/dist as a Pages artifact → deploy-pages
```

Notes and nuances:

- **Tests gate the deploy.** A schema-violating dataset stops the pipeline before the build.
- CI uses Node 22 (fine — Vite 6 supports 18 *and* 22); local dev on Node 18 works identically.
- One-time repo setup that code cannot do: the repo must be **public** (free-tier Pages) and *Settings → Pages → Source* must be set to **"GitHub Actions"**.
- **The subpath problem** (§7.9): Pages serves at `https://user.github.io/repo/`. Vite's `base: './'` makes all asset URLs relative, and `DATASETS_BASE = import.meta.env.BASE_URL + 'datasets'` makes data fetches subpath-safe. The same build therefore works at the Pages subpath, on a custom domain, or any static host — unchanged.
- Deploys are monitored via the public GitHub API (poll the workflow run for the pushed SHA until `completed`), then Tier-3 verification runs against the live URL.
- **Datasets are committed, not built in CI.** Deliberate: CI stays fast and deterministic, Wikidata isn't hammered on every push, and every dataset change is reviewable in a diff. The cost — data freshness requires a manual `generate` + commit — is right for content that changes on human timescales.

---

## 10. Licensing, attribution & etiquette

The invisible layer that shaped real decisions:

- **Wikidata is CC0** (public domain) — our generated datasets inherit no restrictions, but we credit it anyway in every view manifest.
- **Map data** is © OpenStreetMap contributors under ODbL, styled via OpenMapTiles, served by OpenFreeMap — MapLibre's attribution control displays all of this, plus our per-view attribution line, permanently in the corner. Removing it would violate the licenses.
- **Wikimedia Commons images** are hotlinked as 400-px server-rendered thumbnails, loaded only when a card opens — one image at a time. Commons permits hotlinking, but bulk/automated fetching is discouraged; our per-card pattern stays comfortably polite. (If policy ever tightens, the fallback is downloading thumbs at generation time — with the licensing bookkeeping that entails.)
- **Wikimedia's User-Agent policy** requires automated clients to identify themselves with contact info. The generator sends `PlanetEarthVisualizer/0.1 (repo URL)` — the repo URL rather than a personal email, a deliberate privacy choice when the repo went public. Queries run sequentially with exponential backoff honoring `Retry-After`.
- **OpenFreeMap** explicitly allows production use with no key or cap; it is donation-funded, which is why the style URL is one swappable constant.

---

## 11. Extending the design — roadmap and recipes

### Recipe: add a new person view (the 10-minute version)

1. Create `generator/view-configs/composers.json`:
   ```json
   {
     "id": "composers", "title": "Composers", "emoji": "🎼", "color": "#c2571f",
     "description": "Birthplaces of famous composers around the world.",
     "occupations": ["Q36834"], "minSitelinks": 40, "limit": 400
   }
   ```
   (Find occupation QIDs by searching wikidata.org; watch huge ones like actor — raise `minSitelinks` to stay under the query timeout.)
2. `npm run generate -- composers` — writes the dataset, rebuilds `index.json`.
3. Refresh. The view is in the switcher, with era filter, arcs, and tour — all derived from data. Commit, push, deployed.

Everything else — hand-curated views (write the JSON by hand; `npm test` validates it), styling tweaks (per-view `pointStyle` in the manifest) — flows through the same contract.

### The roadmap (tracked as tasks)

**Shipped since this doc was first written:**

*WW2 Battles + Stories* — first events view (`kind: 'events'` in manifest/config: class-family + date-window SPARQL selection, after part-of chain climbing proved unreliable — see the war-stories section); date labels adapt (Began/Ended); journeys generalized into *stories* (`person`→`subject`, role enum→free-text labels) with three hand-written WW2 stories (Stalingrad, D-Day→Berlin, Pacific) alongside Euler.

*Journeys* — guided multi-waypoint life stories as a second dataset kind (`datasets/journeys/<id>.json`, discovered via the same index). Manual-first player (`app/src/journey/`): Next/Prev/arrow keys, optional autoplay, animated bowed path segments with visited/future styling, numbered waypoint dots, camera padded around a reading panel carrying narratives, Commons images, native-MathML formulas, works chips and further-reading links. Deep links `#journey=euler&wp=3`. Authoring guide: `docs/ADDING_A_JOURNEY.md`. Euler is the flagship/template. Wikidata-drafted journeys (P69/P108/P551) remain future generator-assist work.

| Feature | Design sketch |
|---|---|
| **Events views** (WW2 battles) | First non-person view: battles have coordinates (P625), dates (P585), part-of (P361). Combined with the era scrubber, the war unfolds across the globe. Dated points only — no front-line polygons (Wikidata doesn't have them) |
| **Story mode** | Curated scrollytelling tours ("The Quantum Revolution") — pure data files sequencing camera moves + cards; the tour engine already provides every primitive |
| **Intellectual lineages** | Advisor→student arcs (P184/P802) — the mathematics genealogy drawn on the globe over time |
| **Search** | Client-side index over all views' names; select → switch view + flyTo + card |
| **"Born near you"** | Geolocation (permission-gated) → fly to the visitor's region, highlight neighbors |
| **Guess-the-globe game** | "Where was Ramanujan born?" — click, score by great-circle distance; all data present |
| **Heatmap mode** | MapLibre heatmap layer as an alternative render mode per view |
| **More views** | Actors, writers, Nobel laureates — each a config file |
| **Native apps** | The long game: MapLibre Native + the same flat JSON datasets fetched from the deployed site |

### Known debts and accepted risks

- **Occupation-tag bleed**: Wikidata's occupations put Margaret Thatcher (chemist by degree) and Pope Leo XIV (mathematician) among the scientists. Technically correct, occasionally funny; tightening means occupation-list curation or exclusion rules in configs.
- **Tile-provider dependency**: OpenFreeMap has no SLA. One-constant swap if needed.
- **Clustering runs in Mercator space**, so clusters near the poles/antimeridian can split oddly — cosmetic, accepted.
- **Bundle size**: maplibre-gl is ~230 KB gzipped of our ~370 KB total — inherent to the choice, acceptable for the product.
- **No i18n**: everything is English (labels requested as `en` from Wikidata). A future `lang` parameter in the generator is the natural seam.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **Vector tiles** | Map data shipped as compact geometric shapes + attributes (not images), styled and rendered client-side on the GPU — enables smooth zoom, rotation, restyling, and label collision |
| **Basemap** | The underlying world map (land, water, borders, roads, place labels) on which app data is drawn |
| **Style (MapLibre)** | A JSON document telling the engine what to draw and how — sources, layers, colors, fonts, zoom behaviors |
| **Layer / Source (MapLibre)** | A *source* is data (tiles, GeoJSON); a *layer* is one way of drawing a source (circles, lines, symbols) with paint/layout rules |
| **GeoJSON** | Standard JSON format for geographic features (points/lines/polygons + properties). Coordinates are `[longitude, latitude]` — in that order |
| **WebGL / WebGL2** | The browser's GPU-accelerated graphics API; what MapLibre renders with. No WebGL ⇒ no map |
| **Projection / globe projection** | How the round Earth maps to the screen. Classic web maps use Mercator (flat); we render an actual sphere |
| **Clustering / supercluster** | Grouping nearby points into aggregate circles with counts at low zoom, so 400 dots don't overplot |
| **Great circle** | The shortest path between two points on a sphere — appears curved on maps; what flight paths follow |
| **Slerp** | Spherical linear interpolation — moving between two points along the sphere's surface at constant speed |
| **Bézier / de Casteljau** | A curve defined by control points / the algorithm that evaluates it by repeated interpolation — ours runs on the sphere via slerps |
| **Antimeridian** | The ±180° longitude line (mid-Pacific) where coordinates wrap — the classic source of lines zigzagging across the whole map |
| **WKT** | "Well-Known Text," e.g. `Point(lng lat)` — how Wikidata serializes coordinates |
| **SPARQL** | The query language for knowledge graphs like Wikidata — SQL-ish, but matching graph patterns (`?person wdt:P106 ?occupation`) |
| **QID / P-number** | Wikidata identifiers: Q-numbers are entities (Q937 = Einstein), P-numbers are properties (P19 = place of birth) |
| **Sitelinks** | The count of Wikipedia language editions with an article about an entity — our proxy for fame |
| **MathML** | Markup language for mathematical notation, rendered natively by modern browsers |
| **zod** | A TypeScript library where one schema definition provides both static types and runtime validation |
| **npm workspaces** | Several packages in one repo sharing a lockfile and node_modules, able to depend on each other locally |
| **URL hash** | The `#…` part of a URL — changeable without a page reload, invisible to servers; our entire "router" |
| **CI/CD** | Continuous Integration/Deployment — automation that tests and ships on every push (GitHub Actions here) |
| **CDN** | Content Delivery Network — globally distributed static-file servers (GitHub Pages, OpenFreeMap, Wikimedia all are) |
| **Headless browser** | A real browser running without a visible window, scriptable (Puppeteer + Chrome) — our verification harness |
| **SwiftShader** | Chrome's software (CPU) implementation of the GPU APIs — how we run WebGL in headless CI and GPU-less remote desktops |
| **CVD / ΔE** | Color-vision deficiency; ΔE is a perceptual color-difference measure — our palette is validated so adjacent hues stay distinguishable under CVD |

---

*Document reflects the state of the project as of 2026-07-12 (commit history: M0 scaffold through Tour v2 interactions). It should be updated when the architecture changes — particularly §4 (pieces), §11 (roadmap), and any new war stories, which are the sections that rot fastest.*

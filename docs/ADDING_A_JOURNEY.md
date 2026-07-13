# Adding a journey

A journey is a guided, chapter-by-chapter life story on the globe. **It is pure data** — adding one requires no code. Use `app/public/datasets/journeys/euler.json` as the living template; this guide explains every field.

## The 3-step recipe

1. Write `app/public/datasets/journeys/<id>.json` (structure below).
2. Add its summary to the `journeys` array in `app/public/datasets/index.json` — or run `npm run generate -- <any-view>`, which rebuilds the index by scanning the folders.
3. `npm test` validates it; refresh the app and it appears under the 🧭 Journeys chip. Commit + push = deployed.

## The journey file, field by field

```jsonc
{
  "id": "euler",                       // lowercase slug; becomes the deep link (#journey=euler)
  "title": "Leonhard Euler — the wandering mathematician",
  "person": {
    "name": "Leonhard Euler",
    "lifespan": "1707 – 1783",         // free text, shown under the name
    "image": { "url": "…", "thumbUrl": "…", "caption": "…" },   // portrait (see Images below)
    "wikidata": "https://www.wikidata.org/wiki/Q7604"
  },
  "summary": "One paragraph hook for the whole journey.",
  "color": "#4a3aa7",                  // path + accents; pick something distinct from view colors
  "waypoints": [ /* 2+ chapters, chronological — see below */ ],
  "resources": [ { "label": "…", "url": "…" } ],   // further reading, shown on the last chapter
  "attribution": "Content compiled from …"
}
```

### A waypoint (chapter)

```jsonc
{
  "id": "petersburg-1",                // slug, unique within the journey
  "title": "St. Petersburg: the Basel problem falls",   // chapter headline
  "place": "St. Petersburg, Russia",
  "lat": 59.9398, "lng": 30.3146,      // decimal degrees; negative = S / W
  "from": 1727, "to": 1741,            // year span (omit "to" for a single-year event; negative = BCE)
  "role": "work",                      // birth | education | work | residence | voyage | death
  "narrative": "A paragraph or two telling this chapter…",
  "media": {                           // all optional; image and formula can coexist
    "image": { "url": "…", "thumbUrl": "…", "caption": "…" },
    "formula": "<math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\">…</math>",
    "formulaCaption": "What the formula says, in words"
  },
  "works": ["Mechanica (1736)", "…"],          // up to 8 chips
  "resources": [ { "label": "…", "url": "…" } ] // up to 6 per chapter
}
```

## Content guidelines (what made Euler work)

- **One idea per chapter.** Each waypoint should answer: what happened *here*, and why does it matter? Aim for 80–150 words of narrative.
- **Chronological order is enforced** by the tests (waypoints must be sorted by `from`).
- **Same city twice is fine** (Euler returns to St. Petersburg) — offset the coordinates slightly (a few hundredths of a degree, e.g. two different landmarks) so the numbered dots don't overlap perfectly.
- **Cite everything.** Every factual claim in a narrative should be traceable through the chapter's `resources`. Wikipedia + a specialist source (MacTutor for mathematicians) is a good floor.
- **Coordinates**: right-click → "What's here?" on any web map, or take them from the place's Wikipedia page.

## Images

Use Wikimedia Commons. For a file named `Konigsberg bridges.png`:

- `url`: `https://commons.wikimedia.org/wiki/Special:FilePath/Konigsberg%20bridges.png`
- `thumbUrl`: same + `?width=400`

**Always verify the file exists** before committing (a 404 image is worse than none):

```sh
curl -s -o /dev/null -w "%{http_code}" -L "https://commons.wikimedia.org/wiki/Special:FilePath/Konigsberg%20bridges.png?width=400"
# want: 200
```

## Formulas (MathML)

Browsers render MathML natively — no libraries. Write presentation MathML with `display="block"`. Building blocks: `<mi>` identifiers, `<mn>` numbers, `<mo>` operators, `<msup>` powers, `<mfrac>` fractions, `<munderover>` for sums. Euler's identity as a worked example:

```xml
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mrow>
    <msup><mi>e</mi><mrow><mi>i</mi><mi>π</mi></mrow></msup>
    <mo>+</mo><mn>1</mn><mo>=</mo><mn>0</mn>
  </mrow>
</math>
```

Tip: Wikipedia renders its equations as MathML — inspect-element on any equation and copy the `<math>` node, then strip `<semantics>`/`<annotation>` wrappers. The schema requires the string to start with `<math` and stay under 4000 characters; keep it to pure presentation markup (no scripts, links, or event attributes — validation and code review both watch for this).

## Verifying your journey

```sh
npm test                          # schema + index-consistency + chronology checks
npm run dev                       # then: 🧭 Journeys → your journey
node tools/verify-journey.mjs     # automated browser walkthrough (Euler-specific asserts,
                                  # but the layer/navigation checks exercise any journey)
```

Deep links: `#journey=<id>&wp=<n>` opens chapter *n* directly — test yours before sharing.

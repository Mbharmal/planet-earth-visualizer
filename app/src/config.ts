/** Basemap style. OpenFreeMap: free, no API key, production use allowed.
 *  Swappable fallbacks: MapTiler (free key) or self-hosted Protomaps PMTiles. */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Root the app fetches view datasets from. Derived from Vite's base so it
 *  resolves correctly whether the site is served at / or a subpath (GitHub Pages). */
export const DATASETS_BASE = `${import.meta.env.BASE_URL}datasets`

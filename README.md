# SoraTomo 空友

AR aircraft spotting companion. Point your phone at the sky to identify aircraft in real time, collect rare finds, and compete on a daily regional leaderboard.

Live: [soratomo.netlify.app](https://soratomo.netlify.app)

## Stack

- **React 19** + **Vite 8** (PWA via `vite-plugin-pwa`)
- **Netlify** — static hosting + serverless functions (ADS-B proxy, leaderboard)
- **Firebase Firestore** — leaderboard storage (via REST, no SDK)
- **geomagnetism** — WMM magnetic declination correction
- **Leaflet** — logbook map (loaded from CDN)

## Architecture

| Path | Purpose |
|------|---------|
| `src/App.jsx` | Main application — AR overlay, radar, calibration, scoring, panels |
| `src/rarity.js` | Aircraft rarity engine (global scarcity + personal novelty) |
| `src/idb.js` | IndexedDB photo gallery store |
| `src/firebase.js` | Leaderboard client (talks to Netlify proxy) |
| `netlify/functions/adsb.mjs` | adsb.lol proxy w/ coordinate bucketing + cache |
| `netlify/functions/airplanes.mjs` | airplanes.live proxy (secondary source) |
| `netlify/functions/adsbdb.mjs` | Aircraft registration lookup |
| `netlify/functions/leaderboard.mjs` | Score submit/fetch + server-side callsign validation |

## Data sources

- **adsb.lol** + **airplanes.live** — dual ADS-B feeds, merged by lowest position age
- **adsbdb.com** — registration/type enrichment by ICAO hex

## Environment variables (Netlify)

```
VITE_FIREBASE_API_KEY       # Firestore REST key
VITE_FIREBASE_PROJECT_ID    # Firestore project
```

Both must be set with `SECRETS_SCAN_OMIT_KEYS` and `SECRETS_SCAN_SMART_DETECTION_ENABLED=false`
so Netlify's secret scanner allows the public Firebase web key in the bundle.

## Development

```bash
npm install
npm run dev      # local dev server (HTTPS via basic-ssl for camera/GPS)
npm run build    # production build
npm run lint     # eslint
```

Camera and GPS require HTTPS — the dev server uses a self-signed cert.

## Real-world testing

Primary test site is ~2 nm from DCA (Reagan National) with a clear runway sightline.

## Disclaimer

Not for aviation use. A recreational/educational tool only — not certified for
navigation, separation, collision avoidance, or any operational purpose.
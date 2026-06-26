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

### Optional: restrict CORS (post-launch)

```
ALLOWED_ORIGIN   # comma-separated allow-list; unset = open ('*')
```

Leave unset while testing / before the native wrapper exists. To lock down, set e.g.
`https://soratomo.app,https://www.soratomo.app,capacitor://localhost,http://localhost:5173`.
All four functions read this one var — no code changes needed.

## Leaderboard 90-day retention (REQUIRED for privacy-policy accuracy)

The privacy policy states leaderboard entries are auto-deleted 90 days after the last
submission. The function writes an `expireAt` Firestore **timestamp** on every score
(now + 90 days, refreshed each submit). For Firestore to actually delete on that date,
you must enable the native TTL policy **once** in the Firebase console:

1. Firebase console → Firestore Database → **TTL** tab
2. **Create policy** → Collection group: `scores_daily`, Timestamp field: `expireAt`
3. Save. Firestore then deletes each document within ~24–72h after its `expireAt`.

Until this policy is enabled, the `expireAt` field is written but nothing acts on it —
so the data is *not* auto-deleted and the privacy claim is not yet truthful. **Enable
the TTL policy before launch.**

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
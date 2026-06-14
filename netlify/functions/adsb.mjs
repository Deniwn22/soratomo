5:03:43 PM: Netlify Build                                                 
5:03:43 PM: ────────────────────────────────────────────────────────────────
5:03:43 PM: ​
5:03:43 PM: ❯ Version
5:03:43 PM:   @netlify/build 35.15.0
5:03:43 PM: ​
5:03:43 PM: ❯ Flags
5:03:43 PM:   accountId: 6a07b201a10c9bfe02e896e1
5:03:43 PM:   baseRelDir: true
5:03:43 PM:   buildId: 6a2f1724f18f7f00081dd1e9
5:03:43 PM:   deployId: 6a2f1724f18f7f00081dd1eb
5:03:43 PM: ​
5:03:43 PM: ❯ Current directory
5:03:43 PM:   /opt/build/repo
5:03:43 PM: ​
5:03:43 PM: ❯ Config file
5:03:43 PM:   /opt/build/repo/netlify.toml
5:03:43 PM: ​
5:03:43 PM: ❯ Context
5:03:43 PM:   production
5:03:43 PM: ​
5:03:43 PM: build.command from netlify.toml                               
5:03:43 PM: ────────────────────────────────────────────────────────────────
5:03:43 PM: ​
5:03:43 PM: $ npm run build
5:03:43 PM: > soratomo@1.0.0 build
5:03:43 PM: > vite build
5:03:44 PM: vite v8.0.14 building client environment for production...
5:03:44 PM: 
5:03:44 PM: transforming...✓ 32 modules transformed.
5:03:44 PM: rendering chunks...
5:03:44 PM: computing gzip size...
5:03:44 PM: dist/registerSW.js                0.13 kB
5:03:44 PM: dist/manifest.webmanifest         0.92 kB
5:03:44 PM: dist/index.html                   1.71 kB │ gzip:   0.81 kB
5:03:44 PM: dist/assets/index-CQ4XyfwI.css    0.13 kB │ gzip:   0.13 kB
5:03:44 PM: dist/assets/index-Bqjf-WUG.js   436.12 kB │ gzip: 129.01 kB
5:03:44 PM: ✓ built in 303ms
5:03:47 PM: PWA v1.3.0
5:03:47 PM: mode      generateSW
5:03:47 PM: precache  13 entries (636.14 KiB)
5:03:47 PM: files generated
5:03:47 PM:   dist/sw.js
5:03:47 PM:   dist/workbox-33a84d7e.js
5:03:47 PM: ​
5:03:47 PM: (build.command completed in 3.2s)
5:03:47 PM: ​
5:03:47 PM: Functions bundling                                            
5:03:47 PM: ────────────────────────────────────────────────────────────────
5:03:47 PM: ​
5:03:47 PM: Packaging Functions from netlify/functions directory:
5:03:47 PM:  - adsb.mjs
5:03:47 PM:  - adsbdb.mjs
5:03:47 PM:  - airplanes.mjs
5:03:47 PM:  - leaderboard.mjs
5:03:47 PM: ​
5:03:47 PM: ✘ [ERROR] The JSX syntax extension is not currently enabled
5:03:47 PM:     netlify/functions/adsb.mjs:115:2:
5:03:47 PM:       115 │   <g>
5:03:47 PM:           ╵   ^
5:03:47 PM:   The esbuild loader for this file is currently set to "js" but it must be set to "jsx" to be able to parse JSX syntax. You can use "loader: { '.js': 'jsx' }" to do that.
5:03:47 PM: ✘ [ERROR] The JSX syntax extension is not currently enabled
5:03:47 PM:     netlify/functions/airplanes.mjs:115:2:
5:03:47 PM:       115 │   <g>
5:03:47 PM:           ╵   ^
5:03:47 PM:   The esbuild loader for this file is currently set to "js" but it must be set to "jsx" to be able to parse JSX syntax. You can use "loader: { '.js': 'jsx' }" to do that.
5:03:47 PM: ✘ [ERROR] Could not resolve "leaflet/dist/leaflet.css"
5:03:47 PM:     netlify/functions/adsb.mjs:3:7:
5:03:47 PM:       3 │ import "leaflet/dist/leaflet.css"; // Bundled Leaflet styles — re...
5:03:47 PM:         ╵        ~~~~~~~~~~~~~~~~~~~~~~~~~~
5:03:47 PM:   You can mark the path "leaflet/dist/leaflet.css" as external to exclude it from the bundle, which will remove this error and leave the unresolved path in the bundle.
5:03:47 PM: ✘ [ERROR] Could not resolve "./firebase"
5:03:47 PM:     netlify/functions/adsb.mjs:4:46:
5:03:47 PM:       4 │ ..., fetchLeaderboard } from './firebase'; // Firestore REST leader...
5:03:47 PM:         ╵                              ~~~~~~~~~~~~
5:03:47 PM: ✘ [ERROR] Could not resolve "leaflet/dist/leaflet.css"
5:03:47 PM:     netlify/functions/airplanes.mjs:3:7:
5:03:47 PM:       3 │ import "leaflet/dist/leaflet.css"; // Bundled Leaflet styles — re...
5:03:47 PM:         ╵        ~~~~~~~~~~~~~~~~~~~~~~~~~~
5:03:47 PM:   You can mark the path "leaflet/dist/leaflet.css" as external to exclude it from the bundle, which will remove this error and leave the unresolved path in the bundle.
5:03:47 PM: ✘ [ERROR] Could not resolve "./rarity.js"
5:03:47 PM:     netlify/functions/adsb.mjs:5:71:
5:03:47 PM:       5 │ ...RITY, CAT_RARITY, globalRarity, computeRarity } from './rarity.js';
5:03:47 PM:         ╵                                                         ~~~~~~~~~~~~~
5:03:47 PM: ✘ [ERROR] Could not resolve "./firebase"
5:03:47 PM:     netlify/functions/airplanes.mjs:4:46:
5:03:47 PM:       4 │ ..., fetchLeaderboard } from './firebase'; // Firestore REST leader...
5:03:47 PM:         ╵                              ~~~~~~~~~~~~
5:03:47 PM: ✘ [ERROR] Could not resolve "./rarity.js"
5:03:47 PM:     netlify/functions/airplanes.mjs:5:71:
5:03:47 PM:       5 │ ...RITY, CAT_RARITY, globalRarity, computeRarity } from './rarity.js';
5:03:47 PM:         ╵                                                         ~~~~~~~~~~~~~
5:03:47 PM: ✘ [ERROR] Could not resolve "./idb.js"
5:03:47 PM:     netlify/functions/adsb.mjs:6:80:
5:03:47 PM:       6 │ ... saveGalleryIDB, deletePhotoIDB, clearGalleryIDB } from './idb.js';
5:03:47 PM:         ╵                                                            ~~~~~~~~~~
5:03:47 PM: ✘ [ERROR] Could not resolve "./idb.js"
5:03:47 PM:     netlify/functions/airplanes.mjs:6:80:
5:03:47 PM:       6 │ ... saveGalleryIDB, deletePhotoIDB, clearGalleryIDB } from './idb.js';
5:03:47 PM:         ╵                                                            ~~~~~~~~~~
5:03:47 PM: ​
5:03:47 PM: Dependencies installation error                               
5:03:47 PM: ────────────────────────────────────────────────────────────────
5:03:47 PM: ​
5:03:47 PM:   Error message
5:03:47 PM:   A Netlify Function failed to require one of its dependencies.
5:03:47 PM:   Please make sure it is present in the site's top-level "package.json".
​
5:03:47 PM:   Build failed with 5 errors:
5:03:47 PM:   netlify/functions/adsb.mjs:3:7: ERROR: Could not resolve "leaflet/dist/leaflet.css"
5:03:47 PM:   netlify/functions/adsb.mjs:4:46: ERROR: Could not resolve "./firebase"
5:03:47 PM:   netlify/functions/adsb.mjs:5:71: ERROR: Could not resolve "./rarity.js"
5:03:47 PM:   netlify/functions/adsb.mjs:6:80: ERROR: Could not resolve "./idb.js"
5:03:47 PM:   netlify/functions/adsb.mjs:115:2: ERROR: The JSX syntax extension is not currently enabled
5:03:47 PM: ​
5:03:47 PM:   Resolved config
5:03:47 PM:   build:
5:03:47 PM:     command: npm run build
5:03:47 PM:     commandOrigin: config
5:03:47 PM:     environment:
5:03:47 PM:       - SECRETS_SCAN_OMIT_KEYS
5:03:47 PM:       - SECRETS_SCAN_SMART_DETECTION_ENABLED
5:03:47 PM:       - VITE_FIREBASE_API_KEY
5:03:47 PM:       - VITE_FIREBASE_PROJECT_ID
5:03:47 PM:     publish: /opt/build/repo/dist
5:03:47 PM:     publishOrigin: config
5:03:47 PM:   functions:
5:03:47 PM:     "*":
5:03:47 PM:       node_bundler: esbuild
5:03:47 PM:   functionsDirectory: /opt/build/repo/netlify/functions
5:03:47 PM:   headers:
5:03:48 PM:     - for: /*
      values:
        Permissions-Policy: camera=*, gyroscope=*, accelerometer=*
        Referrer-Policy: strict-origin-when-cross-origin
        X-Content-Type-Options: nosniff
        X-Frame-Options: DENY
    - for: /sw.js
      values:
        Cache-Control: public, max-age=0, must-revalidate
    - for: /index.html
      values:
        Cache-Control: public, max-age=0, must-revalidate
    - for: /assets/*
      values:
        Cache-Control: public, max-age=31536000, immutable
    - for: /icon-*.png
      values:
        Cache-Control: public, max-age=86400
  headersOrigin: config
5:03:48 PM: Build failed due to a user error: Build script returned non-zero exit code: 2
5:03:48 PM: Failing build: Failed to build site
5:03:48 PM: Finished processing build request in 14.835s
5:03:48 PM: Failed during stage 'building site': Build script returned non-zero exit code: 2 (https://ntl.fyi/exit-code-2)
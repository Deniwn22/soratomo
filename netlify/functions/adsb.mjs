/**
 * SoraTomo — ADS-B proxy  (Netlify Functions v2)
 *
 * Sits between the app and adsb.lol. Two layers of deduplication:
 *
 *  1. Coordinate rounding — lat/lon rounded to 1 decimal place (~11 km bucket).
 *     Users within ~11 km of each other share the same cache entry.
 *
 *  2. Module-level Map cache — persists across requests on the same warm Lambda
 *     instance. Multiple simultaneous users on the same instance never trigger
 *     more than one upstream call per 2-second window.
 *
 *  3. Netlify CDN cache headers — s-maxage=2 lets Netlify's edge cache the
 *     response for 2 seconds per unique rounded URL, deduplicating across
 *     Lambda instances at the CDN level.
 *
 * Net result: adsb.lol sees at most ~1 req/2s per ~11 km area regardless of
 * how many users are connected.
 */

const cache   = new Map();   // key → { data: object, ts: number }
const CACHE_TTL  = 2000;     // ms — matches app poll interval
const PRUNE_EVERY = 50;      // prune stale entries every N requests
const COORD_DP   = 1;        // decimal places for coordinate bucketing (~11 km)

let reqCount = 0;

export default async (req) => {
  // Path: /adsb/v2/lat/38.9123/lon/-77.0456/dist/200
  const url  = new URL(req.url);
  const path = url.pathname.replace(/^\/adsb/, ''); // → /v2/lat/.../lon/.../dist/...

  // Extract coordinates for rounding
  const latM   = path.match(/\/lat\/([\d.-]+)/);
  const lonM   = path.match(/\/lon\/([\d.-]+)/);
  const distM  = path.match(/\/dist\/(\d+)/);

  if (!latM || !lonM) return badRequest('bad path');

  // ── Input validation — clamp/reject before hitting upstream ───────────────
  const latV  = parseFloat(latM[1]);
  const lonV  = parseFloat(lonM[1]);
  const distV = distM ? parseInt(distM[1], 10) : 200; // default 200 nm if absent

  if (!Number.isFinite(latV) || latV < -90  || latV > 90)  return badRequest('lat out of range');
  if (!Number.isFinite(lonV) || lonV < -180 || lonV > 180) return badRequest('lon out of range');
  if (!Number.isFinite(distV) || distV < 1  || distV > 500) return badRequest('dist must be 1–500 nm');

  // Round to bucket — nearby users share the same upstream request
  const lat  = parseFloat(parseFloat(latM[1]).toFixed(COORD_DP));
  const lon  = parseFloat(parseFloat(lonM[1]).toFixed(COORD_DP));
  const dist = distM ? distM[1] : '200';
  const key  = `${lat}:${lon}:${dist}`;

  // ── In-process cache ───────────────────────────────────────────
  const now    = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) {
    return jsonResponse(cached.data, true);
  }

  // ── Upstream fetch ─────────────────────────────────────────────
  try {
    const upstreamUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`;
    const r = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'SoraTomo/1.0' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    cache.set(key, { data, ts: now });

    // Periodic prune — drop entries older than 10× TTL
    if (++reqCount % PRUNE_EVERY === 0) {
      for (const [k, v] of cache) {
        if (now - v.ts > CACHE_TTL * 10) cache.delete(k);
      }
    }

    return jsonResponse(data, false);
  } catch (err) {
    // Return empty-but-valid response so the app falls back to DEMO gracefully
    return jsonResponse({ ac: [], now: now / 1000, error: err.message }, false, 200);
  }
};

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function jsonResponse(data, hit, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Cache':                     hit ? 'HIT' : 'MISS',
      // Tell Netlify's CDN to cache for 2 s — deduplicates across Lambda instances
      'Cache-Control':               'public, s-maxage=2, stale-while-revalidate=1',
      'Netlify-CDN-Cache-Control':   'public, s-maxage=2, stale-while-revalidate=1',
    },
  });
}

// Route /adsb/* to this function (no redirects needed in netlify.toml)
export const config = { path: '/adsb/*' };

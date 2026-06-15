/**
 * SoraTomo — airplanes.live proxy  (Netlify Functions v2)
 *
 * Mirror of adsb.mjs but targeting api.airplanes.live.
 * API: GET /v2/point/{lat}/{lon}/{radius_nm}  →  { ac: [...] }
 * Response shape is identical to adsb.lol so the app needs no special handling.
 *
 * Same coordinate-bucketing + in-process cache strategy as adsb.mjs.
 */

const cache      = new Map();
const CACHE_TTL  = 2000;
const PRUNE_EVERY = 50;
const COORD_DP   = 1;

let reqCount = 0;

export default async (req) => {
  // Path: /airplanes/v2/point/38.9/−77.0/200
  const url  = new URL(req.url);
  const path = url.pathname.replace(/^\/airplanes/, '');  // → /v2/point/lat/lon/dist

  const m = path.match(/\/v2\/point\/([\d.-]+)\/([\d.-]+)\/(\d+)/);
  if (!m) return badRequest('bad path');

  // ── Input validation — clamp/reject before hitting upstream ───────────────
  const latV  = parseFloat(m[1]);
  const lonV  = parseFloat(m[2]);
  const distV = parseInt(m[3], 10);

  if (!Number.isFinite(latV) || latV < -90  || latV > 90)  return badRequest('lat out of range');
  if (!Number.isFinite(lonV) || lonV < -180 || lonV > 180) return badRequest('lon out of range');
  if (!Number.isFinite(distV) || distV < 1  || distV > 500) return badRequest('dist must be 1–500 nm');

  // Round to bucket — nearby users share the same upstream request
  const lat  = parseFloat(latV.toFixed(COORD_DP));
  const lon  = parseFloat(lonV.toFixed(COORD_DP));
  const dist = m[3];
  const key  = `${lat}:${lon}:${dist}`;


  const now    = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) {
    return jsonResponse(cached.data, true);
  }

  try {
    const upstreamUrl = `https://api.airplanes.live/v2/point/${lat}/${lon}/${dist}`;
    const r = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'SoraTomo/1.0' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    cache.set(key, { data, ts: now });

    if (++reqCount % PRUNE_EVERY === 0) {
      for (const [k, v] of cache) {
        if (now - v.ts > CACHE_TTL * 10) cache.delete(k);
      }
    }

    return jsonResponse(data, false);
  } catch (err) {
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
      'Cache-Control':               'public, s-maxage=2, stale-while-revalidate=1',
      'Netlify-CDN-Cache-Control':   'public, s-maxage=2, stale-while-revalidate=1',
    },
  });
}

export const config = { path: '/airplanes/*' };

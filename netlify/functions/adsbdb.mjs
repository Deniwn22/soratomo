/**
 * SoraTomo — adsbdb aircraft-type lookup proxy  (Netlify Functions v2)
 *
 * adsbdb type data (ICAO hex → type/reg/owner) is essentially static — aircraft
 * registrations change on the order of months, not seconds.  Cache for 7 days.
 *
 * Module-level Map persists within a warm Lambda instance.  CDN headers let
 * Netlify edge cache the response globally, so the same hex is fetched from
 * adsbdb.com at most once per week per edge node.
 *
 * 404 / 502 / 503 from adsbdb are normalised to 200 {} so the app never sees
 * an error for unknown aircraft.
 */

const cache      = new Map();  // key → { body: string, ts: number }
const CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const PRUNE_EVERY = 200;

let reqCount = 0;

export default async (req) => {
  const url  = new URL(req.url);
  // Path: /adsbdb/v0/aircraft/a1b2c3
  const path = url.pathname.replace(/^\/adsbdb/, ''); // → /v0/aircraft/hex

  // Restrict to aircraft hex lookups only — this is the sole endpoint the app uses.
  // Prevents the function from acting as an open proxy to arbitrary adsbdb.com paths.
  const m = path.match(/^\/v0\/aircraft\/([0-9a-fA-F]{6})$/);
  if (!m) return badRequest('invalid aircraft hex');

  const key = path.toLowerCase();

  // ── In-process cache ───────────────────────────────────────────
  const now    = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) {
    return typeResponse(cached.body, true);
  }

  // ── Upstream fetch ─────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.adsbdb.com${path}`, {
      headers: { 'User-Agent': 'SoraTomo/1.0' },
    });

    // Normalise error codes → 200 {} so the app treats unknown aircraft gracefully
    if (r.status === 404 || r.status === 502 || r.status === 503 || !r.ok) {
      cache.set(key, { body: '{}', ts: now });
      return typeResponse('{}', false);
    }

    const body = await r.text();
    cache.set(key, { body, ts: now });

    // Periodic prune
    if (++reqCount % PRUNE_EVERY === 0) {
      for (const [k, v] of cache) {
        if (now - v.ts > CACHE_TTL) cache.delete(k);
      }
    }

    return typeResponse(body, false);
  } catch {
    return typeResponse('{}', false);
  }
};

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function typeResponse(body, hit) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Cache':                     hit ? 'HIT' : 'MISS',
      // 7-day CDN cache — type data is stable
      'Cache-Control':               'public, s-maxage=604800, stale-while-revalidate=86400',
      'Netlify-CDN-Cache-Control':   'public, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}

export const config = { path: '/adsbdb/*' };

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
  const origin = corsOrigin(req);  // CORS allow-origin for all responses below
  // Path: /adsbdb/v0/aircraft/a1b2c3
  const path = url.pathname.replace(/^\/adsbdb/, ''); // → /v0/aircraft/hex

  // Restrict to aircraft hex lookups only — this is the sole endpoint the app uses.
  // Prevents the function from acting as an open proxy to arbitrary adsbdb.com paths.
  const m = path.match(/^\/v0\/aircraft\/([0-9a-fA-F]{6})$/);
  if (!m) return badRequest('invalid aircraft hex', origin);

  const key = path.toLowerCase();

  // ── In-process cache ───────────────────────────────────────────
  const now    = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) {
    return typeResponse(cached.body, true, origin);
  }

  // ── Upstream fetch ─────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.adsbdb.com${path}`, {
      headers: { 'User-Agent': 'SoraTomo/1.0' },
    });

    // Normalise error codes → 200 {} so the app treats unknown aircraft gracefully
    if (r.status === 404 || r.status === 502 || r.status === 503 || !r.ok) {
      cache.set(key, { body: '{}', ts: now });
      return typeResponse('{}', false, origin);
    }

    const body = await r.text();
    cache.set(key, { body, ts: now });

    // Periodic prune
    if (++reqCount % PRUNE_EVERY === 0) {
      for (const [k, v] of cache) {
        if (now - v.ts > CACHE_TTL) cache.delete(k);
      }
    }

    return typeResponse(body, false, origin);
  } catch {
    return typeResponse('{}', false, origin);
  }
};

// ── CORS origin control ─────────────────────────────────────────────────────
// Single source of truth for the Access-Control-Allow-Origin header.
// Behaviour is driven by the ALLOWED_ORIGIN env var (set in Netlify):
//   • unset            → '*'  (open; current pre-launch behaviour, nothing breaks)
//   • comma-sep list   → echoes the request Origin if it's in the list, else the
//                        first listed origin. Lets one var cover the web domain,
//                        the Capacitor/native scheme, and localhost without code edits.
// To lock down later: set ALLOWED_ORIGIN in Netlify, e.g.
//   "https://soratomo.app,https://www.soratomo.app,capacitor://localhost,http://localhost:5173"
function corsOrigin(req) {
  const allow = (process.env.ALLOWED_ORIGIN || '').trim();
  if (!allow) return '*';                       // not configured → stay open
  const list = allow.split(',').map(s => s.trim()).filter(Boolean);
  const origin = req?.headers?.get?.('origin') || '';
  if (origin && list.includes(origin)) return origin;  // echo matching origin
  return list[0] || '*';                        // fallback to first allowed
}

function badRequest(message, origin = '*') {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
  });
}

function typeResponse(body, hit, origin = '*') {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': origin,
      'X-Cache':                     hit ? 'HIT' : 'MISS',
      // 7-day CDN cache — type data is stable
      'Cache-Control':               'public, s-maxage=604800, stale-while-revalidate=86400',
      'Netlify-CDN-Cache-Control':   'public, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}

export const config = { path: '/adsbdb/*' };

/**
 * SoraTomo — Leaderboard proxy  (Netlify Functions)
 *
 * Sits between the client and Firestore for score submissions.
 * Handles:
 *   POST /leaderboard  — validate + write a score entry
 *   GET  /leaderboard  — fetch top 20 for a date+region
 *
 * Server-side validation means callsign rules and profanity filter
 * cannot be bypassed by a client-side patch.
 */

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const API_KEY    = process.env.VITE_FIREBASE_API_KEY;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Callsign validation ────────────────────────────────────────────────────
const CALLSIGN_RE = /^[A-Z0-9]{2,12}$/;  // uppercase alphanumeric, 2–12 chars

// Compact blocklist — covers the most common offensive terms.
// Kept deliberately small; add terms as needed.
const BLOCKLIST = [
  'FUCK','SHIT','CUNT','DICK','COCK','ASS','ASSHOLE','BITCH','NIGGER','NIGGA',
  'FAGGOT','FAG','RETARD','RAPE','KILL','NAZI','HITLER','KKK','ISIS','JIHAD',
  'PISS','PRICK','SLUT','WHORE','PORN','SEX','NUDE','HOMO','DYKE','TRANNY',
];

function validateCallsign(raw) {
  if(!raw || typeof raw !== 'string') return 'Callsign required';
  const cs = raw.toUpperCase().trim();
  if(!CALLSIGN_RE.test(cs))
    return 'Callsign must be 2–12 characters, letters and numbers only';
  if(BLOCKLIST.some(w => cs.includes(w)))
    return 'Callsign contains prohibited content';
  return null; // valid
}

// ── Firestore REST helpers ─────────────────────────────────────────────────
function toFirestoreValue(v) {
  if(typeof v === 'string')  return { stringValue: v };
  if(typeof v === 'number')  return { integerValue: String(Math.round(v)) };
  return { stringValue: String(v) };
}

function fromFirestoreFields(fields) {
  if(!fields) return null;
  const out = {};
  for(const [k, v] of Object.entries(fields)) {
    out[k] = v.stringValue ?? (v.integerValue != null ? parseInt(v.integerValue) : null);
  }
  return out;
}

// ── CORS origin control ─────────────────────────────────────────────────────
// Single source of truth for Access-Control-Allow-Origin, driven by the
// ALLOWED_ORIGIN env var (set in Netlify):
//   • unset          → '*'  (open; current pre-launch behaviour, nothing breaks)
//   • comma-sep list → echoes the request Origin if listed, else the first entry.
// To lock down later, set ALLOWED_ORIGIN, e.g.
//   "https://soratomo.app,https://www.soratomo.app,capacitor://localhost"
function corsOrigin(req) {
  const allow = (process.env.ALLOWED_ORIGIN || '').trim();
  if (!allow) return '*';
  const list = allow.split(',').map(s => s.trim()).filter(Boolean);
  const origin = req?.headers?.get?.('origin') || '';
  if (origin && list.includes(origin)) return origin;
  return list[0] || '*';
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin(req),
  };

  if(req.method === 'OPTIONS')
    return new Response('', { status: 204, headers });

  // ── POST: submit a score ─────────────────────────────────────────────────
  if(req.method === 'POST') {
    let body;
    try { body = await req.json(); }
    catch { return new Response(JSON.stringify({error:'Invalid JSON'}), {status:400, headers}); }

    const { callsign, score, region, regionLabel, date, deviceId } = body;

    // Validate callsign server-side
    const csErr = validateCallsign(callsign);
    if(csErr)
      return new Response(JSON.stringify({error: csErr}), {status: 422, headers});

    // Basic field validation
    if(!deviceId || !date || !region || typeof score !== 'number' || score < 0)
      return new Response(JSON.stringify({error:'Missing or invalid fields'}), {status:400,headers});

    const docId = `${date}_${region}_${deviceId}`;
    const url   = `${BASE}/scores_daily/${docId}?key=${API_KEY}`
                + `&updateMask.fieldPaths=callsign`
                + `&updateMask.fieldPaths=score`
                + `&updateMask.fieldPaths=region`
                + `&updateMask.fieldPaths=regionLabel`
                + `&updateMask.fieldPaths=date`
                + `&updateMask.fieldPaths=deviceId`
                + `&updateMask.fieldPaths=updatedAt`;

    const fsBody = {
      fields: {
        callsign:    toFirestoreValue(callsign.toUpperCase().trim()),
        score:       toFirestoreValue(Math.round(score)),
        region:      toFirestoreValue(region),
        regionLabel: toFirestoreValue(regionLabel || region),
        date:        toFirestoreValue(date),
        deviceId:    toFirestoreValue(deviceId),
        updatedAt:   toFirestoreValue(new Date().toISOString()),
      }
    };

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(fsBody),
      });
      if(!res.ok) throw new Error(`Firestore ${res.status}`);
      return new Response(JSON.stringify({ok: true}), {status: 200, headers});
    } catch(e) {
      return new Response(JSON.stringify({error: 'Database write failed'}), {status:502,headers});
    }
  }

  // ── GET: fetch leaderboard ───────────────────────────────────────────────
  if(req.method === 'GET') {
    const url = new URL(req.url);
    const date   = url.searchParams.get('date');
    const region = url.searchParams.get('region');
    if(!date || !region)
      return new Response(JSON.stringify({error:'date and region required'}),{status:400,headers});

    const fsUrl  = `${BASE}:runQuery?key=${API_KEY}`;
    const fsBody = {
      structuredQuery: {
        from: [{collectionId:'scores_daily'}],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {fieldFilter:{field:{fieldPath:'date'},   op:'EQUAL',value:{stringValue:date}}},
              {fieldFilter:{field:{fieldPath:'region'}, op:'EQUAL',value:{stringValue:region}}},
            ]
          }
        },
        orderBy: [{field:{fieldPath:'score'},direction:'DESCENDING'}],
        limit: 20,
      }
    };

    try {
      const res  = await fetch(fsUrl, {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fsBody)
      });
      if(!res.ok) throw new Error(`Firestore ${res.status}`);
      const rows = await res.json();
      const data = rows
        .filter(r => r.document?.fields)
        .map(r => fromFirestoreFields(r.document.fields))
        .sort((a,b) => b.score - a.score);
      return new Response(JSON.stringify(data), {status:200,headers});
    } catch(e) {
      return new Response(JSON.stringify({error:'Database read failed'}),{status:502,headers});
    }
  }

  return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
}

// Netlify path routing — maps /leaderboard and /leaderboard/* to this function
export const config = { path: '/leaderboard' };

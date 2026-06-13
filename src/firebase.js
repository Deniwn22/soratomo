// ── SoraTomo Firestore — REST API (no SDK, no CORS issues) ─────────────────
// The Firestore JS SDK uses persistent WebSocket/long-poll channels that
// Safari blocks with CORS errors in PWAs. Plain REST fetch calls work fine.
//
// Env vars (Netlify environment variables, not marked as secret):
//   VITE_FIREBASE_API_KEY
//   VITE_FIREBASE_PROJECT_ID

const API_KEY    = import.meta.env.VITE_FIREBASE_API_KEY;
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Write / upsert today's score ────────────────────────────────────────────
// Uses PATCH with updateMask so it's a true upsert — won't clobber other fields.
export async function submitScore({ callsign, score, region, regionLabel, date, deviceId }) {
  if(!callsign || !deviceId || score < 1) return;
  const docId  = `${date}_${region}_${deviceId}`;
  const url    = `${BASE}/scores_daily/${docId}?key=${API_KEY}` +
                 `&updateMask.fieldPaths=callsign` +
                 `&updateMask.fieldPaths=score` +
                 `&updateMask.fieldPaths=region` +
                 `&updateMask.fieldPaths=regionLabel` +
                 `&updateMask.fieldPaths=date` +
                 `&updateMask.fieldPaths=deviceId` +
                 `&updateMask.fieldPaths=updatedAt`;

  const body = {
    fields: {
      callsign:    { stringValue: callsign },
      score:       { integerValue: String(score) },
      region:      { stringValue: region },
      regionLabel: { stringValue: regionLabel },
      date:        { stringValue: date },
      deviceId:    { stringValue: deviceId },
      updatedAt:   { stringValue: new Date().toISOString() },
    }
  };

  const res = await fetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if(!res.ok) throw new Error(`submitScore HTTP ${res.status}`);
}

// ── Fetch today's leaderboard for a region ──────────────────────────────────
// Firestore REST structured query — equivalent to:
//   .where('date','==',date).where('region','==',region).orderBy('score','desc').limit(20)
export async function fetchLeaderboard({ date, region }) {
  const url = `${BASE}:runQuery?key=${API_KEY}`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: 'scores_daily' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field:{ fieldPath:'date'   }, op:'EQUAL', value:{ stringValue:date   } } },
            { fieldFilter: { field:{ fieldPath:'region' }, op:'EQUAL', value:{ stringValue:region } } },
          ]
        }
      },
      orderBy: [{ field:{ fieldPath:'score' }, direction:'DESCENDING' }],
      limit:   20,
    }
  };

  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if(!res.ok) throw new Error(`fetchLeaderboard HTTP ${res.status}`);

  const rows = await res.json();
  // Each row is { document: { fields: {...} } } or { readTime } with no document
  return rows
    .filter(r => r.document?.fields)
    .map(r => {
      const f = r.document.fields;
      return {
        callsign:    f.callsign?.stringValue    || '',
        score:       parseInt(f.score?.integerValue || f.score?.doubleValue || 0),
        region:      f.region?.stringValue      || '',
        regionLabel: f.regionLabel?.stringValue || '',
        date:        f.date?.stringValue        || '',
        deviceId:    f.deviceId?.stringValue    || '',
      };
    })
    .sort((a,b) => b.score - a.score); // belt-and-suspenders sort
}

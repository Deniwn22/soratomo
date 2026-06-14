// ── SoraTomo Firestore — via Netlify leaderboard proxy ─────────────────────
// All leaderboard writes/reads go through /leaderboard (netlify/functions/leaderboard.mjs)
// so callsign validation and profanity filtering happen server-side.
// Only VITE_FIREBASE_PROJECT_ID is still needed here for the Firestore index URL
// shown in error messages — the actual API key lives in the Netlify function.

// ── Submit today's score ────────────────────────────────────────────────────
export async function submitScore({ callsign, score, region, regionLabel, date, deviceId }) {
  if(!callsign || !deviceId || score < 1) return;
  const res = await fetch('/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign, score, region, regionLabel, date, deviceId }),
  });
  if(!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

// ── Fetch today's leaderboard for a region ──────────────────────────────────
export async function fetchLeaderboard({ date, region }) {
  const url = `/leaderboard?date=${encodeURIComponent(date)}&region=${encodeURIComponent(region)}`;
  const res = await fetch(url);
  if(!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
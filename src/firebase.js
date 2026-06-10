// ── SoraTomo Firebase config ────────────────────────────────────────────────
// Fill in your Firebase project credentials below.
// To get these: Firebase Console → Project Settings → Your apps → SDK setup
//
// Then run: npm install firebase
//
import { initializeApp }       from 'firebase/app';
import { getFirestore,
         doc, setDoc, getDocs,
         collection, query,
         where, orderBy, limit,
         serverTimestamp }      from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig, 'soratomo');
export const db = getFirestore(app);

// ── Leaderboard helpers ─────────────────────────────────────────────────────

// Upsert today's score for this device+region. Called (debounced) after every catch.
export async function submitScore({ callsign, score, region, regionLabel, date, deviceId }) {
  if(!callsign || !deviceId || score < 1) return;
  const docId = `${date}_${region}_${deviceId}`;
  await setDoc(doc(db, 'scores_daily', docId), {
    callsign, score, region, regionLabel, date, deviceId,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Fetch top 20 scores for today in a given region.
export async function fetchLeaderboard({ date, region }) {
  const q = query(
    collection(db, 'scores_daily'),
    where('date',   '==', date),
    where('region', '==', region),
    orderBy('score', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

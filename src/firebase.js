// ── SoraTomo Firebase config ────────────────────────────────────────────────
// Credentials are read from environment variables — never hardcoded.
// Set these in Netlify: Site config → Environment variables
// Locally: create a .env file in the project root (already in .gitignore):
//
//   VITE_FIREBASE_API_KEY=AIza...
//   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
//   VITE_FIREBASE_PROJECT_ID=your-project-id
//   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
//   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
//   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
//
import { initializeApp }  from 'firebase/app';
import { getFirestore,
         doc, setDoc, getDocs,
         collection, query,
         where, orderBy, limit,
         serverTimestamp }  from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig, 'soratomo');
export const db = getFirestore(app);

export async function submitScore({ callsign, score, region, regionLabel, date, deviceId }) {
  if(!callsign || !deviceId || score < 1) return;
  const docId = `${date}_${region}_${deviceId}`;
  await setDoc(doc(db, 'scores_daily', docId), {
    callsign, score, region, regionLabel, date, deviceId,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

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

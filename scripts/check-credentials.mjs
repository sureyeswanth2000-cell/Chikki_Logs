import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const checks = [
  { role: "Superadmin", email: "superadmin@gigto.com", password: "test1234" },
  { role: "Owner", email: "owner@gigto.com", password: "test1234" },
  { role: "Consumer", email: "consumer@gigto.com", password: "test1234" },
];

for (const item of checks) {
  try {
    const credential = await signInWithEmailAndPassword(auth, item.email, item.password);
    console.log(`${item.role}: SUCCESS (${item.email}) uid=${credential.user.uid}`);
    await signOut(auth);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
    const message = error && typeof error === "object" && "message" in error ? error.message : String(error);
    console.log(`${item.role}: FAIL (${item.email}) code=${code} message=${message}`);
  }
}

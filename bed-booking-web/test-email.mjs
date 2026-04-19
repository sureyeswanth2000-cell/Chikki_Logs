import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

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

const tempEmail = "test-check-" + Date.now() + "@gigto-test.com";

createUserWithEmailAndPassword(auth, tempEmail, "password123")
    .then((userCredential) => {
        console.log("Email Auth SUCCESS. UID:", userCredential.user.uid);
        process.exit(0);
    })
    .catch((error) => {
        console.error("Email Auth FAILED:", error.code, error.message);
        process.exit(1);
    });

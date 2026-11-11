// Firebase Configuration and Initialization
// Direct CDN imports using Firebase v10.12.2 modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
  getDatabase, 
  ref, 
  push, 
  set, 
  onValue, 
  off 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCFYIawcvcSu4aDbx919KeP220SB1jspqQ",
  authDomain: "kcet-app-c0457.firebaseapp.com",
  databaseURL: "https://kcet-app-c0457-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kcet-app-c0457",
  storageBucket: "kcet-app-c0457.firebasestorage.app",
  messagingSenderId: "335362153278",
  appId: "1:335362153278:web:427d623b0190c586466a6f",
  measurementId: "G-RLN72LRCHN"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// Export Firebase methods for convenient use across app modules
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  ref,
  push,
  set,
  onValue,
  off
};

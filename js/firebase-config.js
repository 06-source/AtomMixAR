/**
 * AtomMixAR — Firebase configuration
 */

const firebaseConfig = {
  apiKey: "AIzaSyA3w1O37zA6zBjQDBGTjm4zE3D0hc5L7jk",
  authDomain: "atommixar.firebaseapp.com",
  databaseURL: "https://atommixar-default-rtdb.firebaseio.com",
  projectId: "atommixar",
  storageBucket: "atommixar.firebasestorage.app",
  messagingSenderId: "951181518184",
  appId: "1:951181518184:web:05e443e27ac5457a8022dd",
  measurementId: "G-37THDFVGGP"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Main Firebase services
const auth = firebase.auth();
const db = firebase.database();


// Secondary Firebase app
// Used when an admin creates another teacher/admin account
function getSecondaryAuth() {

  let secondaryApp = firebase.apps.find(
    app => app.name === "Secondary"
  );

  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(
      firebaseConfig,
      "Secondary"
    );
  }

  return secondaryApp.auth();
}
/**
 * AtomMixAR — Register (teachers & admins).
 * Creates the Firebase Auth login, then saves a REQUEST at /staff/{uid}:
 *   { name, email, requestedRole, requestedAt, sectionsRestricted? }   <- note: no "role"
 * Nobody gets dashboard access until an admin approves the request
 * (admin-teachers.html), which is what sets the real "role".
 */

// =========================================================
// PASSWORD POLICY (ginagamit din ng register.html para sa live checklist)
// =========================================================
const PasswordPolicy = (function () {
  const MIN_LENGTH = 10;

  // Kapag nasa loob ng password ang alinman dito, hindi ito papayagan
  const COMMON = [
    "password", "passw0rd", "p@ssw0rd", "qwerty", "asdfgh", "zxcvbn",
    "123456", "654321", "111111", "000000", "abc123", "iloveyou",
    "welcome", "letmein", "admin", "teacher", "atommixar", "cscqc",
    "monkey", "dragon", "login", "unlock"
  ];

  function check(password, name, email) {
    const p = password || "";
    const lower = p.toLowerCase();

    const emailUser = (email || "").split("@")[0].toLowerCase();
    const nameParts = (name || "").toLowerCase().split(/\s+/);
    const personal = [emailUser].concat(nameParts).filter(w => w.length >= 3);

    return [
      { label: "At least " + MIN_LENGTH + " characters", ok: p.length >= MIN_LENGTH },
      { label: "An uppercase letter (A-Z)", ok: /[A-Z]/.test(p) },
      { label: "A lowercase letter (a-z)", ok: /[a-z]/.test(p) },
      { label: "A number (0-9)", ok: /[0-9]/.test(p) },
      { label: "A special character (e.g. ! @ # $ %)", ok: /[^A-Za-z0-9\s]/.test(p) },
      { label: "No spaces", ok: !/\s/.test(p) },
      { label: "No 3 identical characters in a row", ok: !/(.)\1\1/.test(p) },
      { label: "Not a common password", ok: !COMMON.some(w => lower.includes(w)) },
      { label: "Doesn't contain your name or email", ok: !personal.some(w => lower.includes(w)) }
    ];
  }

  // Ibinabalik ang unang rule na hindi pa natutupad, o null kung ayos na
  function firstProblem(password, name, email) {
    const bad = check(password, name, email).find(r => !r.ok);
    return bad ? bad.label : null;
  }

  return { MIN_LENGTH, check, firstProblem };
})();

(function () {
  const form = document.getElementById("registerForm");
  const alertBox = document.getElementById("registerAlert");
  const btn = document.getElementById("registerBtn");

  function showAlert(msg, ok) {
    alertBox.textContent = msg;
    alertBox.className = "alert " + (ok ? "alert-ok" : "alert-error") + " show";
  }

  function friendly(err) {
    const map = {
      "auth/weak-password": "Password is too weak. Please follow the password rules.",
      "auth/password-does-not-meet-requirements": "Password doesn't meet the security requirements. Please follow the password rules.",
      "auth/invalid-email": "That email address isn't valid.",
      "auth/network-request-failed": "Network problem. Check your connection and try again."
    };
    if (map[err.code]) return map[err.code];
    if (/permission_denied/i.test(err.code || "") || /permission_denied/i.test(err.message || "")) {
      return "Database permission denied. Check the Realtime Database rules (see F12 → Console for the path).";
    }
    return (err.message || "Something went wrong.").replace("Firebase: ", "");
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    alertBox.classList.remove("show");

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const role = document.getElementById("role").value;
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirm").value;

    if (!name) { showAlert("Please enter your full name."); return; }
    if (!AppAuth.isAllowedEmail(email)) {
      showAlert("Please use your " + AppAuth.ALLOWED_DOMAIN + " school email.");
      return;
    }

    // Mas mahigpit na password
    const problem = PasswordPolicy.firstProblem(password, name, email);
    if (problem) {
      showAlert("Password too weak: " + problem + ".");
      return;
    }

    if (password !== confirm) { showAlert("The two passwords don't match."); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending…';

    // Safety net: never leave the button spinning forever.
    const watchdog = setTimeout(() => {
      showAlert("This is taking too long. Check your internet and js/firebase-config.js, then try again. (F12 → Console shows the details.)");
      btn.disabled = false;
      btn.textContent = "Request account";
    }, 20000);

    auth.createUserWithEmailAndPassword(email, password)
      .catch(err => {
        if (err.code !== "auth/email-already-in-use") throw err;
        // The email already has a login (for example a student login from the game).
        // Let the person prove it's theirs by signing in with that password.
        return auth.signInWithEmailAndPassword(email, password).catch(e => {
          console.error("Sign-in fallback failed:", e.code, e);
          throw new Error(
            "This email already has an account, but the password didn't match (" + e.code + "). " +
            "Enter the password you already use."
          );
        });
      })
      .then(cred => {
        const user = cred.user;
        return AppAuth.getProfile(user.uid).then(profile => {
          if (profile && profile.role) {
            return auth.signOut().then(() => {
              throw new Error("This account already has access. Go to the sign-in page.");
            });
          }
          return db.ref("adminSetup").once("value").then(setupSnap => {
            const ts = firebase.database.ServerValue.TIMESTAMP;

            if (role === "admin" && !setupSnap.exists()) {
              // No admin exists yet: the FIRST person to register as Admin is approved
              // automatically. The database rules close this window right after.
              const updates = {};
              updates["staff/" + user.uid + "/name"] = name;
              updates["staff/" + user.uid + "/email"] = email;
              updates["staff/" + user.uid + "/role"] = "admin";
              updates["adminSetup"] = { uid: user.uid, at: ts };
              return db.ref().update(updates).then(() => "first-admin");
            }

            // update() (not set) so we never wipe anything the game stored on this user.
            // Only send fields the rules allow; no nulls.
            const req = { name, email, requestedRole: role, requestedAt: ts };
            // new teachers only see the sections the admin assigns to them
            if (role === "teacher") req.sectionsRestricted = true;

            return db.ref("staff/" + user.uid).update(req).then(() => "request");
          });
        }).then(outcome => auth.signOut().then(() => outcome));
      })
      .then(outcome => {
        form.reset();
        form.classList.add("hidden");
        showAlert(outcome === "first-admin"
          ? "You're the first admin! Your account is ready. Go to the sign-in page."
          : "Request sent! An admin needs to approve it before you can sign in.", true);
      })
      .catch(err => {
        console.error(err);
        showAlert(friendly(err));
        auth.signOut().catch(() => {});
      })
      .finally(() => {
        clearTimeout(watchdog);
        btn.disabled = false;
        btn.textContent = "Request account";
      });
  });
})();
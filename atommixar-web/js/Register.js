/**
 * AtomMixAR — Register (teachers & admins).
 * Creates the Firebase Auth login, then saves a REQUEST at /staff/{uid}:
 *   { name, email, requestedRole, requestedAt }   <- note: no "role"
 * Nobody gets dashboard access until an admin approves the request
 * (admin-teachers.html), which is what sets the real "role".
 */
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
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-email": "That email address isn't valid.",
      "auth/network-request-failed": "Network problem. Check your connection and try again."
    };
    return map[err.code] || (err.message || "Something went wrong.").replace("Firebase: ", "");
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
    if (password.length < 6) { showAlert("Password must be at least 6 characters."); return; }
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
        return auth.signInWithEmailAndPassword(email, password).catch(() => {
          throw new Error("This email already has an account with a different password. Enter the password you already use.");
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
            // update() (not set) so we never wipe anything the game stored on this user
            return db.ref("staff/" + user.uid)
              .update({
                name, email, requestedRole: role, requestedAt: ts,
                // new teachers only see the sections the admin assigns to them
                sectionsRestricted: role === "teacher" ? true : null
              })
              .then(() => "request");
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
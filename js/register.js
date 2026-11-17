
/**
 * AtomMixAR — Register (Teachers & Admins)
 * Firebase registration + admin approval
 */

// =====================================================
// PASSWORD POLICY
// =====================================================

window.PasswordPolicy = (function () {

  const MIN_LENGTH = 10;

  const COMMON = [
    "password", "passw0rd", "p@ssw0rd",
    "qwerty", "asdfgh", "zxcvbn",
    "123456", "654321", "111111",
    "000000", "abc123", "iloveyou",
    "welcome", "letmein", "admin",
    "teacher", "atommixar", "cscqc",
    "monkey", "dragon", "login", "unlock"
  ];

  function check(password, name, email) {

    const p = password || "";
    const lower = p.toLowerCase();

    const emailUser = (email || "")
      .split("@")[0]
      .toLowerCase();

    const nameParts = (name || "")
      .toLowerCase()
      .split(/\s+/);

    const personal = [emailUser]
      .concat(nameParts)
      .filter(w => w.length >= 3);

    return [

      {
        label: "At least " + MIN_LENGTH + " characters",
        ok: p.length >= MIN_LENGTH
      },

      {
        label: "An uppercase letter (A-Z)",
        ok: /[A-Z]/.test(p)
      },

      {
        label: "A lowercase letter (a-z)",
        ok: /[a-z]/.test(p)
      },

      {
        label: "A number (0-9)",
        ok: /[0-9]/.test(p)
      },

      {
        label: "A special character (e.g. ! @ # $ %)",
        ok: /[^A-Za-z0-9\s]/.test(p)
      },

      {
        label: "No spaces",
        ok: !/\s/.test(p)
      },

      {
        label: "No 3 identical characters in a row",
        ok: !/(.)\1\1/.test(p)
      },

      {
        label: "Not a common password",
        ok: !COMMON.some(w => lower.includes(w))
      },

      {
        label: "Doesn't contain your name or email",
        ok: !personal.some(w => lower.includes(w))
      }

    ];
  }

  function firstProblem(password, name, email) {

    const bad = check(password, name, email)
      .find(r => !r.ok);

    return bad ? bad.label : null;
  }

  return {
    MIN_LENGTH,
    check,
    firstProblem
  };

})();


// =====================================================
// REGISTRATION PAGE
// =====================================================

(function () {

  const form = document.getElementById("registerForm");
  const alertBox = document.getElementById("registerAlert");
  const btn = document.getElementById("registerBtn");

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirm");
  const pwRules = document.getElementById("pwRules");

  // Check that all required HTML elements exist
  if (
    !form || !alertBox || !btn ||
    !nameInput || !emailInput ||
    !passwordInput || !confirmInput || !pwRules
  ) {
    console.error("Registration HTML elements are missing.");
    return;
  }

  // ===================================================
  // ALERT MESSAGE
  // ===================================================

  function showAlert(msg, ok = false) {

    alertBox.textContent = msg;

    alertBox.className =
      "alert " +
      (ok ? "alert-ok" : "alert-error") +
      " show";
  }


  // ===================================================
  // FRIENDLY FIREBASE ERRORS
  // ===================================================

  function friendly(err) {

    const map = {

      "auth/weak-password":
        "Password is too weak. Please follow the password rules.",

      "auth/password-does-not-meet-requirements":
        "Password doesn't meet the security requirements. Please follow the password rules.",

      "auth/invalid-email":
        "That email address isn't valid.",

      "auth/network-request-failed":
        "Network problem. Check your connection and try again."

    };

    if (map[err.code]) {
      return map[err.code];
    }

    if (
      /permission_denied/i.test(err.code || "") ||
      /permission_denied/i.test(err.message || "")
    ) {
      return "Database permission denied. Check your Realtime Database rules (F12 → Console).";
    }

    return (err.message || "Something went wrong.")
      .replace("Firebase: ", "");
  }


  // ===================================================
  // LIVE PASSWORD CHECKLIST
  // ===================================================

  function renderRules() {

    const rules = window.PasswordPolicy.check(
      passwordInput.value,
      nameInput.value.trim(),
      emailInput.value.trim()
    );

    pwRules.innerHTML = "";

    rules.forEach(rule => {

      const li = document.createElement("li");

      li.textContent = rule.label;

      if (rule.ok) {
        li.classList.add("ok");
      }

      pwRules.appendChild(li);

    });

  }

  // Update checklist while typing
  passwordInput.addEventListener("input", renderRules);

  nameInput.addEventListener("input", renderRules);

  emailInput.addEventListener("input", renderRules);

  // Show checklist immediately when page loads
  renderRules();


  // ===================================================
  // SHOW / HIDE PASSWORD
  // ===================================================

  const EYE_OPEN = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';

  const EYE_CLOSED = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.12c0-1.66-1.34-3-3-3l-.17.02z"/>';

  function setupToggle(btnId, input, iconId) {

    const toggleBtn = document.getElementById(btnId);
    const icon = document.getElementById(iconId);

    if (!toggleBtn || !icon) return;

    toggleBtn.addEventListener("click", function () {

      const isHidden = input.type === "password";

      input.type = isHidden ? "text" : "password";

      icon.innerHTML = isHidden ? EYE_OPEN : EYE_CLOSED;

      toggleBtn.title = isHidden
        ? "Hide password"
        : "Show password";

      toggleBtn.setAttribute(
        "aria-label",
        isHidden ? "Hide password" : "Show password"
      );

    });

  }

  setupToggle("togglePassword", passwordInput, "eyeIcon1");

  setupToggle("toggleConfirm", confirmInput, "eyeIcon2");


  // ===================================================
  // REGISTRATION SUBMISSION
  // ===================================================

  form.addEventListener("submit", function (e) {

    e.preventDefault();

    alertBox.classList.remove("show");

    const name = nameInput.value.trim();

    const email = emailInput.value.trim().toLowerCase();

    const role = document.getElementById("role").value;

    const password = passwordInput.value;

    const confirm = confirmInput.value;


    // Validate full name
    if (!name) {
      showAlert("Please enter your full name.");
      return;
    }


    // Validate school email
    if (!AppAuth.isAllowedEmail(email)) {

      showAlert(
        "Please use your " +
        AppAuth.ALLOWED_DOMAIN +
        " school email."
      );

      return;
    }


    // Validate password
    const problem = window.PasswordPolicy.firstProblem(
      password,
      name,
      email
    );

    if (problem) {

      showAlert("Password too weak: " + problem + ".");

      return;
    }


    // Confirm password
    if (password !== confirm) {

      showAlert("The two passwords don't match.");

      return;
    }


    // Disable submit button
    btn.disabled = true;

    btn.innerHTML =
      '<span class="spinner"></span> Sending…';


    // Timeout protection
    let finished = false;

    const watchdog = setTimeout(function () {

      if (finished) return;

      showAlert(
        "This is taking too long. Check your internet and js/firebase-config.js, then try again. (F12 → Console shows the details.)"
      );

      btn.disabled = false;

      btn.textContent = "Request account";

    }, 20000);


    // =================================================
    // FIREBASE AUTHENTICATION
    // =================================================

    auth.createUserWithEmailAndPassword(email, password)

      .catch(function (err) {

        if (err.code !== "auth/email-already-in-use") {
          throw err;
        }

        // Existing Firebase account:
        // Verify ownership using its existing password.
        return auth.signInWithEmailAndPassword(
          email,
          password
        ).catch(function (e) {

          console.error("Sign-in fallback failed:", e.code, e);

          throw new Error(
            "This email already has an account, but the password didn't match (" +
            e.code +
            "). Enter the password you already use."
          );

        });

      })


      // =================================================
      // CHECK STAFF PROFILE
      // =================================================

      .then(function (cred) {

        const user = cred.user;

        return AppAuth.getProfile(user.uid).then(function (profile) {

          if (profile && profile.role) {

            return auth.signOut().then(function () {

              throw new Error(
                "This account already has access. Go to the sign-in page."
              );

            });

          }


          // =============================================
          // CHECK ADMIN SETUP
          // =============================================

          return db.ref("adminSetup").once("value").then(function (setupSnap) {

            const ts = firebase.database.ServerValue.TIMESTAMP;


            // ===========================================
            // FIRST ADMIN AUTO APPROVAL
            // ===========================================

            if (role === "admin" && !setupSnap.exists()) {

              const updates = {};

              updates["staff/" + user.uid + "/name"] = name;

              updates["staff/" + user.uid + "/email"] = email;

              updates["staff/" + user.uid + "/role"] = "admin";

              updates["adminSetup"] = {
                uid: user.uid,
                at: ts
              };

              return db.ref().update(updates)
                .then(function () {
                  return "first-admin";
                });

            }


            // ===========================================
            // NORMAL STAFF REQUEST
            // ===========================================

            const req = {

              name: name,

              email: email,

              requestedRole: role,

              requestedAt: ts

            };

            if (role === "teacher") {
              req.sectionsRestricted = true;
            }

            return db.ref("staff/" + user.uid)
              .update(req)
              .then(function () {
                return "request";
              });

          });

        }).then(function (outcome) {

          return auth.signOut().then(function () {
            return outcome;
          });

        });

      })


      // =================================================
      // SUCCESS
      // =================================================

      .then(function (outcome) {

        form.reset();

        form.classList.add("hidden");

        renderRules();

        showAlert(

          outcome === "first-admin"

            ? "You're the first admin! Your account is ready. Go to the sign-in page."

            : "Request sent! An admin needs to approve it before you can sign in.",

          true

        );

      })


      // =================================================
      // ERROR
      // =================================================

      .catch(function (err) {

        console.error(err);

        showAlert(friendly(err));

        auth.signOut().catch(function () {});

      })


      // =================================================
      // FINALLY
      // =================================================

      .finally(function () {

        finished = true;

        clearTimeout(watchdog);

        btn.disabled = false;

        btn.textContent = "Request account";

      });

  });

})();

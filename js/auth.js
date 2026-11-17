/**
 * AtomMixAR — shared authentication helpers
 *
 * Staff sign-in can be two steps: email + password, then a 6-digit code emailed
 * by the sendLoginCode / verifyLoginCode Cloud Functions. A successful code sets
 * the custom claim `mfaAt` (ms timestamp) on the account. When REQUIRE_MFA is
 * true, staff pages only open when
 *   1) the claim was set AFTER this sign-in began (mfaAt >= auth_time), and
 *   2) it is less than MFA_MAX_AGE_MS old.
 * Signing in again with just a password therefore never reuses an old verification.
 */

const AppAuth = (function () {

  // Only CSCQC school emails
  const ALLOWED_DOMAIN = "@cscqc.edu.ph";

  // How long one verified sign-in stays valid
  const MFA_MAX_AGE_MS = 8 * 60 * 60 * 1000;

  // false = password lang (para sa local testing, walang emailed code step pa)
  // true  = kailangan ng emailed code (gawing true kapag kumpleto na ang code step sa login.html)
  const REQUIRE_MFA = false;


  // Mga section ng school
  const SECTIONS = [
    "GR.10 MATTHEW", "GR.10 PIO", "GR.11-TECHPRO", "GR.11-ACAD-ASSH",
    "GR.11-ACAD-BE", "GR.11-ACAD-STEM-ET", "GR.11-ACAD-STEM MH",
    "GR.12 ABM", "GR.12 HE", "GR.12 HUMSS", "GR.12 STEM A", "GR.12 STEM B"
  ];

  // Inaayos ang pagkakasulat para magtugma kahit iba ang laki ng letra o dami ng espasyo.
  // Ang lumang "PRIO" ay awtomatikong tinatrato bilang "PIO", kaya hindi mawawala
  // ang mga section na nai-save na dati.
  const normSection = s => String(s || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bPRIO\b/, "PIO");

  // Mga section na hawak ng teacher: staff/{uid}/sections = ["GR.12 HE", ...]
  function teacherSections(profile) {
    const raw = (profile && profile.sections) || [];
    return Object.values(raw).map(normSection);
  }

  // A teacher is "restricted" once the admin has set sections for them, or when
  // they were created through registration / "Add staff" (sectionsRestricted = true).
  // Older teachers that were never assigned sections are NOT restricted and
  // keep seeing every record until the admin sets their sections.
  function isRestricted(profile) {
    return !!profile && (profile.sectionsRestricted === true || teacherSections(profile).length > 0);
  }

  // Admin: everything. Unrestricted teacher: everything.
  // Restricted teacher: only students in their assigned sections.
  function canSeeSection(profile, section) {
    if (profile && profile.role === "admin") return true;
    if (!isRestricted(profile)) return true;
    const sec = normSection(section);
    return !!sec && teacherSections(profile).includes(sec);
  }


  function isAllowedEmail(email) {
    return String(email || "").trim().toLowerCase().endsWith(ALLOWED_DOMAIN);
  }


  function dashboardFor(role) {
    if (role === "admin") return "admin-dashboard.html";
    if (role === "teacher") return "teacher-dashboard.html";
    return "login.html";
  }


  /**
   * Get staff profile.
   * staff/{uid} = { name, email, role, sections }
   */
  function getProfile(uid) {
    return db.ref("staff/" + uid).get().then(snapshot => snapshot.val());
  }


  /**
   * Step 1 of sign-in (email + password). Resolves with the role.
   * If REQUIRE_MFA is true, the caller must still complete the emailed-code step.
   */
  function login(email, password) {

    email = String(email || "").trim().toLowerCase();

    if (!isAllowedEmail(email)) {
      return Promise.reject(
        new Error("Please sign in with your " + ALLOWED_DOMAIN + " school email.")
      );
    }

    return auth
      .signInWithEmailAndPassword(email, password)
      .then(credential => getProfile(credential.user.uid))
      .then(profile => {

        // No staff profile
        if (!profile) {
          return auth.signOut().then(() => {
            throw new Error("This account is not registered as an admin or teacher.");
          });
        }

        // Account has no role yet
        if (!profile.role) {
          return auth.signOut().then(() => {
            if (profile.requestedRole) {
              throw new Error("Your account is waiting for an admin to approve it.");
            }
            throw new Error("This account does not have access to the staff website.");
          });
        }

        // Only admin or teacher
        if (profile.role !== "admin" && profile.role !== "teacher") {
          return auth.signOut().then(() => {
            throw new Error("This account does not have a valid staff role.");
          });
        }

        return profile.role;
      });
  }


  /**
   * Logout
   */
  function logout() {
    return auth.signOut().then(() => {
      window.location.href = "login.html";
    });
  }


  /**
   * True when this sign-in has passed the emailed-code step recently.
   */
  function hasMfa(user) {
    return user.getIdTokenResult().then(t => {
      const verifiedAt = Number(t.claims.mfaAt) || 0;
      const signedInAt = Date.parse(t.authTime) || 0;
      return verifiedAt >= signedInAt && Date.now() - verifiedAt < MFA_MAX_AGE_MS;
    });
  }


  /**
   * Protect admin/teacher pages
   */
  function requireRole(role, onReady) {

    auth.onAuthStateChanged(user => {

      if (!user) {
        window.location.href = "login.html";
        return;
      }

      getProfile(user.uid)

        .then(profile => {

          if (!profile || !profile.role) {
            window.location.href = "login.html";
            return;
          }

          if (profile.role !== role) {
            window.location.href = dashboardFor(profile.role);
            return;
          }

          // Kapag REQUIRE_MFA = true, kailangan ding tapos ang emailed code
          const mfaCheck = REQUIRE_MFA ? hasMfa(user) : Promise.resolve(true);

          return mfaCheck.then(ok => {
            if (!ok) {
              return auth.signOut().then(() => {
                window.location.href = "login.html";
              });
            }
            renderUserChip(profile);
            onReady(user, profile);
          });

        })

        .catch(error => {
          console.error("Profile error:", error);
          window.location.href = "login.html";
        });

    });
  }


  /**
   * Display current staff member
   */
  function renderUserChip(profile) {

    const nameEl = document.getElementById("chipName");
    const roleEl = document.getElementById("chipRole");
    const avatarEl = document.getElementById("chipAvatar");

    if (nameEl) {
      nameEl.textContent = profile.name || profile.email || "User";
    }

    if (roleEl) {
      roleEl.textContent = profile.role === "admin" ? "Admin" : "Teacher";
    }

    if (avatarEl) {
      avatarEl.textContent = (profile.name || profile.email || "?")
        .trim()
        .charAt(0)
        .toUpperCase();
    }

  }


  /**
   * Logout buttons
   */
  function bindLogoutButtons() {
    document.querySelectorAll("[data-logout]").forEach(button => {
      button.addEventListener("click", logout);
    });
  }

  document.addEventListener("DOMContentLoaded", bindLogoutButtons);


  return {
    login,
    logout,
    requireRole,
    getProfile,
    dashboardFor,
    isAllowedEmail,
    ALLOWED_DOMAIN,
    SECTIONS,
    canSeeSection,
    isRestricted,
    teacherSections
  };

})();
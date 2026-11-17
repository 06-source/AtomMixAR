/**
 * AtomMixAR — Admin: staff accounts.
 * - Pending requests: people who used register.html. Approving sets their
 *   real "role" (teacher or admin); rejecting clears the request.
 * - Active staff: everyone with role teacher/admin. Revoking clears the role.
 * - "Add teacher": creates the login directly (no request needed).
 * - Teachers: the admin sets which sections they handle (staff/{uid}/sections).
 *   A teacher only sees students from those sections.
 */
AppAuth.requireRole("admin", function (currentUser) {
  const staffRef = db.ref("staff");
  const tbody = document.getElementById("teachersBody");
  const empty = document.getElementById("emptyState");
  const pendingSection = document.getElementById("pendingSection");
  const pendingBody = document.getElementById("pendingBody");
  const modal = document.getElementById("teacherModal");
  const form = document.getElementById("teacherForm");
  const alertBox = document.getElementById("formAlert");

  let staff = {};
  let pending = {};

  staffRef.on("value", snap => {
    const all = snap.val() || {};
    staff = {};
    pending = {};
    Object.entries(all).forEach(([uid, u]) => {
      if (u.role === "teacher" || u.role === "admin") staff[uid] = u;
      else if (u.requestedRole) pending[uid] = u;
    });
    renderStaff();
    renderPending();
  });

  // What to show under a teacher's name
  function sectionLabel(t) {
    const secs = AppAuth.teacherSections(t);
    if (secs.length) return secs.join(", ");
    return AppAuth.isRestricted(t) ? "No sections yet (sees no students)" : "All students (no filter yet)";
  }

  function roleTag(role) {
    return `<span class="tag tag-${role === "admin" ? "admin" : "teacher"}">${role === "admin" ? "Admin" : "Teacher"}</span>`;
  }

  function renderStaff() {
    const ids = Object.keys(staff);
    tbody.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);

    ids
      .sort((a, b) => (staff[a].name || "").localeCompare(staff[b].name || ""))
      .forEach(uid => {
        const t = staff[uid];
        const isMe = uid === currentUser.uid;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(t.name || "—")}${isMe ? ' <span class="text-muted">(you)</span>' : ""}
            ${t.role === "teacher"
              ? `<br><small class="text-muted">${escapeHtml(sectionLabel(t))}</small>`
              : ""}</td>
          <td>${escapeHtml(t.email || "—")}</td>
          <td>${roleTag(t.role)}</td>
          <td class="row">
            ${t.role === "teacher" ? `<button class="btn-sm" data-sections="${uid}">Edit sections</button>` : ""}
            ${isMe ? "" : `<button class="btn-sm btn-danger" data-remove="${uid}">Revoke access</button>`}
          </td>`;
        tbody.appendChild(tr);
      });

    tbody.querySelectorAll("[data-remove]").forEach(b =>
      b.addEventListener("click", () => revoke(b.dataset.remove)));
    tbody.querySelectorAll("[data-sections]").forEach(b =>
      b.addEventListener("click", () => openSections(b.dataset.sections)));
  }

  function renderPending() {
    const ids = Object.keys(pending);
    pendingSection.classList.toggle("hidden", ids.length === 0);
    pendingBody.innerHTML = "";

    ids
      .sort((a, b) => (pending[a].requestedAt || 0) - (pending[b].requestedAt || 0))
      .forEach(uid => {
        const p = pending[uid];
        const valid = p.requestedRole === "teacher" || p.requestedRole === "admin";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(p.name || "—")}
            ${p.requestedRole === "teacher"
              ? `<br><small class="text-muted">${escapeHtml(sectionLabel(p))}</small>`
              : ""}</td>
          <td>${escapeHtml(p.email || "—")}</td>
          <td>${valid ? roleTag(p.requestedRole) : escapeHtml(p.requestedRole)}</td>
          <td>
            <div class="row">
              ${valid && p.requestedRole === "teacher" ? `<button class="btn-sm" data-sections="${uid}">Sections</button>` : ""}
              ${valid ? `<button class="btn-sm btn-primary" data-approve="${uid}">Approve</button>` : ""}
              <button class="btn-sm btn-danger" data-reject="${uid}">Reject</button>
            </div>
          </td>`;
        pendingBody.appendChild(tr);
      });

    pendingBody.querySelectorAll("[data-approve]").forEach(b =>
      b.addEventListener("click", () => approve(b.dataset.approve)));
    pendingBody.querySelectorAll("[data-reject]").forEach(b =>
      b.addEventListener("click", () => reject(b.dataset.reject)));
    pendingBody.querySelectorAll("[data-sections]").forEach(b =>
      b.addEventListener("click", () => openSections(b.dataset.sections)));
  }

  function approve(uid) {
    const p = pending[uid];
    if (!p) return;
    if (p.requestedRole === "admin" &&
        !confirm(`Give ${p.name || p.email} full ADMIN access? Admins can manage all accounts.`)) return;
    staffRef.child(uid).update({ role: p.requestedRole, requestedRole: null })
      .catch(err => alert("Could not approve: " + err.message));
  }

  function reject(uid) {
    if (!confirm("Reject this request?")) return;
    staffRef.child(uid).update({ requestedRole: null })
      .catch(err => alert("Could not reject: " + err.message));
  }

  function revoke(uid) {
    if (!confirm("Revoke this person's console access? Their quizzes and score history stay in place.")) return;
    // Clearing the role blocks them from every dashboard (the auth guard needs a role).
    // The Firebase Auth login itself can only be deleted from the Firebase console.
    staffRef.child(uid).update({ role: null, requestedRole: null })
      .catch(err => alert("Could not revoke: " + err.message));
  }

  // ---- Edit teacher sections (builds its own popup, no HTML change needed) ----
  let secOverlay = null, secUid = null;

  function buildSectionsModal() {
    secOverlay = document.createElement("div");
    secOverlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px";
    secOverlay.innerHTML = `
      <div style="background:#fff;color:#111;border-radius:12px;padding:22px;max-width:460px;width:100%;max-height:90vh;overflow:auto">
        <h3 id="secTitle" style="margin:0 0 4px;font-size:1.1rem"></h3>
        <p style="margin:0 0 14px;font-size:.85rem;color:#64748b">Select the sections this teacher can view.</p>
        <div id="secChecks" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>
        <div id="secAlert" class="alert" style="margin-top:12px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button type="button" class="btn-ghost btn-sm" id="secCancel">Cancel</button>
          <button type="button" class="btn-primary btn-sm" id="secSave">Save sections</button>
        </div>
      </div>`;
    document.body.appendChild(secOverlay);
    secOverlay.querySelector("#secCancel").addEventListener("click", closeSections);
    secOverlay.addEventListener("click", e => { if (e.target === secOverlay) closeSections(); });
    secOverlay.querySelector("#secSave").addEventListener("click", saveSections);
  }

  function openSections(uid) {
    const person = staff[uid] || pending[uid];
    if (!person) return;
    if (!secOverlay) buildSectionsModal();
    secUid = uid;
    const current = AppAuth.teacherSections(person);
    secOverlay.querySelector("#secTitle").textContent = "Sections for " + (person.name || person.email);
    secOverlay.querySelector("#secAlert").classList.remove("show");
    secOverlay.querySelector("#secChecks").innerHTML = AppAuth.SECTIONS.map(s => `
      <label style="display:flex!important;flex-direction:row!important;align-items:center;gap:8px;width:auto!important;margin:0!important;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:.88rem;color:#111!important;white-space:nowrap">
        <input type="checkbox" value="${escapeHtml(s)}" ${current.includes(s.toUpperCase()) ? "checked" : ""}
          style="width:16px!important;height:16px!important;min-width:16px;margin:0!important;padding:0!important;flex:none">
        <span>${escapeHtml(s)}</span>
      </label>`).join("");
    secOverlay.style.display = "flex";
  }

  function closeSections() {
    if (secOverlay) secOverlay.style.display = "none";
    secUid = null;
  }

  function saveSections() {
    if (!secUid) return;
    const picked = [...secOverlay.querySelectorAll("#secChecks input:checked")].map(i => i.value);
    const saveBtn2 = secOverlay.querySelector("#secSave");
    saveBtn2.disabled = true;
    // Saving turns the filter ON for this teacher. Nothing selected = they see no students.
    staffRef.child(secUid).update({ sections: picked.length ? picked : null, sectionsRestricted: true })
      .then(closeSections)
      .catch(err => {
        const a = secOverlay.querySelector("#secAlert");
        a.textContent = "Could not save: " + err.message;
        a.classList.add("show");
      })
      .finally(() => { saveBtn2.disabled = false; });
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("tName").value.trim();
    const email = document.getElementById("tEmail").value.trim().toLowerCase();
    const password = document.getElementById("tPassword").value;
    const newRole = document.getElementById("tRole").value === "admin" ? "admin" : "teacher";
    const saveBtn = document.getElementById("saveBtn");

    if (!name || !email || password.length < 6) {
      showAlert("Fill in a name, email, and a password of at least 6 characters.");
      return;
    }
    if (!AppAuth.isAllowedEmail(email)) {
      showAlert("Emails must end in " + AppAuth.ALLOWED_DOMAIN);
      return;
    }

    hideAlert();
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Creating…';

    const secondaryAuth = getSecondaryAuth();
    secondaryAuth.createUserWithEmailAndPassword(email, password)
      .then(cred => {
        const uid = cred.user.uid;
        const rec = {
          name, email, role: newRole,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        if (newRole === "teacher") rec.sectionsRestricted = true; // new teacher: filtered until sections are set
        return db.ref("staff/" + uid).set(rec).then(() => secondaryAuth.signOut());
      })
      .then(() => {
        form.reset();
        modal.classList.add("hidden");
      })
      .catch(err => showAlert(err.code === "auth/email-already-in-use"
        ? "That email already has a login. Ask them to use “Request an account” on the register page (with the password they already use), then approve them here."
        : err.message.replace("Firebase: ", "")))
      .finally(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = "Create account";
      });
  });

  document.getElementById("addBtn").addEventListener("click", () => {
    form.reset(); hideAlert(); modal.classList.remove("hidden");
  });
  document.querySelectorAll("[data-close]").forEach(b =>
    b.addEventListener("click", () => modal.classList.add("hidden")));

  function showAlert(msg) { alertBox.textContent = msg; alertBox.classList.add("show"); }
  function hideAlert() { alertBox.classList.remove("show"); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
});
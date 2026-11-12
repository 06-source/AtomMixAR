/**
 * AtomMixAR — Admin: students.
 */
AppAuth.requireRole("admin", function () {
  const rootRef = db.ref();
  const usersRef = db.ref("users");
  const rosterRef = db.ref("students");
  const tbody = document.getElementById("studentsBody");
  const empty = document.getElementById("emptyState");
  const modal = document.getElementById("studentModal");
  const form = document.getElementById("studentForm");
  const modalTitle = document.getElementById("modalTitle");
  const alertBox = document.getElementById("formAlert");

  const addBtn = document.getElementById("addBtn");
  if (addBtn) addBtn.classList.add("hidden");

  const SCHOOL_DOMAIN = "@cscqc.edu.ph";

  let users = {};
  let roster = {};
  let editingId = null;

  usersRef.on("value", snap => {
    users = snap.val() || {};
    renderTable();
  }, err => {
    console.error("Cannot read users:", err);
    empty.classList.remove("hidden");
  });

  rosterRef.on("value", snap => {
    roster = snap.val() || {};
    renderTable();
  }, err => console.error("Cannot read students:", err));

  // Prefix lang (ginagamit sa pag-save sa students/{uid}.code)
  function codeOf(u) {
    return String(u.email || "").split("@")[0];
  }

  // Buong CSCQC email (kung walang domain ang nakasave, idadagdag)
  function emailOf(u) {
    const e = String(u.email || "").trim();
    if (!e) return "";
    return e.includes("@") ? e : e + SCHOOL_DOMAIN;
  }

  // Max students shown when the search box is empty
  const LIMIT = 20;
  const searchBox = document.getElementById("searchBox");
  const countNote = document.getElementById("countNote");
  if (searchBox) searchBox.addEventListener("input", renderTable);

  // When the student registered, if the game saved it (any of these field names).
  function registeredAt(u) {
    const v = u.createdAt || u.createdAtMs || u.registeredAt || u.dateCreated || u.created || u.timestamp || 0;
    const n = typeof v === "number" ? v : Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }

  function sectionOf(id) {
    const u = users[id] || {};
    return (roster[id] && roster[id].section) || u.section || "";
  }

  function renderTable() {
    const allIds = Object.keys(users);
    const q = searchBox ? searchBox.value.trim().toLowerCase() : "";

    // Newest first (alphabetical when the registration time is unknown)
    allIds.sort((a, b) =>
      (registeredAt(users[b] || {}) - registeredAt(users[a] || {})) ||
      (users[a].username || "").localeCompare(users[b].username || ""));

    let ids, note;
    if (q) {
      // Search looks through ALL students, not just the latest 20
      ids = allIds.filter(id => {
        const u = users[id] || {};
        return [u.username, emailOf(u), sectionOf(id)].join(" ").toLowerCase().includes(q);
      });
      note = ids.length + " of " + allIds.length + " students match “" + searchBox.value.trim() + "”";
    } else {
      ids = allIds.slice(0, LIMIT);
      note = allIds.length > LIMIT
        ? "Showing the latest " + LIMIT + " of " + allIds.length + " students. Use search to find anyone else."
        : allIds.length + " student" + (allIds.length === 1 ? "" : "s");
    }
    if (countNote) countNote.textContent = allIds.length ? note : "";

    tbody.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);
    if (!ids.length) {
      empty.innerHTML = q
        ? "<strong>No matching students</strong>Try a different name, email or section."
        : "<strong>No student accounts yet</strong>Students appear here after they register inside the game.";
    }

    ids.forEach(id => {
      const u = users[id] || {};
      const section = sectionOf(id);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(u.username || "—")}</td>
        <td>${escapeHtml(emailOf(u) || "—")}</td>
        <td>${escapeHtml(section || "—")}</td>
        <td class="row">
          <button class="btn-sm" data-edit="${escapeAttr(id)}">Edit Section</button>
          <button class="btn-sm" style="color:#c62828;border-color:#c62828" data-delete="${escapeAttr(id)}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(b.dataset.edit)));
    tbody.querySelectorAll("[data-delete]").forEach(b =>
      b.addEventListener("click", () => deleteStudent(b.dataset.delete)));
  }

  function deleteStudent(id) {
    const u = users[id];
    if (!u) return;

    const label = (u.username || "this student") + " (" + (emailOf(u) || id) + ")";
    const ok = confirm(
      "Delete " + label + "?\n\n" +
      "This permanently removes the student's account record, section and all quiz scores. " +
      "This cannot be undone."
    );
    if (!ok) return;

    // Isang atomic na delete: kung may isang path na hindi pinayagan, walang made-delete.
    const updates = {};
    updates["users/" + id] = null;
    updates["students/" + id] = null;
    updates["scores/" + id] = null;

    rootRef.update(updates)
      .catch(err => {
        console.error("Delete failed:", err);
        alert("Could not delete the student: " + err.message);
      });
    // Awtomatikong mawawala sa table dahil nakikinig ang usersRef.on("value").
  }

  function openModal(id) {
    const u = users[id];
    if (!u) return;
    editingId = id;
    form.reset();
    hideAlert();
    modalTitle.textContent = "Edit Student Section";

    const nameEl = document.getElementById("sName");
    const codeEl = document.getElementById("sCode");
    nameEl.value = u.username || "";
    codeEl.value = emailOf(u);
    nameEl.readOnly = true;
    codeEl.readOnly = true;

    // Ilagay sa input field ang kasalukuyang section
    const sectionInput = document.getElementById("sSection") || document.getElementById("sGrade");
    if (sectionInput) {
      sectionInput.value = (roster[id] && roster[id].section) || u.section || "";
    }

    modal.classList.remove("hidden");
  }

  function closeModal() { modal.classList.add("hidden"); editingId = null; }

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!editingId || !users[editingId]) return;

    const u = users[editingId];
    const sectionInput = document.getElementById("sSection") || document.getElementById("sGrade");
    const section = sectionInput ? sectionInput.value.trim() : "";

    rosterRef.child(editingId)
      .update({
        name: u.username || "",
        code: codeOf(u),
        section: section,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      })
      .then(closeModal)
      .catch(err => showAlert(err.message));
  });

  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));

  function showAlert(msg) { alertBox.textContent = msg; alertBox.classList.add("show"); }
  function hideAlert() { alertBox.classList.remove("show"); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str || ""); }
});
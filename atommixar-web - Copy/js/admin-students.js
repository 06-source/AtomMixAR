/**
 * AtomMixAR — Admin: students.
 *
 * Students register inside the Unity game, which saves them at
 *   users/{uid} = { username, email }
 * This page lists those accounts. The student code is the part of the school
 * email before the "@". The admin can add a class/grade label, which is saved at
 *   students/{uid} = { name, code, grade, updatedAt }
 * (name and code are copied from the game account, they are not edited here).
 */
AppAuth.requireRole("admin", function () {
  const usersRef = db.ref("users");
  const rosterRef = db.ref("students");
  const tbody = document.getElementById("studentsBody");
  const empty = document.getElementById("emptyState");
  const modal = document.getElementById("studentModal");
  const form = document.getElementById("studentForm");
  const modalTitle = document.getElementById("modalTitle");
  const alertBox = document.getElementById("formAlert");

  // Students are created by the game, not here.
  const addBtn = document.getElementById("addBtn");
  if (addBtn) addBtn.classList.add("hidden");

  let users = {};
  let roster = {};
  let editingId = null;

  usersRef.on("value", snap => {
    users = snap.val() || {};
    renderTable();
  }, err => {
    console.error("Cannot read users (check the database rules):", err);
    empty.classList.remove("hidden");
  });

  rosterRef.on("value", snap => {
    roster = snap.val() || {};
    renderTable();
  }, err => console.error("Cannot read students:", err));

  function codeOf(u) {
    return String(u.email || "").split("@")[0];
  }

  // NEW: adds a "Section" column header automatically (no HTML change needed)
  function addSectionHeader(tbodyEl, afterIndex) {
    const table = tbodyEl.closest("table");
    const headRow = table && table.querySelector("thead tr");
    if (!headRow || headRow.querySelector("[data-section-th]")) return;
    const th = document.createElement("th");
    th.textContent = "Section";
    th.setAttribute("data-section-th", "1");
    headRow.insertBefore(th, headRow.children[afterIndex + 1] || null);
  }

  function renderTable() {
    const ids = Object.keys(users);
    addSectionHeader(tbody, 1);   // NEW
    tbody.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);

    ids
      .sort((a, b) => (users[a].username || "").localeCompare(users[b].username || ""))
      .forEach(id => {
        const u = users[id] || {};
        const grade = (roster[id] && roster[id].grade) || "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(u.username || "—")}</td>
          <td>${escapeHtml(codeOf(u) || "—")}</td>
          <td>${escapeHtml(u.section || "—")}</td>
          <td>${escapeHtml(grade || "—")}</td>
          <td class="row">
            <button class="btn-sm" data-edit="${escapeAttr(id)}">Set class</button>
          </td>`;
        tbody.appendChild(tr);
      });

    tbody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(b.dataset.edit)));
  }

  function openModal(id) {
    const u = users[id];
    if (!u) return;
    editingId = id;
    form.reset();
    hideAlert();
    modalTitle.textContent = "Student class";

    const nameEl = document.getElementById("sName");
    const codeEl = document.getElementById("sCode");
    nameEl.value = u.username || "";
    codeEl.value = codeOf(u);
    nameEl.readOnly = true;
    codeEl.readOnly = true;
    document.getElementById("sGrade").value = (roster[id] && roster[id].grade) || "";

    modal.classList.remove("hidden");
  }

  function closeModal() { modal.classList.add("hidden"); editingId = null; }

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!editingId || !users[editingId]) return;

    const u = users[editingId];
    const grade = document.getElementById("sGrade").value.trim();

    rosterRef.child(editingId)
      .update({
        name: u.username || "",
        code: codeOf(u),
        grade,
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
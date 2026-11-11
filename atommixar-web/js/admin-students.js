/**
 * AtomMixAR — Admin: students.
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

  const addBtn = document.getElementById("addBtn");
  if (addBtn) addBtn.classList.add("hidden");

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

  function codeOf(u) {
    return String(u.email || "").split("@")[0];
  }

  function renderTable() {
    const ids = Object.keys(users);
    tbody.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);

    ids
      .sort((a, b) => (users[a].username || "").localeCompare(users[b].username || ""))
      .forEach(id => {
        const u = users[id] || {};
        // Kinukuha ang section mula sa roster kung na-edit na, o sa users kung wala pa
        const section = (roster[id] && roster[id].section) || u.section || "";
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(u.username || "—")}</td>
          <td>${escapeHtml(codeOf(u) || "—")}</td>
          <td>${escapeHtml(section || "—")}</td>
          <td class="row">
            <button class="btn-sm" data-edit="${escapeAttr(id)}">Edit Section</button>
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
    modalTitle.textContent = "Edit Student Section";

    const nameEl = document.getElementById("sName");
    const codeEl = document.getElementById("sCode");
    nameEl.value = u.username || "";
    codeEl.value = codeOf(u);
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
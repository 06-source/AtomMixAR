/**
 * AtomMixAR — Teacher: review scores.
 * Scores are written by the Unity game when a student finishes a quiz:
 *   scores/{uid}/{quizID}/{pushId} = { studentID, quizID, score, totalQuestions, percentage, date, quizVersion }
 * Students are shown by CSC ID (the school email before the @); quiz titles from quizzes/{quizID}.
 * This page is read-only aside from removing bad/duplicate entries.
 *
 * SECTION FILTER: a teacher whose sections were set by the admin
 * (staff/{uid}/sections) only sees students from those sections.
 * A student's section is set by the admin in students/{uid}/section.
 */
AppAuth.requireRole("teacher", function (user, profile) {
  const scoresRef = db.ref("scores");
  const tbody = document.getElementById("scoresBody");
  const empty = document.getElementById("emptyState");
  const filterSelect = document.getElementById("quizFilter");
  const statAvg = document.getElementById("statAvg");
  const statCount = document.getElementById("statCount");
  const statTop = document.getElementById("statTop");

  let scores = {};
  let users = {};
  let roster = {};

  // Para makuha ang email (CSC ID) ng bawat student
  db.ref("users").on("value", snap => {
    users = snap.val() || {};
    renderTable();
  }, err => console.warn("Cannot read users:", err));

  // Section ng bawat student (sinesave ng admin sa students/{uid}/section)
  db.ref("students").on("value", snap => {
    roster = snap.val() || {};
    renderTable();
  }, err => console.warn("Cannot read students (check database rules):", err));

  ScoreUtil.watch(list => {
    scores = {};
    list.forEach(r => { scores[r.id] = r; });
    renderTable();
  });

  filterSelect.addEventListener("change", renderTable);

  // CSC ID = bahagi ng email bago ang @
  function cscId(s) {
    const email = s.studentEmail || (users[s.uid] && users[s.uid].email) || "";
    if (email.indexOf("@") > 0) return email.split("@")[0];
    return (s.studentName || "—").trim();
  }

  // Section: galing sa roster (admin), fallback sa users/{uid}/section
  function sectionOf(s) {
    const r = roster[s.uid];
    const u = users[s.uid];
    return (r && r.section) || (u && u.section) || "";
  }

  // Makikita lang ng teacher ang students sa sections na hawak niya
  function isVisible(s) {
    return AppAuth.canSeeSection(profile, sectionOf(s));
  }

  // adds a "Section" column header automatically (no HTML change needed)
  function addSectionHeader(tbodyEl, afterIndex) {
    const table = tbodyEl.closest("table");
    const headRow = table && table.querySelector("thead tr");
    if (!headRow || headRow.querySelector("[data-section-th]")) return;
    const th = document.createElement("th");
    th.textContent = "Section";
    th.setAttribute("data-section-th", "1");
    headRow.insertBefore(th, headRow.children[afterIndex + 1] || null);
  }

  function populateFilter(visibleScores) {
    const titles = new Set(visibleScores.map(s => s.quizTitle).filter(Boolean));
    const current = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All quizzes</option>' +
      [...titles].sort().map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
    filterSelect.value = current;
  }

  function renderTable() {
    addSectionHeader(tbody, 0);

    // Section filter muna bago ang lahat
    const visibleScores = Object.values(scores).filter(isVisible);
    populateFilter(visibleScores);

    const filter = filterSelect.value;
    const rows = Object.entries(scores)
      .filter(([, s]) => isVisible(s))
      .filter(([, s]) => !filter || s.quizTitle === filter)
      .sort(([, a], [, b]) => (b.date || 0) - (a.date || 0));

    tbody.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);

    let sumPct = 0, withPct = 0, best = null;
    rows.forEach(([id, s]) => {
      const pct = s.total ? Math.round((s.score / s.total) * 100) : null;
      const sid = cscId(s);

      if (pct !== null) {
        sumPct += pct;
        withPct++;
        if (!best || pct > best.pct) best = { id: sid, pct, quiz: s.quizTitle || "" };
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(sid)}</td>
        <td>${escapeHtml(sectionOf(s) || "—")}</td>
        <td>${escapeHtml(s.quizTitle || "—")}</td>
        <td>${s.total ? `${s.score} / ${s.total}${pct !== null ? ` (${pct}%)` : ""}` : (s.score ?? "—")}</td>
        <td>${s.date ? new Date(s.date).toLocaleDateString() : "—"}</td>
        <td><button class="btn-sm btn-ghost" data-delete="${escapeAttr(id)}">Remove</button></td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-delete]").forEach(b =>
      b.addEventListener("click", () => {
        if (confirm("Remove this score entry?")) scoresRef.child(b.dataset.delete).remove();
      }));

    statCount.textContent = rows.length;
    statAvg.textContent = withPct ? Math.round(sumPct / withPct) + "%" : "—";
    statTop.textContent = best
      ? `${best.id} (${best.pct}%)${best.quiz ? " · " + best.quiz : ""}`
      : "—";
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str || ""); }
});
/**
 * AtomMixAR — Teacher: review scores.
 * Scores are written by the Unity game when a student finishes a quiz:
 *   scores/{uid}/{quizID}/{pushId} = { studentID, quizID, score, totalQuestions, percentage, date, quizVersion }
 * Students are shown by CSC ID (the school email before the @); quiz titles from quizzes/{quizID}.
 * This page is read-only aside from removing bad/duplicate entries.
 * ARCHIVED RESULTS: when a quiz is replaced (teacher-quizzes), its student records move to
 *   quizArchive/{key}/results and are shown in the separate "Archived results" table below.
 *
 * SECTION FILTER: a teacher whose sections were set by the admin
 * (staff/{uid}/sections) only sees students from those sections.
 * A student's section is set by the admin in students/{uid}/section.
 *
 * LIMIT: kapag walang search, pinakabagong 20 lang ang ipinapakita.
 */
AppAuth.requireRole("teacher", function (user, profile) {
  const scoresRef = db.ref("scores");
  const tbody = document.getElementById("scoresBody");
  const empty = document.getElementById("emptyState");
  const filterSelect = document.getElementById("quizFilter");
  const searchBox = document.getElementById("searchBox");
  const countNote = document.getElementById("countNote");
  const statAvg = document.getElementById("statAvg");
  const statCount = document.getElementById("statCount");
  const statTop = document.getElementById("statTop");

  const LIMIT = 20;

  let scores = {};
  let users = {};
  let roster = {};
  let archives = {};   // quizArchive/{key} = { title, archivedAt, results: {uid:{quizID:{pushId:rec}}} }

  const archSection = document.getElementById("archiveSection");
  const archBody = document.getElementById("archBody");
  const archEmpty = document.getElementById("archEmpty");
  const archNote = document.getElementById("archNote");
  const archSearch = document.getElementById("archSearch");
  const archQuiz = document.getElementById("archQuiz");

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

  // Mga record ng quiz na na-delete / napalitan
  db.ref("quizArchive").on("value", snap => {
    archives = snap.val() || {};
    renderTable();
  }, err => console.warn("Cannot read quizArchive (check database rules):", err));

  // Flat list ng archived results (may title at petsa ng pag-archive)
  function archivedList() {
    const out = [];
    Object.entries(archives).forEach(([key, a]) => {
      if (!a || !a.results) return;
      ScoreUtil.list(a.results, { users: users, quizzes: {} }).forEach(r => {
        r.quizTitle = r.quizTitle || a.title || r.quizId;
        r.archivedAt = a.archivedAt || 0;
        r.archiveKey = key;
        out.push(r);
      });
    });
    return out;
  }

  filterSelect.addEventListener("change", renderTable);
  archSearch.addEventListener("input", () => renderArchive());
  archQuiz.addEventListener("change", () => renderArchive());
  if (searchBox) searchBox.addEventListener("input", renderTable);

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
    const q = searchBox ? searchBox.value.trim().toLowerCase() : "";

    // Lahat ng tugma sa quiz filter at search, pinakabago muna
    const matches = Object.entries(scores)
      .filter(([, s]) => isVisible(s))
      .filter(([, s]) => !filter || s.quizTitle === filter)
      .filter(([, s]) => !q || [cscId(s), sectionOf(s), s.quizTitle || ""].join(" ").toLowerCase().includes(q))
      .sort(([, a], [, b]) => (b.date || 0) - (a.date || 0));

    // Walang search: pinakabagong 20 lang. May search: lahat ng tugma.
    const rows = q ? matches : matches.slice(0, LIMIT);

    if (countNote) {
      if (!matches.length) countNote.textContent = "";
      else if (q) countNote.textContent = matches.length + " result" + (matches.length === 1 ? "" : "s") + " match “" + searchBox.value.trim() + "”";
      else if (matches.length > LIMIT) countNote.textContent = "Showing the latest " + LIMIT + " of " + matches.length + " results. Use search to find anyone else.";
      else countNote.textContent = matches.length + " result" + (matches.length === 1 ? "" : "s");
    }

    tbody.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);

    // Stats: sa lahat ng tugma, hindi lang sa 20 na nakikita
    let sumPct = 0, withPct = 0, best = null;
    matches.forEach(([, s]) => {
      const pct = s.total ? Math.round((s.score / s.total) * 100) : null;
      if (pct !== null) {
        sumPct += pct;
        withPct++;
        if (!best || pct > best.pct) best = { id: cscId(s), pct, quiz: s.quizTitle || "" };
      }
    });

    rows.forEach(([id, s]) => {
      const pct = s.total ? Math.round((s.score / s.total) * 100) : null;
      const sid = cscId(s);

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

    statCount.textContent = matches.length;
    statAvg.textContent = withPct ? Math.round(sumPct / withPct) + "%" : "—";
    statTop.textContent = best
      ? `${best.id} (${best.pct}%)${best.quiz ? " · " + best.quiz : ""}`
      : "—";

    renderArchive();
  }

  // Hiwalay na table: records ng mga quiz na na-delete na.
  // May sariling search at quiz filter. Walang search: pinakabagong LIMIT lang.
  function renderArchive() {
    const all = archivedList().filter(isVisible);
    archSection.classList.toggle("hidden", all.length === 0);
    if (!all.length) return;

    // Mga pangalan ng na-delete na quiz (para sa dropdown)
    const titles = [...new Set(all.map(s => s.quizTitle).filter(Boolean))].sort();
    const cur = archQuiz.value;
    archQuiz.innerHTML = '<option value="">All deleted quizzes</option>' +
      titles.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
    archQuiz.value = titles.includes(cur) ? cur : "";

    const filter = archQuiz.value;
    const q = archSearch.value.trim().toLowerCase();

    const matches = all
      .filter(s => !filter || s.quizTitle === filter)
      .filter(s => !q || [cscId(s), sectionOf(s), s.quizTitle || ""].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.date || 0) - (a.date || 0));

    const rows = (q || filter) ? matches : matches.slice(0, LIMIT);

    if (!matches.length) archNote.textContent = "";
    else if (q || filter) archNote.textContent = matches.length + " archived result" + (matches.length === 1 ? "" : "s") + " found";
    else if (matches.length > LIMIT) archNote.textContent = "Showing the latest " + LIMIT + " of " + matches.length + " archived results. Use search to find anyone else.";
    else archNote.textContent = matches.length + " archived result" + (matches.length === 1 ? "" : "s");

    archEmpty.classList.toggle("hidden", rows.length > 0);

    archBody.innerHTML = rows.map(s => {
      const pct = s.total ? Math.round((s.score / s.total) * 100) : null;
      return `<tr>
        <td>${escapeHtml(cscId(s))}</td>
        <td>${escapeHtml(sectionOf(s) || "—")}</td>
        <td>${escapeHtml(s.quizTitle || "—")}</td>
        <td>${s.total ? `${s.score} / ${s.total}${pct !== null ? ` (${pct}%)` : ""}` : (s.score ?? "—")}</td>
        <td>${s.date ? new Date(s.date).toLocaleDateString() : "—"}</td>
        <td>${s.archivedAt ? new Date(s.archivedAt).toLocaleDateString() : "—"}</td>
      </tr>`;
    }).join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str || ""); }
});
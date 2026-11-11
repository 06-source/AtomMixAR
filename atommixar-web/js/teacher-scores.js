/**
 * AtomMixAR — Teacher: review scores.
 * Scores are written by the Unity game when a student finishes a quiz:
 *   scores/{uid}/{quizID}/{pushId} = { studentID, quizID, score, totalQuestions, percentage, date, quizVersion }
 * Students are shown by CSC ID (the school email before the @); quiz titles from quizzes/{quizID}.
 * This page is read-only aside from removing bad/duplicate entries
 * and (TEMPORARY) editing each student's Section.
 */
AppAuth.requireRole("teacher", function () {
  const scoresRef = db.ref("scores");
  const tbody = document.getElementById("scoresBody");
  const empty = document.getElementById("emptyState");
  const filterSelect = document.getElementById("quizFilter");
  const statAvg = document.getElementById("statAvg");
  const statCount = document.getElementById("statCount");
  const statTop = document.getElementById("statTop");

  let scores = {};
  let users = {};

  // Para makuha ang email (CSC ID) ng bawat student
  db.ref("users").on("value", snap => {
    users = snap.val() || {};
    renderTable();
  }, err => console.warn("Cannot read users:", err));

  ScoreUtil.watch(list => {
    scores = {};
    list.forEach(r => { scores[r.id] = r; });
    populateFilter();
    renderTable();
  });

  filterSelect.addEventListener("change", renderTable);

  // CSC ID = bahagi ng email bago ang @
  function cscId(s) {
    const email = s.studentEmail || (users[s.uid] && users[s.uid].email) || "";
    if (email.indexOf("@") > 0) return email.split("@")[0];
    return (s.studentName || "—").trim();
  }

  // Year level & section galing sa users/{uid}/section
  function sectionOf(s) {
    return (users[s.uid] && users[s.uid].section) || "—";
  }

  // Save section sa users/{uid}/section (Enter o click sa labas para ma-save)
  function saveSection(inp) {
    const uid = inp.dataset.uid;
    const value = inp.value.trim();
    const ref = db.ref("users/" + uid + "/section");
    const op = value ? ref.set(value) : ref.remove();
    op.then(() => {
      inp.style.borderColor = "#22c55e";
      setTimeout(() => (inp.style.borderColor = "#cbd5e1"), 1200);
    }).catch(err => {
      console.error("Cannot save section:", err);
      inp.style.borderColor = "#ef4444";
      alert("Hindi na-save ang section. Check mo ang database rules.");
    });
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

  function populateFilter() {
    const titles = new Set(Object.values(scores).map(s => s.quizTitle).filter(Boolean));
    const current = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All quizzes</option>' +
      [...titles].sort().map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
    filterSelect.value = current;
  }

  function renderTable() {
    const filter = filterSelect.value;
    addSectionHeader(tbody, 0);
    const rows = Object.entries(scores)
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

      const sec = sectionOf(s);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(sid)}</td>
        <td>${s.uid
          ? `<input class="section-input" data-uid="${escapeAttr(s.uid)}"
               value="${escapeAttr(sec === "—" ? "" : sec)}"
               placeholder="e.g. GR.12 HE"
               style="width:110px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font:inherit">`
          : "—"}</td>
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

    tbody.querySelectorAll(".section-input").forEach(inp =>
      inp.addEventListener("change", () => saveSection(inp)));

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
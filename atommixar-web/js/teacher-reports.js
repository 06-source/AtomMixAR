/**
 * AtomMixAR — Teacher: feedback reports built from the scores the game saves.
 * A teacher whose sections were set by the admin only sees students
 * from those sections.
 */
AppAuth.requireRole("teacher", function (user, profile) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const STRONG = 85, SUPPORT = 75;
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  let scores = [];
  let users = {};
  let roster = {};

  // Para makuha ang email (CSC ID) ng bawat student
  db.ref("users").on("value", snap => {
    users = snap.val() || {};
    render();
  }, err => console.warn("Cannot read users:", err));

  // Section ng bawat student (sinesave ng admin sa students/{uid}/section)
  db.ref("students").on("value", snap => {
    roster = snap.val() || {};
    render();
  }, err => console.warn("Cannot read students (check database rules):", err));

  ScoreUtil.watch(list => { scores = list; render(); });
  $("quizFilter").addEventListener("change", render);
  $("printBtn").addEventListener("click", () => window.print());

  // Section: galing sa roster (admin), fallback sa users/{uid}/section
  function sectionOfUid(uid) {
    const r = roster[uid];
    const u = users[uid];
    return (r && r.section) || (u && u.section) || "";
  }

  // Makikita lang ng teacher ang students sa sections na hawak niya
  function isVisible(s) {
    return AppAuth.canSeeSection(profile, sectionOfUid(s.uid));
  }

  function fillFilter(visibleScores) {
    const cur = $("quizFilter").value;
    const titles = [...new Set(visibleScores.map(s => s.quizTitle).filter(Boolean))].sort();
    $("quizFilter").innerHTML = '<option value="">All quizzes</option>' + titles.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
    $("quizFilter").value = cur;
  }

  function status(p) {
    return p >= STRONG ? '<span class="tag tag-teacher">Strong</span>'
      : p >= SUPPORT ? '<span class="tag tag-admin">On track</span>'
      : '<span class="tag" style="background:var(--danger-dim);color:var(--danger)">Needs support</span>';
  }

  // CSC ID = bahagi ng email bago ang @
  function cscId(s) {
    const email = s.studentEmail || (users[s.uid] && users[s.uid].email) || "";
    if (email.indexOf("@") > 0) return email.split("@")[0];
    return (s.studentName || "Unknown").trim();
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

  function render() {
    addSectionHeader($("studBody"), 0);

    // Section filter muna bago ang lahat
    const visibleScores = scores.filter(isVisible);
    fillFilter(visibleScores);

    const f = $("quizFilter").value;
    const rows = visibleScores.filter(s => s.total && (!f || s.quizTitle === f)).map(s => ({
      uid: s.uid,
      id: cscId(s),
      quiz: s.quizTitle || "Untitled",
      score: s.score,
      total: s.total,
      pct: Math.round(s.score / s.total * 100),
      date: s.date || 0
    }));

    const byStudent = {}, byQuiz = {};
    rows.forEach(r => {
      // group by account, para hindi magsama ang magkaibang student
      const k = r.uid || r.id.toLowerCase();
      (byStudent[k] = byStudent[k] || {
        id: r.id,
        section: sectionOfUid(r.uid) || "—",
        list: []
      }).list.push(r);
      (byQuiz[r.quiz] = byQuiz[r.quiz] || []).push(r);
    });

    const studs = Object.values(byStudent).map(st => {
      const per = {};
      st.list.forEach(r => (per[r.quiz] = per[r.quiz] || []).push(r.pct));
      const qa = Object.entries(per).map(([t, p]) => [t, avg(p)]).sort((a, b) => b[1] - a[1]);
      const latest = st.list.slice().sort((a, b) => b.date - a.date)[0];
      return {
        id: st.id,
        section: st.section,
        n: st.list.length,
        latest,
        best: st.list.reduce((a, b) => (b.pct > a.pct ? b : a)),
        top: qa[0],
        low: qa.length > 1 && qa[qa.length - 1][1] < qa[0][1] ? qa[qa.length - 1] : null
      };
    }).sort((a, b) => a.latest.pct - b.latest.pct);

    $("generated").textContent = "Generated " + new Date().toLocaleString();
    $("statStudents").textContent = studs.length;
    $("statAvg").textContent = rows.length ? Math.round(avg(rows.map(r => r.pct))) + "%" : "—";
    $("statSupport").textContent = studs.filter(s => s.latest.pct < SUPPORT).length;
    $("emptyState").classList.toggle("hidden", studs.length > 0);

    $("studBody").innerHTML = studs.map(s => `<tr>
      <td>${esc(s.id)}</td>
      <td>${esc(s.section)}</td>
      <td>${s.n}</td>
      <td>${s.latest.score} / ${s.latest.total}</td>
      <td>${s.best.pct}% · ${esc(s.best.quiz)}</td>
      <td>${s.latest.pct}%${s.latest.date ? " · " + new Date(s.latest.date).toLocaleDateString() : ""}</td>
      <td>${status(s.latest.pct)}</td>
      <td>${esc(s.top[0])}${s.low ? " / " + esc(s.low[0]) : ""}</td></tr>`).join("");

    $("quizBody").innerHTML = Object.entries(byQuiz).sort((a, b) => a[0].localeCompare(b[0])).map(([t, l]) => `<tr>
      <td>${esc(t)}</td><td>${l.length}</td><td>${Math.round(avg(l.map(r => r.pct)))}%</td>
      <td>${l.filter(r => r.pct < SUPPORT).length}</td></tr>`).join("");
  }
});
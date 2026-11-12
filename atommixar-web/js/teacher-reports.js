/**
 * AtomMixAR — Teacher: feedback reports built from the scores the game saves.
 * A teacher whose sections were set by the admin only sees students
 * from those sections.
 *
 * LIMIT: kapag walang search, pinakabagong 20 students lang ang ipinapakita.
 * EXPORT: Save as PDF / Excel ay lahat ng tugma sa filter at search (hindi lang 20).
 */
AppAuth.requireRole("teacher", function (user, profile) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const STRONG = 85, SUPPORT = 75;
  const LIMIT = 20;
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  let scores = [];
  let users = {};
  let roster = {};

  // Laman ng huling render, para sa PDF/Excel
  let exportData = { title: "", stats: "", studHead: [], studRows: [], quizHead: [], quizRows: [] };

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
  $("searchBox").addEventListener("input", render);
  $("printBtn").addEventListener("click", () => window.print());
  $("pdfBtn").addEventListener("click", exportPdf);
  $("xlsBtn").addEventListener("click", exportExcel);

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

  function statusText(p) {
    return p >= STRONG ? "Strong" : p >= SUPPORT ? "On track" : "Needs support";
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
    const q = ($("searchBox").value || "").trim().toLowerCase();

    const rows = visibleScores.filter(s => s.total && (!f || s.quizTitle === f)).map(s => ({
      uid: s.uid,
      id: cscId(s),
      quiz: s.quizTitle || "Untitled",
      score: s.score,
      total: s.total,
      pct: Math.round(s.score / s.total * 100),
      date: s.date || 0
    }));

    const byStudent = {};
    rows.forEach(r => {
      // group by account, para hindi magsama ang magkaibang student
      const k = r.uid || r.id.toLowerCase();
      (byStudent[k] = byStudent[k] || {
        id: r.id,
        section: sectionOfUid(r.uid) || "—",
        list: []
      }).list.push(r);
    });

    const allStuds = Object.values(byStudent).map(st => {
      const per = {};
      st.list.forEach(r => (per[r.quiz] = per[r.quiz] || []).push(r.pct));
      const qa = Object.entries(per).map(([t, p]) => [t, avg(p)]).sort((a, b) => b[1] - a[1]);
      const latest = st.list.slice().sort((a, b) => b.date - a.date)[0];
      return {
        id: st.id,
        section: st.section,
        list: st.list,
        n: st.list.length,
        latest,
        best: st.list.reduce((a, b) => (b.pct > a.pct ? b : a)),
        top: qa[0],
        low: qa.length > 1 && qa[qa.length - 1][1] < qa[0][1] ? qa[qa.length - 1] : null
      };
    });

    // Lahat ng tugma sa search
    const matches = (q
      ? allStuds.filter(s => (s.id + " " + s.section).toLowerCase().includes(q))
      : allStuds
    ).sort((a, b) => a.latest.pct - b.latest.pct);

    // Walang search: pinakabagong 20 students (ayon sa huling attempt), tapos Needs support muna
    const shown = (q
      ? matches.slice()
      : matches.slice().sort((a, b) => b.latest.date - a.latest.date).slice(0, LIMIT)
    ).sort((a, b) => a.latest.pct - b.latest.pct);

    // Stats at By quiz: sa lahat ng tugma
    const matchRows = [].concat(...matches.map(s => s.list));
    const byQuiz = {};
    matchRows.forEach(r => (byQuiz[r.quiz] = byQuiz[r.quiz] || []).push(r));

    const generated = "Generated " + new Date().toLocaleString();
    $("generated").textContent = generated;
    $("statStudents").textContent = matches.length;
    $("statAvg").textContent = matchRows.length ? Math.round(avg(matchRows.map(r => r.pct))) + "%" : "—";
    $("statSupport").textContent = matches.filter(s => s.latest.pct < SUPPORT).length;
    $("emptyState").classList.toggle("hidden", shown.length > 0);

    const note = $("countNote");
    if (!matches.length) note.textContent = "";
    else if (q) note.textContent = matches.length + " student" + (matches.length === 1 ? "" : "s") + " match “" + $("searchBox").value.trim() + "”";
    else if (matches.length > LIMIT) note.textContent = "Showing the latest " + LIMIT + " of " + matches.length + " students. Use search to find anyone else.";
    else note.textContent = matches.length + " student" + (matches.length === 1 ? "" : "s");

    $("studBody").innerHTML = shown.map(s => `<tr>
      <td>${esc(s.id)}</td>
      <td>${esc(s.section)}</td>
      <td>${s.n}</td>
      <td>${s.latest.score} / ${s.latest.total}</td>
      <td>${s.best.pct}% · ${esc(s.best.quiz)}</td>
      <td>${s.latest.pct}%${s.latest.date ? " · " + new Date(s.latest.date).toLocaleDateString() : ""}</td>
      <td>${status(s.latest.pct)}</td>
      <td>${esc(s.top[0])}${s.low ? " / " + esc(s.low[0]) : ""}</td></tr>`).join("");

    const quizEntries = Object.entries(byQuiz).sort((a, b) => a[0].localeCompare(b[0]));
    $("quizBody").innerHTML = quizEntries.map(([t, l]) => `<tr>
      <td>${esc(t)}</td><td>${l.length}</td><td>${Math.round(avg(l.map(r => r.pct)))}%</td>
      <td>${l.filter(r => r.pct < SUPPORT).length}</td></tr>`).join("");

    // Ihanda ang laman ng PDF/Excel (lahat ng tugma, hindi lang 20)
    exportData = {
      title: "AtomMixAR Feedback Report" + (f ? " - " + f : ""),
      stats: generated + "  |  Students: " + $("statStudents").textContent +
        "  |  Class average: " + $("statAvg").textContent +
        "  |  Need support (below " + SUPPORT + "%): " + $("statSupport").textContent,
      studHead: ["CSC ID", "Section", "Attempts", "Score", "Best", "Latest", "Status", "Strongest / needs practice"],
      studRows: matches.map(s => [
        s.id,
        s.section,
        s.n,
        s.latest.score + " / " + s.latest.total,
        s.best.pct + "% - " + s.best.quiz,
        s.latest.pct + "%" + (s.latest.date ? " - " + new Date(s.latest.date).toLocaleDateString() : ""),
        statusText(s.latest.pct),
        s.top[0] + (s.low ? " / " + s.low[0] : "")
      ]),
      quizHead: ["Quiz", "Attempts", "Average", "Below " + SUPPORT + "%"],
      quizRows: quizEntries.map(([t, l]) => [
        t,
        l.length,
        Math.round(avg(l.map(r => r.pct))) + "%",
        l.filter(r => r.pct < SUPPORT).length
      ])
    };
  }

  function fileName(ext) {
    return "AtomMixAR-report-" + new Date().toISOString().slice(0, 10) + "." + ext;
  }

  function exportPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("The PDF library did not load. Check your internet connection and refresh the page.");
      return;
    }
    if (!exportData.studRows.length) { alert("No results to export."); return; }

    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text(exportData.title, 40, 40);
    doc.setFontSize(9);
    doc.text(exportData.stats, 40, 58);

    doc.autoTable({
      head: [exportData.studHead],
      body: exportData.studRows,
      startY: 72,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 90, 160] }
    });

    doc.setFontSize(12);
    const y = doc.lastAutoTable.finalY + 24;
    doc.text("By quiz", 40, y);
    doc.autoTable({
      head: [exportData.quizHead],
      body: exportData.quizRows,
      startY: y + 8,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 90, 160] }
    });

    doc.save(fileName("pdf"));
  }

  function exportExcel() {
    if (!window.XLSX) {
      alert("The Excel library did not load. Check your internet connection and refresh the page.");
      return;
    }
    if (!exportData.studRows.length) { alert("No results to export."); return; }

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([
      [exportData.title],
      [exportData.stats],
      [],
      exportData.studHead
    ].concat(exportData.studRows));
    ws1["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws1, "By student");

    const ws2 = XLSX.utils.aoa_to_sheet([exportData.quizHead].concat(exportData.quizRows));
    ws2["!cols"] = [{ wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "By quiz");

    XLSX.writeFile(wb, fileName("xlsx"));
  }
});
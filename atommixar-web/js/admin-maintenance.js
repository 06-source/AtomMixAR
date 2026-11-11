/** AtomMixAR — Admin: system maintenance (record counts, cleanup, backup). */
AppAuth.requireRole("admin", function () {
  const $ = id => document.getElementById(id);

  // The "students" counter shows the accounts the game saved at users/.
  const NODES = { students: "users", staff: "staff", quizzes: "quizzes", scores: "scores" };
  const data = { students: {}, staff: {}, quizzes: {}, scores: {} };

  function note(msg, ok) {
    const a = $("mAlert");
    a.textContent = msg;
    a.className = "alert " + (ok ? "alert-ok" : "alert-error") + " show";
  }

  db.ref(".info/connected").on("value", s => {
    $("dbStatus").textContent = s.val() ? "Connected" : "Offline";
  });

  Object.entries(NODES).forEach(([key, node]) => {
    db.ref(node).on("value", s => {
      data[key] = s.val() || {};
      $("cnt-" + key).textContent = key === "scores"
        ? ScoreUtil.list(data[key]).length
        : Object.keys(data[key]).length;
    }, err => console.error("Cannot read " + node + ":", err));
  });

  $("clearBtn").addEventListener("click", () => {
    const days = Number($("ageSel").value);
    const cutoff = Date.now() - days * 86400000;
    const updates = {};
    ScoreUtil.list(data.scores).forEach(r => { if (r.date && r.date < cutoff) updates[r.id] = null; });
    const n = Object.keys(updates).length;
    if (!n) { note("No results are older than that."); return; }
    if (!confirm("Permanently remove " + n + " quiz result" + (n === 1 ? "" : "s") + "?")) return;
    db.ref("scores").update(updates)
      .then(() => note(n + " old result" + (n === 1 ? "" : "s") + " removed.", true))
      .catch(e => note(e.message));
  });

  $("backupBtn").addEventListener("click", () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      users: data.students,
      quizzes: data.quizzes,
      scores: data.scores
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    a.download = "atommixar-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
});
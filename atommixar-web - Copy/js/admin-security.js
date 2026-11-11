/** AtomMixAR — Admin: security overview and account recovery (password reset emails). */
AppAuth.requireRole("admin", function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function note(msg, ok) { const a = $("sAlert"); a.textContent = msg; a.className = "alert " + (ok ? "alert-ok" : "alert-error") + " show"; }

  db.ref("staff").on("value", snap => {
    const all = Object.values(snap.val() || {});
    const staff = all.filter(u => u.role === "admin" || u.role === "teacher");
    $("sAdmins").textContent = staff.filter(u => u.role === "admin").length;
    $("sTeachers").textContent = staff.filter(u => u.role === "teacher").length;
    $("sPending").textContent = all.filter(u => !u.role && u.requestedRole).length;
    $("staffBody").innerHTML = staff.sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(u => `<tr>
      <td>${esc(u.name || "—")}</td><td>${esc(u.email || "—")}</td>
      <td><span class="tag tag-${u.role}">${u.role === "admin" ? "Admin" : "Teacher"}</span></td>
      <td><button class="btn-sm" data-reset="${esc(u.email || "")}">Send reset link</button></td></tr>`).join("");
    document.querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => {
      if (!b.dataset.reset) return;
      auth.sendPasswordResetEmail(b.dataset.reset)
        .then(() => note("Reset link sent to " + b.dataset.reset + ".", true))
        .catch(e => note(e.message.replace("Firebase: ", "")));
    }));
  });
});
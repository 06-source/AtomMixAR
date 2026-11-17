/** AtomMixAR — Teacher: question bank. Works on quizzes/{id}/questions/{qid}; no new database nodes. */
AppAuth.requireRole("teacher", function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const quizzesRef = db.ref("quizzes");
  let quizzes = {}, mode = "add", editing = null;

  quizzesRef.on("value", s => { quizzes = s.val() || {}; fillSelects(); render(); });
  $("search").addEventListener("input", render);
  $("quizFilter").addEventListener("change", render);

  function fillSelects() {
    const opts = Object.entries(quizzes).map(([id, q]) => `<option value="${esc(id)}">${esc(q.title || "Untitled")}</option>`).join("");
    const cur = $("quizFilter").value;
    $("quizFilter").innerHTML = '<option value="">All quizzes</option>' + opts;
    $("quizFilter").value = cur;
    if (!$("qModal").classList.contains("hidden")) return;
    $("mQuiz").innerHTML = opts;
  }

  function render() {
    const f = $("quizFilter").value, term = $("search").value.trim().toLowerCase();
    const rows = [];
    Object.entries(quizzes).forEach(([quizId, q]) => Object.entries(q.questions || {}).forEach(([key, v]) =>
      rows.push({ quizId, key, quiz: q.title || "Untitled", ...v })));
    const shown = rows.filter(r => (!f || r.quizId === f) && (!term || (r.text || "").toLowerCase().includes(term)));
    $("emptyState").classList.toggle("hidden", shown.length > 0);
    $("qBody").innerHTML = shown.map((r, i) => `<tr>
      <td>${esc(r.text || "—")}</td><td>${esc(r.quiz)}</td>
      <td>${esc((r.options || [])[r.correctIndex] || "—")}</td>
      <td class="row"><button class="btn-sm" data-act="edit" data-i="${i}">Edit</button>
        <button class="btn-sm" data-act="copy" data-i="${i}">Copy to…</button>
        <button class="btn-sm btn-danger" data-act="del" data-i="${i}">Delete</button></td></tr>`).join("");
    $("qBody").querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      const r = shown[Number(b.dataset.i)];
      if (b.dataset.act === "del") {
        if (confirm("Delete this question from its quiz?")) quizzesRef.child(r.quizId + "/questions/" + r.key).remove();
      } else openModal(b.dataset.act, r);
    }));
  }

  function openModal(m, r) {
    mode = m; editing = r || null;
    $("qForm").reset(); $("formAlert").classList.remove("show");
    $("mTitle").textContent = m === "edit" ? "Edit question" : m === "copy" ? "Copy question to a quiz" : "Add question";
    if (!Object.keys(quizzes).length) { $("formAlert").textContent = "Create a quiz first."; $("formAlert").classList.add("show"); }
    if (r) {
      $("mQuiz").value = r.quizId; $("mText").value = r.text || "";
      document.querySelectorAll(".m-opt").forEach((o, i) => { o.value = (r.options || [])[i] || ""; });
      const rad = document.querySelector('input[name="mCorrect"][value="' + (r.correctIndex || 0) + '"]'); if (rad) rad.checked = true;
    }
    $("mQuiz").disabled = m === "edit";
    $("qModal").classList.remove("hidden");
  }
  function closeModal() { $("qModal").classList.add("hidden"); fillSelects(); }

  $("qForm").addEventListener("submit", e => {
    e.preventDefault();
    const quizId = mode === "edit" ? editing.quizId : $("mQuiz").value;
    if (!quizId) return;
    const record = {
      text: $("mText").value.trim(),
      options: [...document.querySelectorAll(".m-opt")].map(o => o.value.trim()),
      correctIndex: Number(document.querySelector('input[name="mCorrect"]:checked').value)
    };
    let key = editing && mode === "edit" ? editing.key : null;
    if (!key) {
      const nums = Object.keys((quizzes[quizId] || {}).questions || {}).map(k => (/^q(\d+)$/.exec(k) || [])[1]).filter(Boolean).map(Number);
      key = "q" + (nums.length ? Math.max(...nums) + 1 : 0);
    }
    quizzesRef.child(quizId + "/questions/" + key).set(record).then(closeModal)
      .catch(err => { $("formAlert").textContent = err.message; $("formAlert").classList.add("show"); });
  });

  $("addBtn").addEventListener("click", () => openModal("add"));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
});
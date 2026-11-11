/**
 * AtomMixAR — Teacher: author quizzes (in the format the Unity game reads).
 *
 * quizzes/{quizID} = { title, description, type, createdBy, createdByName, createdAt,
 *   questions: { q0: { question, optionA, optionB, optionC, optionD, correctAnswer (0-3) } } }
 *
 * "Guess the Element" quizzes use clue1, clue2, clue3 instead of "question".
 * In Unity, set the quizID field of the quiz manager to the Quiz ID shown in the table.
 */
AppAuth.requireRole("teacher", function (user, profile) {
  const quizzesRef = db.ref("quizzes");
  const tbody = document.getElementById("quizzesBody");
  const empty = document.getElementById("emptyState");
  const modal = document.getElementById("quizModal");
  const form = document.getElementById("quizForm");
  const modalTitle = document.getElementById("modalTitle");
  const questionsBox = document.getElementById("questionsContainer");
  const alertBox = document.getElementById("formAlert");

  let quizzes = {};
  let editingId = null;
  let qCounter = 0;
  let guessMode = false;

  // "Guess the Element" switch, placed above the questions
  const modeWrap = document.createElement("label");
  modeWrap.style.cssText = "display:flex;gap:8px;align-items:center;margin:8px 0";
  modeWrap.innerHTML = '<input type="checkbox"> <span>Guess the Element quiz (3 clues per question)</span>';
  questionsBox.parentNode.insertBefore(modeWrap, questionsBox);
  const guessToggle = modeWrap.querySelector("input");
  guessToggle.addEventListener("change", () => { guessMode = guessToggle.checked; applyMode(); });

  quizzesRef.on("value", snap => {
    quizzes = snap.val() || {};
    renderTable();
  });

  // Reads a question in the game's format (or the older website format)
  function normalize(q) {
    q = q || {};
    const options = ["optionA", "optionB", "optionC", "optionD"].map((k, i) =>
      q[k] !== undefined ? String(q[k]) : String((q.options || [])[i] || ""));
    const c = q.correctAnswer !== undefined ? q.correctAnswer : q.correctIndex;
    return {
      question: q.question !== undefined ? String(q.question) : String(q.text || ""),
      clue1: String(q.clue1 || ""),
      clue2: String(q.clue2 || ""),
      clue3: String(q.clue3 || ""),
      options,
      correct: Number(c) || 0
    };
  }

  function isGuess(q, id) {
    return q.type === "guess" || /guess/i.test(id || "") ||
      Object.values(q.questions || {}).some(x => x && x.clue1);
  }

  function renderTable() {
    const ids = Object.keys(quizzes);
    tbody.innerHTML = "";
    empty.classList.toggle("hidden", ids.length > 0);

    ids
      .sort((a, b) => (quizzes[b].createdAt || 0) - (quizzes[a].createdAt || 0))
      .forEach(id => {
        const q = quizzes[id];
        const count = q.questions ? Object.keys(q.questions).length : 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(q.title || id)}<br>
            <small class="text-muted">Quiz ID for Unity: <code>${escapeHtml(id)}</code></small></td>
          <td>${count} question${count === 1 ? "" : "s"}</td>
          <td>${q.createdByName ? escapeHtml(q.createdByName) : "—"}</td>
          <td class="row">
            <button class="btn-sm" data-edit="${escapeAttr(id)}">Edit</button>
            <button class="btn-sm btn-danger" data-delete="${escapeAttr(id)}">Delete</button>
          </td>`;
        tbody.appendChild(tr);
      });

    tbody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(b.dataset.edit)));
    tbody.querySelectorAll("[data-delete]").forEach(b =>
      b.addEventListener("click", () => deleteQuiz(b.dataset.delete)));
  }

  function applyMode() {
    questionsBox.querySelectorAll(".q-block").forEach(b => {
      b.querySelector(".q-text-field").style.display = guessMode ? "none" : "";
      b.querySelector(".q-text").required = !guessMode;
      b.querySelector(".q-clues").style.display = guessMode ? "" : "none";
      b.querySelectorAll(".q-clue").forEach(c => { c.required = guessMode; });
    });
  }

  function addQuestionBlock(data) {
    const n = normalize(data);
    qCounter++;
    const id = "q" + qCounter;
    const letters = ["A", "B", "C", "D"];
    const wrap = document.createElement("div");
    wrap.className = "q-block";
    wrap.dataset.qid = id;

    wrap.innerHTML = `
      <div class="row-between">
        <label style="margin:0">Question</label>
        <button type="button" class="btn-ghost btn-sm" data-remove-q>Remove</button>
      </div>
      <div class="field q-text-field">
        <input type="text" class="q-text" placeholder="e.g. What is the atomic number of Oxygen?" value="${escapeAttr(n.question)}">
      </div>
      <div class="q-clues">
        ${[1, 2, 3].map(i => `
          <div class="field">
            <input type="text" class="q-clue" placeholder="Clue ${i}" value="${escapeAttr(n["clue" + i])}">
          </div>`).join("")}
      </div>
      ${n.options.map((opt, i) => `
        <div class="opt-row">
          <input type="radio" name="correct-${id}" value="${i}" ${i === n.correct ? "checked" : ""}>
          <input type="text" class="q-opt" placeholder="Option ${letters[i]}" value="${escapeAttr(opt)}" required>
        </div>`).join("")}
      <p class="text-muted" style="margin:2px 0 0;font-size:.78rem">Select the radio button next to the correct answer.</p>
    `;

    wrap.querySelector("[data-remove-q]").addEventListener("click", () => wrap.remove());
    questionsBox.appendChild(wrap);
    applyMode();
  }

  // Each question in exactly the shape the game reads
  function collectQuestions() {
    return [...questionsBox.querySelectorAll(".q-block")].map(block => {
      const opts = [...block.querySelectorAll(".q-opt")].map(i => i.value.trim());
      const checked = block.querySelector("input[type=radio]:checked");
      const rec = {
        optionA: opts[0], optionB: opts[1], optionC: opts[2], optionD: opts[3],
        correctAnswer: checked ? Number(checked.value) : 0
      };
      if (guessMode) {
        const clues = [...block.querySelectorAll(".q-clue")].map(i => i.value.trim());
        rec.clue1 = clues[0]; rec.clue2 = clues[1]; rec.clue3 = clues[2];
      } else {
        rec.question = block.querySelector(".q-text").value.trim();
      }
      return rec;
    });
  }

  function openModal(id) {
    editingId = id || null;
    form.reset();
    questionsBox.innerHTML = "";
    hideAlert();

    if (id) {
      modalTitle.textContent = "Edit quiz";
      const q = quizzes[id];
      document.getElementById("qTitle").value = q.title || "";
      document.getElementById("qDescription").value = q.description || "";
      guessMode = isGuess(q, id);
      guessToggle.checked = guessMode;
      const questions = q.questions ? Object.values(q.questions) : [];
      questions.forEach(addQuestionBlock);
      if (questions.length === 0) addQuestionBlock();
    } else {
      modalTitle.textContent = "New quiz";
      guessMode = false;
      guessToggle.checked = false;
      addQuestionBlock();
    }
    modal.classList.remove("hidden");
  }

  function closeModal() { modal.classList.add("hidden"); editingId = null; }

  function deleteQuiz(id) {
    if (!confirm("Delete this quiz? Students will no longer see it in the app.")) return;
    quizzesRef.child(id).remove();
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const title = document.getElementById("qTitle").value.trim();
    const description = document.getElementById("qDescription").value.trim();
    const questions = collectQuestions();

    if (!title) { showAlert("Give the quiz a title."); return; }
    if (questions.length === 0) { showAlert("Add at least one question."); return; }
    for (const q of questions) {
      const opts = [q.optionA, q.optionB, q.optionC, q.optionD];
      const main = guessMode ? [q.clue1, q.clue2, q.clue3] : [q.question];
      if (main.some(v => !v) || opts.some(v => !v)) {
        showAlert(guessMode
          ? "Every question needs its 3 clues and all four options filled in."
          : "Every question needs its text and all four options filled in.");
        return;
      }
    }

    const questionsObj = {};
    questions.forEach((q, i) => { questionsObj["q" + i] = q; });

    const record = {
      title, description,
      type: guessMode ? "guess" : "standard",
      questions: questionsObj,
      createdBy: user.uid, createdByName: profile.name || profile.email,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    const ref = editingId ? quizzesRef.child(editingId) : quizzesRef.push();
    if (!editingId) record.createdAt = firebase.database.ServerValue.TIMESTAMP;

    ref.update(record).then(closeModal).catch(err => showAlert(err.message));
  });

  document.getElementById("addBtn").addEventListener("click", () => openModal(null));
  document.getElementById("addQuestionBtn").addEventListener("click", () => addQuestionBlock());
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
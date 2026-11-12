/**
 * AtomMixAR — Teacher: edit quizzes (in the format the Unity game reads).
 *
 * Fixed na ang 3 quiz (10 tanong bawat isa), kaya edit lang ang pwede:
 * walang New quiz, Delete, Add question o Remove question.
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
  let guessMode = false;

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
    let correct = Number(c) || 0;
    if (correct < 0 || correct > 3) correct = 0;
    return {
      question: q.question !== undefined ? String(q.question) : String(q.text || ""),
      clue1: String(q.clue1 || ""),
      clue2: String(q.clue2 || ""),
      clue3: String(q.clue3 || ""),
      options,
      correct
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
          </td>`;
        tbody.appendChild(tr);
      });

    tbody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(b.dataset.edit)));
  }

  // Isang tanong: Correct answer + 3 Wrong answers (walang radio button)
  function addQuestionBlock(data, number) {
    const n = normalize(data);
    const wrap = document.createElement("div");
    wrap.className = "q-block";
    wrap.dataset.correct = String(n.correct); // posisyon ng tamang sagot (A-D) ay hindi nagbabago

    const wrongs = n.options.filter((_, i) => i !== n.correct);

    const head = guessMode
      ? [1, 2, 3].map(i => `
          <div class="field">
            <input type="text" class="q-clue" placeholder="Clue ${i}" value="${escapeAttr(n["clue" + i])}" required>
          </div>`).join("")
      : `
          <div class="field">
            <input type="text" class="q-text" placeholder="e.g. What is the atomic number of Oxygen?" value="${escapeAttr(n.question)}" required>
          </div>`;

    wrap.innerHTML = `
      <label style="margin:0 0 6px;font-weight:600">${guessMode ? "Clues for question " : "Question "}${number}</label>
      ${head}
      <div class="field">
        <label>Correct answer</label>
        <input type="text" class="q-correct" placeholder="Correct answer" value="${escapeAttr(n.options[n.correct])}" required style="border-color:#2e9e5b">
      </div>
      <div class="field">
        <label>Wrong answers</label>
        ${[0, 1, 2].map(i => `
          <input type="text" class="q-wrong" placeholder="Wrong answer ${i + 1}" value="${escapeAttr(wrongs[i] || "")}" required style="margin-bottom:6px">`).join("")}
      </div>
    `;

    questionsBox.appendChild(wrap);
  }

  // Each question in exactly the shape the game reads
  function collectQuestions() {
    return [...questionsBox.querySelectorAll(".q-block")].map(block => {
      const correctIdx = Number(block.dataset.correct) || 0;
      const correct = block.querySelector(".q-correct").value.trim();
      const wrongs = [...block.querySelectorAll(".q-wrong")].map(i => i.value.trim());

      // Ilagay ang tamang sagot sa dating posisyon niya, ang mali sa natitira
      const opts = [];
      let w = 0;
      for (let i = 0; i < 4; i++) opts.push(i === correctIdx ? correct : wrongs[w++]);

      const rec = {
        optionA: opts[0], optionB: opts[1], optionC: opts[2], optionD: opts[3],
        correctAnswer: correctIdx
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
    const q = quizzes[id];
    if (!q) return;
    editingId = id;
    form.reset();
    questionsBox.innerHTML = "";
    hideAlert();

    modalTitle.textContent = "Edit quiz";
    document.getElementById("qTitle").value = q.title || "";
    document.getElementById("qDescription").value = q.description || "";
    guessMode = isGuess(q, id);

    // Ayon sa pagkakasunod ng q0, q1, q2...
    const keys = Object.keys(q.questions || {}).sort((a, b) =>
      (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0));
    keys.forEach((k, i) => addQuestionBlock(q.questions[k], i + 1));

    modal.classList.remove("hidden");
  }

  function closeModal() { modal.classList.add("hidden"); editingId = null; }

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!editingId) return;

    const title = document.getElementById("qTitle").value.trim();
    const description = document.getElementById("qDescription").value.trim();
    const questions = collectQuestions();

    if (!title) { showAlert("Give the quiz a title."); return; }
    for (const q of questions) {
      const opts = [q.optionA, q.optionB, q.optionC, q.optionD];
      const main = guessMode ? [q.clue1, q.clue2, q.clue3] : [q.question];
      if (main.some(v => !v) || opts.some(v => !v)) {
        showAlert(guessMode
          ? "Every question needs its 3 clues, the correct answer and 3 wrong answers."
          : "Every question needs its text, the correct answer and 3 wrong answers.");
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

    quizzesRef.child(editingId).update(record).then(closeModal).catch(err => showAlert(err.message));
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
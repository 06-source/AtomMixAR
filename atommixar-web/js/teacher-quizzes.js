/**
 * AtomMixAR — Teacher: edit quizzes + replace a finished quiz with a new one.
 *
 * Laging 3 lang ang quiz (3 slot, gaya sa game). 10 tanong bawat isa.
 *  - Edit: baguhin ang laman ng quiz.
 *  - New quiz: piliin muna ang quiz na tapos na -> i-delete -> gumawa ng bago.
 *    Ang bagong quiz ay napupunta sa SAME Quiz ID ng na-delete, kaya hindi na
 *    kailangang baguhin ang Unity (tatlo pa rin ang quiz sa game).
 *
 * quizzes/{quizID} = { title, description, type, createdBy, createdByName, createdAt,
 *   questions: { q0: { question, optionA, optionB, optionC, optionD, correctAnswer (0-3) } } }
 *
 * "Guess the Element" quiz uses clue1, clue2, clue3 instead of "question".
 */
AppAuth.requireRole("teacher", function (user, profile) {
  // Ang 3 slot na binabasa ng Unity game (Quiz ID -> uri)
  const SLOTS = {
    elementsCompoundsQuiz: "standard",
    guessTheElement: "guess",
    periodicTableQuiz: "standard"
  };
  const QUESTIONS_PER_QUIZ = 10;

  // Mga section ng school (kapareho ng nasa auth.js)
  const ALL_SECTIONS = AppAuth.SECTIONS.slice();
  const normSec = s => String(s || "").toUpperCase().replace(/\s+/g, " ").trim().replace(/\bPRIO\b/, "PIO");
  const displaySec = s => ALL_SECTIONS.find(x => normSec(x) === normSec(s)) || String(s);

  // Mga section na pwedeng piliin ng teacher na ito
  function availableSections() {
    if (profile.role === "admin" || !AppAuth.isRestricted(profile)) return ALL_SECTIONS.slice();
    const mine = AppAuth.teacherSections(profile);
    return ALL_SECTIONS.filter(x => mine.includes(normSec(x)));
  }

  // Mga section na naka-save sa quiz (array o object) -> listahan ng pangalan
  function quizSections(q) {
    const raw = q && q.sections ? Object.values(q.sections) : [];
    return raw.map(displaySec);
  }

  const quizzesRef = db.ref("quizzes");
  const tbody = document.getElementById("quizzesBody");
  const empty = document.getElementById("emptyState");
  const modal = document.getElementById("quizModal");
  const form = document.getElementById("quizForm");
  const modalTitle = document.getElementById("modalTitle");
  const questionsBox = document.getElementById("questionsContainer");
  const alertBox = document.getElementById("formAlert");

  // New quiz: pick-and-delete modal
  const pickModal = document.getElementById("pickModal");
  const pickList = document.getElementById("pickList");
  const pickAlert = document.getElementById("pickAlert");
  const pickDeleteBtn = document.getElementById("pickDeleteBtn");
  const newQuizBtn = document.getElementById("newQuizBtn");

  let quizzes = {};
  let editingId = null;
  let creating = false;
  let guessMode = false;
  let pickedId = null;

  const sectionsBox = document.getElementById("sectionsBox");
  const sectionsField = document.getElementById("sectionsField");
  let availSecs = [];     // sections na pwedeng piliin ng teacher

  quizzesRef.on("value", snap => {
    quizzes = snap.val() || {};
    renderTable();
  });

  function emptySlots() {
    return Object.keys(SLOTS).filter(id => !quizzes[id]);
  }

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
    empty.classList.add("hidden");

    ids
      .sort((a, b) => (quizzes[b].createdAt || 0) - (quizzes[a].createdAt || 0))
      .forEach(id => {
        const q = quizzes[id];
        const count = q.questions ? Object.keys(q.questions).length : 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(q.title || id)}<br>
            <small class="text-muted">Quiz ID for Unity: <code>${escapeHtml(id)}</code></small><br>
            <small class="text-muted">Visible to: ${escapeHtml(visibleText(q))}</small></td>
          <td>${count} question${count === 1 ? "" : "s"}</td>
          <td>${q.createdByName ? escapeHtml(q.createdByName) : "—"}</td>
          <td class="row">
            <button class="btn-sm" data-edit="${escapeAttr(id)}">Edit</button>
          </td>`;
        tbody.appendChild(tr);
      });

    // Walang laman na slot (na-delete na, hindi pa napapalitan)
    emptySlots().forEach(id => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><em>Empty slot — waiting for a new quiz</em><br>
          <small class="text-muted">Quiz ID for Unity: <code>${escapeHtml(id)}</code></small></td>
        <td>0 questions</td>
        <td>—</td>
        <td class="row">
          <button class="btn-sm" data-create="${escapeAttr(id)}">Create quiz</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(b.dataset.edit)));
    tbody.querySelectorAll("[data-create]").forEach(b =>
      b.addEventListener("click", () => openCreate(b.dataset.create)));
  }

  function visibleText(q) {
    const secs = quizSections(q);
    if (!secs.length) return "All sections";
    if (secs.length >= ALL_SECTIONS.length) return "All sections";
    return secs.join(", ");
  }

  function paintChip(label, cb) {
    label.style.borderColor = cb.checked ? "#0e9bb5" : "#d5dde6";
    label.style.background = cb.checked ? "rgba(14,155,181,.12)" : "";
    label.style.fontWeight = cb.checked ? "600" : "400";
  }

  // Mga section na pwedeng i-click (chips)
  function renderSectionPicker(selected) {
    availSecs = availableSections();
    sectionsBox.innerHTML = "";
    if (!availSecs.length) {
      sectionsBox.innerHTML = '<small class="text-muted">No sections are assigned to you yet. Ask the admin to assign your sections.</small>';
      return;
    }
    availSecs.forEach(sec => {
      const label = document.createElement("label");
      label.style.cssText = "display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #d5dde6;border-radius:999px;cursor:pointer;font-size:.9rem;margin:0;width:auto";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = sec;
      cb.checked = selected.includes(sec);
      cb.style.cssText = "width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0";
      cb.addEventListener("change", () => paintChip(label, cb));
      label.appendChild(cb);
      label.appendChild(document.createTextNode(sec));
      paintChip(label, cb);
      sectionsBox.appendChild(label);
    });
  }

  function pickedSections() {
    return [...sectionsBox.querySelectorAll("input:checked")].map(i => i.value);
  }

  function setAllSections(on) {
    sectionsBox.querySelectorAll("input").forEach(cb => {
      cb.checked = on;
      paintChip(cb.parentNode, cb);
    });
  }
  document.getElementById("secAll").addEventListener("click", () => setAllSections(true));
  document.getElementById("secNone").addEventListener("click", () => setAllSections(false));

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

  // ---------- Edit existing quiz ----------
  function openModal(id) {
    const q = quizzes[id];
    if (!q) return;
    editingId = id;
    creating = false;
    form.reset();
    questionsBox.innerHTML = "";
    hideAlert();

    modalTitle.textContent = "Edit quiz";
    document.getElementById("qTitle").value = q.title || "";
    document.getElementById("qDescription").value = q.description || "";
    guessMode = isGuess(q, id);

    // Edit: walang pagpili ng section (sa New quiz lang iyon). Hindi ginagalaw ang naka-save na sections.
    sectionsField.classList.add("hidden");
    sectionsBox.innerHTML = "";

    // Ayon sa pagkakasunod ng q0, q1, q2...
    const keys = Object.keys(q.questions || {}).sort((a, b) =>
      (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0));
    keys.forEach((k, i) => addQuestionBlock(q.questions[k], i + 1));

    modal.classList.remove("hidden");
  }

  // ---------- Create new quiz in an empty slot ----------
  function openCreate(slotId) {
    if (!SLOTS[slotId] || quizzes[slotId]) return; // sa walang laman na slot lang
    editingId = slotId;
    creating = true;
    form.reset();
    questionsBox.innerHTML = "";
    hideAlert();

    modalTitle.textContent = "New quiz (replaces the deleted quiz)";
    guessMode = SLOTS[slotId] === "guess";

    // New quiz: piliin ng teacher kung sinong section ang makakakita
    renderSectionPicker([]);
    sectionsField.classList.remove("hidden");

    for (let i = 0; i < QUESTIONS_PER_QUIZ; i++) {
      // Random na posisyon ng tamang sagot (A-D) para hindi laging A
      addQuestionBlock({ correctAnswer: Math.floor(Math.random() * 4) }, i + 1);
    }

    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    editingId = null;
    creating = false;
  }

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

    // Sections na makakakita ng quiz (New quiz lang)
    let picked = [];
    if (creating) {
      picked = pickedSections();
      if (!picked.length) { showAlert("Pick at least one section that can see this quiz."); return; }
    }

    const questionsObj = {};
    questions.forEach((q, i) => { questionsObj["q" + i] = q; });

    const record = {
      title, description,
      type: guessMode ? "guess" : "standard",
      questions: questionsObj,
      createdBy: user.uid, createdByName: profile.name || profile.email
    };

    if (creating) record.sections = picked;

    let op;
    if (creating) {
      record.createdAt = firebase.database.ServerValue.TIMESTAMP;
      op = quizzesRef.child(editingId).set(record);
    } else {
      record.updatedAt = firebase.database.ServerValue.TIMESTAMP;
      op = quizzesRef.child(editingId).update(record);
    }
    op.then(closeModal).catch(err => showAlert(err.message));
  });

  // ---------- New quiz: choose finished quiz -> delete -> create ----------
  newQuizBtn.addEventListener("click", () => {
    // May walang laman na slot na? Diretso na sa paggawa ng bago.
    const empties = emptySlots();
    if (empties.length) { openCreate(empties[0]); return; }

    pickedId = null;
    pickDeleteBtn.disabled = true;
    pickAlert.classList.remove("show");
    pickList.innerHTML = "";

    Object.keys(quizzes).forEach(id => {
      const label = document.createElement("label");
      label.className = "pick-item";
      label.style.cssText = "display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:14px;padding:14px 16px;border:1px solid #d5dde6;border-radius:10px;margin:0 0 10px;cursor:pointer;text-align:left;width:100%;box-sizing:border-box";
      label.innerHTML = `
        <input type="radio" name="pickQuiz" value="${escapeAttr(id)}" style="width:18px;height:18px;min-width:18px;flex:none;margin:0;padding:0">
        <span style="flex:1;min-width:0;text-align:left;line-height:1.4;color:inherit">
          <strong style="display:block;font-weight:600">${escapeHtml(quizzes[id].title || id)}</strong>
          <small class="text-muted">Quiz ID: <code>${escapeHtml(id)}</code></small>
        </span>`;
      label.querySelector("input").addEventListener("change", () => {
        pickedId = id;
        pickDeleteBtn.disabled = false;
        pickList.querySelectorAll(".pick-item").forEach(el => {
          el.style.borderColor = "#d5dde6";
          el.style.background = "";
        });
        label.style.borderColor = "#d64545";
        label.style.background = "rgba(214,69,69,.07)";
      });
      pickList.appendChild(label);
    });

    pickModal.classList.remove("hidden");
  });

  pickDeleteBtn.addEventListener("click", () => {
    if (!pickedId || !quizzes[pickedId]) return;
    const id = pickedId;
    const title = quizzes[id].title || id;

    if (!confirm(`Delete "${title}"?\n\nThe quiz and its student results will be moved to "Archived results" on the Scores page. You will then create the new quiz that takes its place.`)) return;

    pickDeleteBtn.disabled = true;

    // Lilipat sa quizArchive ang quiz AT ang lahat ng record ng mga estudyante nito.
    // Isang write lang ito (all-or-nothing): kung pumalya, walang mabubura.
    // Makikita ang mga lumang record sa Scores page, sa "Archived results".
    const archiveKey = db.ref("quizArchive").push().key;

    db.ref("scores").once("value")
      .then(snap => {
        const results = {};   // { uid: { quizID: { pushId: record } } }
        let count = 0;
        const updates = {};

        snap.forEach(userSnap => {
          const attempts = userSnap.child(id);
          if (!attempts.exists()) return;
          const uid = userSnap.key;
          results[uid] = {};
          results[uid][id] = {};
          attempts.forEach(a => {
            const rec = a.val() || {};
            rec.quizTitle = rec.quizTitle || title; // permanenteng pangalan ng lumang quiz
            results[uid][id][a.key] = rec;
            count++;
          });
          updates["scores/" + uid + "/" + id] = null; // inalis sa kasalukuyang scores
        });

        const archived = Object.assign({}, quizzes[id], {
          originalQuizId: id,
          title: title,
          resultsCount: count,
          archivedAt: firebase.database.ServerValue.TIMESTAMP,
          archivedBy: user.uid,
          archivedByName: profile.name || profile.email
        });
        if (count) archived.results = results;

        updates["quizArchive/" + archiveKey] = archived;
        updates["quizzes/" + id] = null;

        return db.ref().update(updates); // isang write: archive + records + delete
      })
      .then(() => {
        pickModal.classList.add("hidden");
        openCreate(id);
      })
      .catch(err => {
        pickAlert.textContent = err.message;
        pickAlert.classList.add("show");
        pickDeleteBtn.disabled = false;
      });
  });

  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  document.querySelectorAll("[data-close-pick]").forEach(b =>
    b.addEventListener("click", () => pickModal.classList.add("hidden")));

  function showAlert(msg) { alertBox.textContent = msg; alertBox.classList.add("show"); }
  function hideAlert() { alertBox.classList.remove("show"); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str || ""); }
});
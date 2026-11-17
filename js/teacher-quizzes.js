/**
 * AtomMixAR — Teacher: edit quizzes + replace a finished quiz with a new one.
 *
 * Laging 3 lang ang quiz SLOT (gaya sa game). 10 tanong bawat isa.
 *  - Edit: baguhin ang laman ng quiz (kung lahat ng section nito ay hawak mo).
 *  - New quiz: piliin ang quiz na tapos na -> i-replace -> gumawa ng bago.
 *
 * PER-SECTION NA PAGPALIT:
 *  Ang pagpalit ay para lang sa sections na hawak ng teacher. Ang records ng
 *  estudyante sa ibang sections ay HINDI ginagalaw, at ang lumang quiz ay nananatili
 *  para sa ibang sections hanggang sila mismo ang magpalit.
 *
 * quizzes/{quizID}                 = lumang / orihinal na quiz (quizID = slot, binabasa ng Unity)
 * quizzes/{quizID}__{pushKey}      = bagong bersyon para sa ilang section lang, may field na slot
 * Bawat quiz node: { title, description, type, slot?, sections: [...], createdBy, createdByName,
 *   createdAt, updatedAt, questions: { q0: { question, optionA..D, correctAnswer (0-3) } } }
 *
 * NOTIFICATION: ang updatedAt ay sine-set sa bawat Edit AT sa bawat bagong quiz, kaya
 * nagre-red ang bell ng mga estudyante sa sections ng quiz na iyon.
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
  const mySecs = () => availableSections().map(normSec);

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
  let editingId = null;   // sa edit: quiz key. sa create: ang SLOT
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

  // ---------- Slot / section helpers ----------

  // Aling slot (Quiz ID ng Unity) ang kinabibilangan ng quiz node
  const slotOf = id => (quizzes[id] && quizzes[id].slot) || id;

  const idsInSlot = slot => Object.keys(quizzes).filter(id => slotOf(id) === slot);

  // Mga section ng teacher na WALANG quiz sa slot na ito (na-replace na, hindi pa napapalitan)
  function uncovered(slot) {
    const cov = new Set();
    idsInSlot(slot).forEach(id => quizSections(quizzes[id]).forEach(s => cov.add(normSec(s))));
    return availableSections().filter(s => !cov.has(normSec(s)));
  }

  // Mga slot na may section ng teacher na naghihintay ng bagong quiz
  function emptySlots() {
    return Object.keys(SLOTS).filter(slot => uncovered(slot).length > 0);
  }

  // Kasali ba ang teacher sa quiz na ito? (may section siyang hawak dito, o wala pang sections ang quiz)
  function involved(q) {
    const secs = quizSections(q).map(normSec);
    if (!secs.length) return true;
    const mine = mySecs();
    return secs.some(s => mine.includes(s));
  }

  // Pwede lang mag-edit kung LAHAT ng section ng quiz ay hawak mo.
  // Kung may kasamang section ng ibang teacher, "New quiz" (replace) ang gamitin.
  function canEdit(q) {
    const mine = mySecs();
    return quizSections(q).map(normSec).every(s => mine.includes(s));
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
    // Quiz lang na may kinalaman sa teacher na ito
    const ids = Object.keys(quizzes).filter(id => involved(quizzes[id]));
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
            <small class="text-muted">Quiz ID for Unity: <code>${escapeHtml(slotOf(id))}</code></small><br>
            <small class="text-muted">Visible to: ${escapeHtml(visibleText(q))}</small></td>
          <td>${count} question${count === 1 ? "" : "s"}</td>
          <td>${q.createdByName ? escapeHtml(q.createdByName) : "—"}</td>
          <td class="row">
            ${canEdit(q)
              ? `<button class="btn-sm" data-edit="${escapeAttr(id)}">Edit</button>`
              : `<small class="text-muted">Shared with other sections. Use New quiz to replace it for your sections.</small>`}
          </td>`;
        tbody.appendChild(tr);
      });

    // Mga slot na may section ng teacher na naghihintay ng bagong quiz
    emptySlots().forEach(slot => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><em>No quiz yet — waiting for a new quiz</em><br>
          <small class="text-muted">Quiz ID for Unity: <code>${escapeHtml(slot)}</code></small><br>
          <small class="text-muted">Sections waiting: ${escapeHtml(uncovered(slot).join(", "))}</small></td>
        <td>0 questions</td>
        <td>—</td>
        <td class="row">
          <button class="btn-sm" data-create="${escapeAttr(slot)}">Create quiz</button>
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
    if (!secs.length) return "No section yet (closed)";
    if (secs.length >= ALL_SECTIONS.length) return "All sections";
    return secs.join(", ");
  }

  function paintChip(label, cb) {
    label.style.borderColor = cb.checked ? "#0e9bb5" : "#d5dde6";
    label.style.background = cb.checked ? "rgba(14,155,181,.12)" : "";
    label.style.fontWeight = cb.checked ? "600" : "400";
  }

  // Mga section na pwedeng i-click (chips). `only` = limitahan sa mga section na ito.
  function renderSectionPicker(selected, only) {
    availSecs = only || availableSections();
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
    if (!q || !canEdit(q)) return;
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

  // ---------- Create new quiz for the sections that have none ----------
  function openCreate(slot) {
    const secs = uncovered(slot);
    if (!SLOTS[slot] || !secs.length) return; // may section lang na naghihintay
    editingId = slot;   // sa create, ang slot ang laman nito
    creating = true;
    form.reset();
    questionsBox.innerHTML = "";
    hideAlert();

    modalTitle.textContent = "New quiz (replaces the old quiz for your sections)";
    guessMode = SLOTS[slot] === "guess";

    // Mga section lang na naghihintay ng bagong quiz ang pwedeng piliin
    renderSectionPicker(secs, secs);
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

    // Ang updatedAt ang nagpapa-red ng bell sa mga estudyante (sa Edit at sa bagong quiz)
    record.updatedAt = firebase.database.ServerValue.TIMESTAMP;

    let op;
    if (creating) {
      const slot = editingId;
      // Kung libre ang mismong Quiz ID, doon ilagay. Kung may quiz pa roon para sa
      // ibang section, gumawa ng hiwalay na node para hindi magalaw ang quiz nila.
      const key = quizzes[slot] ? slot + "__" + quizzesRef.push().key : slot;
      record.slot = slot;
      record.sections = picked;
      record.createdAt = firebase.database.ServerValue.TIMESTAMP;
      op = quizzesRef.child(key).set(record);
    } else {
      op = quizzesRef.child(editingId).update(record);
    }
    op.then(closeModal).catch(err => showAlert(err.message));
  });

  // ---------- New quiz: choose finished quiz -> replace for MY sections -> create ----------
  newQuizBtn.addEventListener("click", () => {
    // May section ka na bang naghihintay ng bagong quiz? Diretso na sa paggawa.
    const empties = emptySlots();
    if (empties.length) { openCreate(empties[0]); return; }

    pickedId = null;
    pickDeleteBtn.disabled = true;
    pickAlert.classList.remove("show");
    pickList.innerHTML = "";

    Object.keys(quizzes).filter(id => involved(quizzes[id])).forEach(id => {
      const label = document.createElement("label");
      label.className = "pick-item";
      label.style.cssText = "display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:14px;padding:14px 16px;border:1px solid #d5dde6;border-radius:10px;margin:0 0 10px;cursor:pointer;text-align:left;width:100%;box-sizing:border-box";
      label.innerHTML = `
        <input type="radio" name="pickQuiz" value="${escapeAttr(id)}" style="width:18px;height:18px;min-width:18px;flex:none;margin:0;padding:0">
        <span style="flex:1;min-width:0;text-align:left;line-height:1.4;color:inherit">
          <strong style="display:block;font-weight:600">${escapeHtml(quizzes[id].title || id)}</strong>
          <small class="text-muted">Quiz ID: <code>${escapeHtml(slotOf(id))}</code></small><br>
          <small class="text-muted">Visible to: ${escapeHtml(visibleText(quizzes[id]))}</small>
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
    const q = quizzes[id];
    const slot = slotOf(id);
    const title = q.title || id;

    const mine = mySecs();
    const oldSecs = quizSections(q).map(normSec);

    // replaced = mga section NA HAWAK MO na gumagamit ng quiz na ito (ito lang ang papalitan)
    // kept     = mga section ng IBANG teacher (mananatili sa lumang quiz, hindi magagalaw)
    const replaced = oldSecs.length ? oldSecs.filter(s => mine.includes(s)) : mine;
    const kept = oldSecs.filter(s => !mine.includes(s));

    if (!replaced.length) {
      pickAlert.textContent = "You don't handle any section of this quiz.";
      pickAlert.classList.add("show");
      return;
    }

    const keptText = kept.length
      ? `\n\nThese sections keep this quiz and their results: ${kept.map(displaySec).join(", ")}.`
      : "";
    if (!confirm(`Replace "${title}" for: ${replaced.map(displaySec).join(", ")}?\n\nOnly the results of students in these sections will be moved to "Archived results" on the Scores page. You will then create the new quiz for them.${keptText}`)) return;

    pickDeleteBtn.disabled = true;

    const archiveKey = db.ref("quizArchive").push().key;

    Promise.all([
      db.ref("scores").once("value"),
      db.ref("students").once("value"),
      db.ref("users").once("value")
    ])
      .then(([scoresSnap, stSnap, usSnap]) => {
        const roster = stSnap.val() || {};
        const users = usSnap.val() || {};
        // Section ng estudyante: students/{uid}/section, fallback users/{uid}/section
        const secOf = uid => normSec(
          (roster[uid] && roster[uid].section) || (users[uid] && users[uid].section) || "");

        const results = {};   // { uid: { quizID: { pushId: record } } }
        let count = 0;
        const updates = {};

        scoresSnap.forEach(userSnap => {
          const uid = userSnap.key;
          // Estudyante sa ibang section: hindi gagalawin ang record
          if (!replaced.includes(secOf(uid))) return;

          const attempts = userSnap.child(slot);
          if (!attempts.exists()) return;

          results[uid] = {};
          results[uid][slot] = {};
          attempts.forEach(a => {
            const rec = a.val() || {};
            rec.quizTitle = rec.quizTitle || title; // permanenteng pangalan ng lumang quiz
            results[uid][slot][a.key] = rec;
            count++;
          });
          updates["scores/" + uid + "/" + slot] = null; // inalis sa kasalukuyang scores
        });

        const archived = Object.assign({}, q, {
          originalQuizId: id,
          slot: slot,
          title: title,
          sections: replaced.map(displaySec),   // sections na napalitan
          resultsCount: count,
          archivedAt: firebase.database.ServerValue.TIMESTAMP,
          archivedBy: user.uid,
          archivedByName: profile.name || profile.email
        });
        if (count) archived.results = results;

        updates["quizArchive/" + archiveKey] = archived;

        if (kept.length) {
          // May ibang section pa na gumagamit: alisin lang ang sections mo sa lumang quiz
          updates["quizzes/" + id + "/sections"] = kept.map(displaySec);
        } else {
          // Wala nang gumagamit: buong quiz ang aalisin
          updates["quizzes/" + id] = null;
        }

        return db.ref().update(updates); // isang write: archive + records + quiz
      })
      .then(() => {
        pickModal.classList.add("hidden");
        openCreate(slot);
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
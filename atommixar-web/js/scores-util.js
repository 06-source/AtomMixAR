/**
 * AtomMixAR — score helper.
 *
 * The Unity game saves each result at:
 *   scores/{uid}/{quizID}/{pushId} = { studentID, quizID, score, totalQuestions,
 *                                      percentage, date, quizVersion, quizKey,
 *                                      (correctAnswers, wrongAnswers) }
 *
 * quizID  = ang slot (hal. "periodicTableQuiz")
 * quizKey = ang quiz node na sinagutan ng estudyante (quizzes/{quizKey}); maaaring
 *           iba sa quizID kapag napalitan ang quiz para sa ilang section lang.
 *
 * The game does NOT save the student's name or the quiz title, so they are
 * looked up here from:
 *   users/{uid}.username     (written by the game when a student registers)
 *   quizzes/{quizKey}.title  (falls back to a readable version of the quiz ID)
 */
const ScoreUtil = (function () {

  function toTime(d) {
    if (typeof d === "number") return d;
    // the game saves "yyyy-MM-dd HH:mm:ss"
    const t = Date.parse(String(d || "").replace(" ", "T"));
    return isNaN(t) ? 0 : t;
  }

  // "periodicTableQuiz" -> "Periodic Table Quiz"
  function prettify(id) {
    const s = String(id || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  function flatten(node, path, out, ctx) {
    if (!node || typeof node !== "object") return;

    if (node.score !== undefined) {
      const parts = path.split("/");
      const uid = String(node.studentID || parts[0] || "");
      const quizId = String(node.quizID || parts[1] || "");
      const user = ctx.users[uid] || {};
      // Gamitin ang mismong quiz na sinagutan (quizKey); kung wala (lumang score), ang slot
      const quiz = ctx.quizzes[node.quizKey || quizId] || {};

      out.push({
        id: path,
        uid: uid,
        quizId: quizId,
        studentName: node.studentName || user.username || user.email || "Student " + uid.slice(0, 6),
        quizTitle: node.quizTitle || quiz.title || prettify(quizId),
        score: node.score,
        total: node.total || node.totalQuestions || 0,
        date: toTime(node.date)
      });
      return;
    }

    Object.entries(node).forEach(([k, v]) =>
      flatten(v, path ? path + "/" + k : k, out, ctx));
  }

  /** Turn the raw scores node into a flat list. ctx = { users, quizzes } (optional). */
  function list(value, ctx) {
    const out = [];
    flatten(value, "", out, {
      users: (ctx && ctx.users) || {},
      quizzes: (ctx && ctx.quizzes) || {}
    });
    return out;
  }

  /**
   * Live list: calls cb(list) now and again whenever scores, users or quizzes change.
   */
  function watch(cb) {
    const state = { scores: null, users: {}, quizzes: {} };

    function fire() {
      if (state.scores === null) return;
      cb(list(state.scores, state));
    }

    db.ref("scores").on("value", s => { state.scores = s.val() || {}; fire(); },
      err => console.error("Cannot read scores:", err));
    db.ref("users").on("value", s => { state.users = s.val() || {}; fire(); },
      err => console.error("Cannot read users:", err));
    db.ref("quizzes").on("value", s => { state.quizzes = s.val() || {}; fire(); },
      err => console.error("Cannot read quizzes:", err));
  }

  return { list, watch };
})();
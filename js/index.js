/**
 * AtomMixAR - password reset by emailed 6-digit code.
 * Exports: requestResetCode, resetPasswordWithCode  (Firebase Functions v1, region us-central1)
 *
 * One-time setup (run inside your Firebase project folder):
 *   cd functions && npm install nodemailer
 *   firebase functions:secrets:set GMAIL_USER          (the Gmail address that sends the codes)
 *   firebase functions:secrets:set GMAIL_APP_PASSWORD  (a Google "App password", NOT your normal password)
 *   firebase deploy --only functions
 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

admin.initializeApp();

const DOMAIN = "@cscqc.edu.ph";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_TRIES = 5;
const run = functions.runWith({ secrets: ["GMAIL_USER", "GMAIL_APP_PASSWORD"] });

const bad = (code, msg) => new functions.https.HttpsError(code, msg);
const keyOf = email => crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
const hashCode = (email, code) => crypto.createHash("sha256").update(email + ":" + code).digest("hex");
const cleanEmail = v => String(v || "").trim().toLowerCase();
const codeRef = email => admin.database().ref("resetCodes/" + keyOf(email));

function mailer() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

exports.requestResetCode = run.https.onCall(async data => {
  const email = cleanEmail(data && data.email);
  if (!email.endsWith(DOMAIN)) throw bad("invalid-argument", "Please use your school email (" + DOMAIN + ").");

  const ref = codeRef(email);
  const prev = (await ref.get()).val();
  if (prev && Date.now() - prev.sentAt < RESEND_MS) {
    throw bad("resource-exhausted", "Please wait a minute before asking for another code.");
  }

  // Same answer whether or not the account exists (does not leak who has an account)
  let user;
  try { user = await admin.auth().getUserByEmail(email); } catch (e) { return { ok: true }; }
  const role = (await admin.database().ref("staff/" + user.uid + "/role").get()).val();
  if (role !== "admin" && role !== "teacher") return { ok: true };

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await ref.set({ hash: hashCode(email, code), sentAt: Date.now(), expiresAt: Date.now() + CODE_TTL_MS, tries: 0 });

  await mailer().sendMail({
    from: '"AtomMixAR" <' + process.env.GMAIL_USER + ">",
    to: email,
    subject: "AtomMixAR password reset code",
    text: "Your AtomMixAR password reset code is " + code + ". It expires in 10 minutes. If you did not ask for this, ignore this email."
  });
  return { ok: true };
});

exports.resetPasswordWithCode = run.https.onCall(async data => {
  const email = cleanEmail(data && data.email);
  const code = String((data && data.code) || "").trim();
  const newPassword = String((data && data.newPassword) || "");

  if (!email.endsWith(DOMAIN)) throw bad("invalid-argument", "Please use your school email.");
  if (!/^\d{6}$/.test(code)) throw bad("invalid-argument", "The code must be 6 digits.");
  if (newPassword.length < 8) throw bad("invalid-argument", "Password must be at least 8 characters.");

  const ref = codeRef(email);
  const rec = (await ref.get()).val();
  if (!rec || Date.now() > rec.expiresAt) throw bad("failed-precondition", "That code expired. Press Resend code.");
  if (rec.tries >= MAX_TRIES) { await ref.remove(); throw bad("resource-exhausted", "Too many wrong tries. Request a new code."); }

  const a = Buffer.from(hashCode(email, code));
  const b = Buffer.from(rec.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await ref.update({ tries: rec.tries + 1 });
    throw bad("permission-denied", "Wrong code.");
  }

  let user;
  try { user = await admin.auth().getUserByEmail(email); } catch (e) { throw bad("not-found", "Account not found."); }
  await admin.auth().updateUser(user.uid, { password: newPassword });
  await admin.auth().revokeRefreshTokens(user.uid);
  await ref.remove();
  return { ok: true };
});
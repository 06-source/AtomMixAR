# AtomMixAR — Staff Console

A small admin/teacher website that reads and writes your `atommixar` Firebase
Realtime Database. Admins manage teacher accounts and the student roster;
teachers author quizzes and review scores. It matches the file layout you
already have in VS Code.

```
├── css/
│   ├── style.css        shared tokens, buttons, forms, tables
│   ├── dashboard.css     sidebar + topbar layout, stat tiles, modal
│   └── login.css         sign-in page
├── js/
│   ├── firebase-config.js   your Firebase project keys — EDIT THIS
│   ├── auth.js               shared login/logout/role-guard helpers
│   ├── admin-students.js
│   ├── admin-teachers.js
│   ├── teacher-quizzes.js
│   └── teacher-scores.js
├── index.html            redirects to login or the right dashboard
├── login.html
├── admin-dashboard.html
├── admin-students.html
├── admin-teachers.html
├── teacher-dashboard.html
├── teacher-quizzes.html
├── teacher-scores.html
└── database.rules.json   Realtime Database security rules
```

## 1. Put the files into your VS Code project

You already have this exact folder structure open in VS Code (empty files).
Simplest way to fill them in:

1. Download the ZIP linked in this chat.
2. Unzip it.
3. Drag the unzipped `css/`, `js/`, and every `.html`/`.json`/`.md` file into
   your project folder in the VS Code file explorer, letting them overwrite
   the empty placeholders you already created.

(Or open each file in the file explorer and paste the contents in manually —
same result, just slower.)

## 2. Add your Firebase web config

Open **js/firebase-config.js**. The `databaseURL` is already filled in from
your screenshot. You still need `apiKey`, `messagingSenderId`, and `appId`:

1. In the [Firebase console](https://console.firebase.google.com), open the
   **AtomMixAR** project.
2. Click the gear icon → **Project settings**.
3. Scroll to **Your apps**. If there's no web app (`</>`icon) yet, click
   **Add app → Web**, give it any nickname, and skip the hosting checkbox.
4. Copy the `firebaseConfig` object shown there and paste the matching
   values into `js/firebase-config.js`.

## 3. Turn on Email/Password sign-in

In the Firebase console: **Build → Authentication → Sign-in method →**
enable **Email/Password**.

## 4. Create your first admin account

Nothing in this app can create the *first* admin (admin accounts are meant
to be created by another admin). Do it once, by hand:

1. **Build → Authentication → Users → Add user.** Enter your email and a
   password.
2. Copy the **User UID** it generates.
3. **Build → Realtime Database → Data**, and add this entry (use the ➕ next
   to the root, or the `users` node):
   ```
   users
     └─ <the UID you copied>
          ├─ name: "Your Name"
          ├─ email: "you@example.com"
          └─ role: "admin"
   ```
4. Open `login.html` in a browser and sign in with that email/password —
   you'll land on the admin dashboard. From there, use **Teachers → Add
   teacher** to create teacher logins normally.

## 5. Publish the security rules

**Build → Realtime Database → Rules**, paste in the contents of
`database.rules.json`, and click **Publish**. This restricts reads/writes so
only signed-in admins/teachers can touch `users`, `students`, and `quizzes`,
and only admins can manage other users or the student roster.

## 6. Run it locally

This is a static site — no build step. In VS Code, install the **Live
Server** extension, right-click `login.html`, and choose **Open with Live
Server**. (Opening the HTML file directly from disk also works, but some
browsers restrict `file://` pages more than a local server does.)

## 7. Deploy (optional)

If you want a public URL via Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # pick the AtomMixAR project, use this folder as public dir
firebase deploy
```

## Data model this site uses

- **users/{uid}** — `{ name, email, role: "admin" | "teacher" }`. Written by
  this site (admin creates teachers; you create the first admin by hand).
- **students/{id}** — `{ name, code, grade }`. A roster admins maintain here
  so scores can be labeled with a real name. Students don't log into this
  site — they use the AtomMixAR app itself.
- **quizzes/{id}** — `{ title, description, questions: { text, options[4],
  correctIndex }, createdBy, createdByName }`. Written by teachers here,
  meant to be read by the AtomMixAR app.
- **scores/{id}** — `{ studentName, quizId, quizTitle, score, total, date }`.
  Written by the AtomMixAR app when a student finishes a quiz; this site
  only reads/deletes entries.
- **mixHistory** — untouched by this site; it's whatever your AR app already
  logs there.

## Known limitation

Revoking a teacher's access here removes their `/users/{uid}` record, which
blocks them from signing into any dashboard. It does **not** delete their
underlying Firebase Auth login — that needs the Firebase console
(**Authentication → Users**) or a Cloud Function with the Admin SDK, since
the browser-side SDK isn't allowed to delete other people's accounts.

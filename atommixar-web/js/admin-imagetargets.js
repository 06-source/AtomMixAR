/** AtomMixAR — Admin: image targets (files kept in Firebase Storage under imageTargets/). */
AppAuth.requireRole("admin", function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const root = firebase.storage().ref("imageTargets");
  const tbody = $("targetsBody"), empty = $("emptyState"), form = $("uploadForm"), btn = $("upBtn");

  function showAlert(msg, ok) { const a = $("tAlert"); a.textContent = msg; a.className = "alert " + (ok ? "alert-ok" : "alert-error") + " show"; }
  function friendly(err) {
    return err.code === "storage/unauthorized"
      ? "Firebase Storage is not allowing this yet. In the Firebase console, open Storage > Rules and allow signed-in users to read and write imageTargets/."
      : (err.message || "Something went wrong.").replace("Firebase: ", "");
  }

  function load() {
    root.listAll()
      .then(res => Promise.all(res.items.map(it => it.getDownloadURL().then(url => ({ it, url })))))
      .then(list => {
        list.sort((a, b) => a.it.name.localeCompare(b.it.name));
        empty.classList.toggle("hidden", list.length > 0);
        tbody.innerHTML = list.map(({ it, url }) => `<tr>
          <td><img src="${esc(url)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px"></td>
          <td>${esc(it.name)}</td>
          <td class="row"><a class="btn btn-sm" href="${esc(url)}" target="_blank" rel="noopener">View</a>
            <button class="btn-sm btn-danger" data-del="${esc(it.name)}">Delete</button></td></tr>`).join("");
        tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
          if (!confirm("Delete this image target? The AR feature will stop recognizing it.")) return;
          root.child(b.dataset.del).delete().then(load).catch(e => showAlert(friendly(e)));
        }));
      })
      .catch(e => { empty.classList.remove("hidden"); showAlert(friendly(e)); });
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const f = $("tFile").files[0];
    const base = $("tName").value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!base) { showAlert("Enter a target name using letters or numbers."); return; }
    if (!f || !/^image\/(png|jpeg)$/.test(f.type)) { showAlert("Choose a PNG or JPG image."); return; }
    if (f.size > 5 * 1024 * 1024) { showAlert("The image must be smaller than 5 MB."); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Uploading…';
    root.child(base + (f.type === "image/png" ? ".png" : ".jpg")).put(f)
      .then(() => { form.reset(); showAlert("Image target uploaded.", true); load(); })
      .catch(err => showAlert(friendly(err)))
      .finally(() => { btn.disabled = false; btn.textContent = "Upload target"; });
  });
  load();
});
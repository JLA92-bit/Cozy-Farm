/* Cozy Acres site script: progressive enhancement only. Pages work without it. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Footer year
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Close mobile menu after choosing a link
  $$(".menu a").forEach(function (a) { a.addEventListener("click", function () { a.closest("details").removeAttribute("open"); }); });

  // Screenshot carousel buttons
  $$("[data-carousel]").forEach(function (c) {
    var track = $(".carousel__track", c);
    var step = function (dir) {
      var item = track.querySelector("li");
      var w = item ? item.getBoundingClientRect().width + 20 : 250;
      track.scrollBy({ left: dir * w, behavior: "smooth" });
    };
    var p = $("[data-prev]", c), n = $("[data-next]", c);
    if (p) p.addEventListener("click", function () { step(-1); });
    if (n) n.addEventListener("click", function () { step(1); });
  });

  // ---- What's new: render latest N updates from changelog.json ----
  function versionKey(v) { return String(v).split(".").map(function (x) { return ("000" + parseInt(x, 10)).slice(-4); }).join("."); }
  function formatDate(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  var cl = $("[data-changelog]");
  var tpl = $("#update-card-tpl");
  if (cl && tpl && window.fetch) {
    fetch(cl.getAttribute("data-changelog"), { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (data) {
      var list = (data.updates || data).slice().sort(function (a, b) { return versionKey(b.version) < versionKey(a.version) ? -1 : 1; });
      list = list.slice(0, parseInt(cl.getAttribute("data-limit") || "3", 10));
      if (!list.length) return;
      cl.innerHTML = "";
      list.forEach(function (u, i) {
        var node = tpl.content.firstElementChild.cloneNode(true);
        if (i === 0) node.classList.add("update-card--latest");
        $("[data-f=version]", node).textContent = "v" + u.version;
        var t = $("[data-f=date]", node); t.textContent = formatDate(u.date); t.setAttribute("datetime", u.date);
        $("[data-f=name]", node).textContent = u.name;
        var note = $("[data-f=note]", node);
        if (u.note) { note.querySelector("span").textContent = u.note; if (!u.heart) note.querySelector("img").remove(); } else note.remove();
        var ul = $("[data-f=items]", node);
        (u.highlights || []).forEach(function (h) { var li = document.createElement("li"); li.textContent = h; ul.appendChild(li); });
        cl.appendChild(node);
      });
    }).catch(function () { /* keep the server-rendered cards */ });
  }

  // ---- Top farmers: live leaderboard ----
  var lbSec = $("[data-leaderboard]");
  var lbTpl = $("#lb-row-tpl");
  function showLb(rows) {
    if (!rows || !rows.length) return;
    var ol = $(".leaderboard", lbSec);
    ol.innerHTML = "";
    rows.slice(0, 5).forEach(function (f, i) {
      var rank = i + 1;
      var node = lbTpl.content.firstElementChild.cloneNode(true);
      node.classList.add("lb-row--" + rank);
      var av = $("[data-f=avatar]", node); av.src = "/assets/icons/" + (f.avatar || "cow_face") + ".svg";
      $("[data-f=name]", node).textContent = f.name;
      $("[data-f=level]", node).textContent = "Level " + f.level;
      var holder = $(".lb-row__avatar", node);
      if (rank <= 3) {
        var m = document.createElement("img");
        m.className = "lb-row__medal"; m.width = 32; m.height = 32;
        m.src = "/assets/icons/" + ["1st", "2nd", "3rd"][rank - 1] + "_place_medal.svg";
        m.alt = ["Gold", "Silver", "Bronze"][rank - 1] + " medal, rank " + rank;
        holder.appendChild(m);
      } else {
        var s = document.createElement("span"); s.className = "lb-row__rank"; s.textContent = rank; s.setAttribute("aria-label", "Rank " + rank);
        holder.appendChild(s);
      }
      ol.appendChild(node);
    });
    lbSec.hidden = false;
  }
  if (lbSec) {
    if ($(".leaderboard li", lbSec)) lbSec.hidden = false; // server-rendered fallback
    if (lbTpl && window.fetch) {
      fetch(lbSec.getAttribute("data-leaderboard"), { cache: "no-cache" }).then(function (r) { return r.json(); })
        .then(function (d) { showLb(d.farmers || d); }).catch(function () {});
    }
  }

  // ---- Delete my data form ----
  var form = $("#delete-form");
  if (form) {
    var input = $("#friend-code", form), err = $("#code-error", form);
    var ok = $("[data-state=ok]", form), bad = $("[data-state=error]", form);
    var btn = $("button[type=submit]", form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      ok.hidden = true; bad.hidden = true;
      var code = input.value.trim().toUpperCase();
      var valid = /^[A-Z0-9-]{4,16}$/.test(code);
      input.setAttribute("aria-invalid", valid ? "false" : "true");
      err.hidden = valid;
      if (!valid) { input.focus(); return; }
      if (!form.confirm.checked) { form.confirm.focus(); return; }
      btn.disabled = true; btn.textContent = "Deleting...";
      fetch(form.getAttribute("data-endpoint"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code })
      }).then(function (r) {
        if (!r.ok) throw r;
        ok.hidden = false; form.reset(); ok.focus && ok.setAttribute("tabindex", "-1"); ok.focus();
      }).catch(function (r) {
        if (r && r.status === 404) $("[data-msg]", bad).firstChild.textContent = "We could not find that friend code. Check it and try again, or email ";
        else if (r && r.status === 429) $("[data-msg]", bad).firstChild.textContent = "Too many tries. Please wait a few minutes, or email ";
        bad.hidden = false;
      }).then(function () { btn.disabled = false; btn.textContent = "Delete my data"; });
    });
  }
})();

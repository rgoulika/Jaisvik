/* =====================================================================
   PlayKit — one shared game layer for all of Jaisvik's apps.
   Drop <script src="playkit.js"></script> before </body> in any app,
   then call PlayKit.win() whenever the child gets something right.

   What it adds:
     • One pet dragon fed by stars earned in EVERY app
     • Combo streaks with a rising chime
     • A daily quest ring
     • A badge shelf
   ===================================================================== */
(function () {
  "use strict";
  if (window.PlayKit) return;

  /* ---------- storage: real disk on a website, memory as a fallback ---------- */
  var KEY = "jaisvik.playkit.v1";
  var mem = {};
  function read() {
    try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {}
    return mem[KEY] ? JSON.parse(mem[KEY]) : null;
  }
  function write(o) {
    var s = JSON.stringify(o);
    mem[KEY] = s;
    try { localStorage.setItem(KEY, s); } catch (e) {}
  }

  var today = new Date().toISOString().slice(0, 10);
  var D = Object.assign(
    { stars: 0, day: today, todayStars: 0, streakDays: 0, lastPlay: "", badges: [], bestCombo: 0 },
    read() || {}
  );
  if (D.day !== today) {
    var y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    D.streakDays = D.lastPlay === y ? (D.streakDays || 0) + 1 : 0;
    D.day = today;
    D.todayStars = 0;
  }
  function save() { write(D); }

  /* ---------- the dragon grows ---------- */
  var STAGES = [
    { at: 0,   em: "🥚", name: "a quiet egg" },
    { at: 12,  em: "🐣", name: "just hatched" },
    { at: 30,  em: "🦕", name: "a baby dragon" },
    { at: 60,  em: "🐲", name: "a young dragon" },
    { at: 110, em: "🐉", name: "a big dragon" },
    { at: 180, em: "✨",  name: "a star dragon", pair: "🐉" }
  ];
  var QUEST = 12;

  function stageIdx(n) { var i = 0; for (var k = 0; k < STAGES.length; k++) if (n >= STAGES[k].at) i = k; return i; }
  function stageFace(i) { var s = STAGES[i]; return (s.pair || "") + s.em; }
  function nextAt(i) { return i + 1 < STAGES.length ? STAGES[i + 1].at : null; }

  var BADGES = [
    { id: "hatch",  em: "🐣", need: function () { return D.stars >= 12; },        text: "Egg hatched" },
    { id: "baby",   em: "🦕", need: function () { return D.stars >= 30; },        text: "Baby dragon" },
    { id: "young",  em: "🐲", need: function () { return D.stars >= 60; },        text: "Young dragon" },
    { id: "big",    em: "🐉", need: function () { return D.stars >= 110; },       text: "Big dragon" },
    { id: "star",   em: "✨", need: function () { return D.stars >= 180; },       text: "Star dragon" },
    { id: "quest1", em: "🎯", need: function () { return D.todayStars >= QUEST; },text: "Finished a day" },
    { id: "week",   em: "📅", need: function () { return D.streakDays >= 7; },    text: "Seven days running" },
    { id: "combo5", em: "🔥", need: function () { return D.bestCombo >= 5; },     text: "Five in a row" },
    { id: "combo10",em: "🌋", need: function () { return D.bestCombo >= 10; },    text: "Ten in a row" },
    { id: "c100",   em: "💯", need: function () { return D.stars >= 100; },       text: "One hundred stars" }
  ];

  /* ---------- sound ---------- */
  var ac = null;
  function beep(freqs, step, type, vol) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      freqs.forEach(function (f, i) {
        var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * (step || 0.09);
        o.type = type || "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (step || 0.09) + 0.05);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + (step || 0.09) + 0.08);
      });
    } catch (e) {}
  }
  function speak(t) {
    try {
      var u = new SpeechSynthesisUtterance(t);
      u.lang = "en-IN"; u.rate = 0.9; u.pitch = 1.3;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent = [
    "#pk{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483000;",
    "font-family:ui-rounded,'Fredoka','Nunito',system-ui,sans-serif;-webkit-user-select:none;user-select:none}",
    "#pk *{box-sizing:border-box}",
    "#pk-pet{width:64px;height:64px;border-radius:50%;background:#fff;border:3px solid #2B2140;",
    "box-shadow:3px 3px 0 #2B2140;display:grid;place-items:center;font-size:31px;cursor:pointer;position:relative;",
    "transition:transform .12s}",
    "#pk-pet:active{transform:scale(.93)}",
    "#pk-pet.pk-hop{animation:pkhop .5s cubic-bezier(.3,1.6,.5,1)}",
    "@keyframes pkhop{0%{transform:none}35%{transform:translateY(-16px) scale(1.14) rotate(-8deg)}100%{transform:none}}",
    "#pk-ring{position:absolute;inset:-7px;border-radius:50%;pointer-events:none;",
    "background:conic-gradient(#FF9F1C var(--pkq,0%),rgba(43,33,64,.13) 0)}",
    "#pk-ring::after{content:'';position:absolute;inset:4px;border-radius:50%;background:#EFEAFF}",
    "#pk-combo{position:absolute;top:-9px;right:-9px;min-width:26px;height:26px;padding:0 5px;border-radius:13px;",
    "background:#FF5D8F;color:#fff;border:2.5px solid #2B2140;font-size:13px;font-weight:800;display:none;",
    "align-items:center;justify-content:center;line-height:1}",
    "#pk-combo.on{display:flex;animation:pkpop .3s}",
    "@keyframes pkpop{0%{transform:scale(.4)}70%{transform:scale(1.25)}100%{transform:scale(1)}}",
    "#pk-bub{position:absolute;left:74px;bottom:16px;background:#fff;border:3px solid #2B2140;border-radius:16px;",
    "padding:7px 12px;font-size:14px;font-weight:800;color:#2B2140;white-space:nowrap;box-shadow:3px 3px 0 #2B2140;",
    "opacity:0;transform:translateX(-8px);transition:opacity .2s,transform .2s;pointer-events:none}",
    "#pk-bub.on{opacity:1;transform:none}",
    "#pk-sheet{position:fixed;inset:0;background:rgba(43,33,64,.72);z-index:2147483001;display:none;",
    "align-items:flex-end;justify-content:center}",
    "#pk-sheet.on{display:flex}",
    "#pk-in{background:#EFEAFF;width:100%;max-width:480px;border-radius:26px 26px 0 0;border-top:4px solid #2B2140;",
    "padding:20px 18px calc(22px + env(safe-area-inset-bottom));max-height:86dvh;overflow:auto;color:#2B2140}",
    "#pk-in h3{font-size:23px;margin:0 0 2px;font-weight:700}",
    "#pk-in p{margin:0 0 15px;font-size:13px;font-weight:800;opacity:.62}",
    "#pk-big{font-size:74px;text-align:center;line-height:1.05;margin:4px 0 6px}",
    "#pk-bar{height:20px;border:3px solid #2B2140;border-radius:12px;background:#fff;overflow:hidden;margin-bottom:7px}",
    "#pk-bar i{display:block;height:100%;background:#2EC4B6;width:0}",
    ".pk-stat{display:flex;gap:9px;margin:13px 0 4px}",
    ".pk-stat div{flex:1;background:#fff;border:3px solid #2B2140;border-radius:16px;padding:9px;text-align:center}",
    ".pk-stat b{display:block;font-size:22px;font-weight:700}",
    ".pk-stat span{font-size:11px;font-weight:800;opacity:.6}",
    "#pk-badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}",
    ".pk-b{width:52px;height:52px;border-radius:15px;border:3px solid #2B2140;background:#fff;display:grid;",
    "place-items:center;font-size:24px}",
    ".pk-b.off{opacity:.2;filter:grayscale(1)}",
    "#pk-close{width:100%;margin-top:16px;padding:14px;border:3px solid #2B2140;border-radius:18px;background:#2EC4B6;",
    "font:inherit;font-size:18px;font-weight:700;color:#2B2140;cursor:pointer}",
    "#pk-fx{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483002}",
    ".pk-bit{position:absolute;font-size:26px;animation:pkfall 1.5s ease-in forwards}",
    "@keyframes pkfall{to{transform:translateY(106vh) rotate(420deg);opacity:0}}",
    "@media(prefers-reduced-motion:reduce){#pk *,.pk-bit{animation:none!important;transition:none!important}}"
  ].join("");
  document.head.appendChild(css);

  /* ---------- markup ---------- */
  var pk = document.createElement("div");
  pk.id = "pk";
  pk.innerHTML =
    '<div id="pk-bub"></div>' +
    '<div id="pk-pet" role="button" tabindex="0" aria-label="Your dragon">' +
      '<div id="pk-ring"></div><span id="pk-face" style="position:relative"></span>' +
      '<span id="pk-combo"></span>' +
    "</div>";
  var fx = document.createElement("div"); fx.id = "pk-fx";
  var sheet = document.createElement("div"); sheet.id = "pk-sheet";
  sheet.innerHTML =
    '<div id="pk-in">' +
      '<div id="pk-big"></div>' +
      '<h3 id="pk-name"></h3><p id="pk-goal"></p>' +
      '<div id="pk-bar"><i></i></div>' +
      '<div class="pk-stat">' +
        '<div><b id="pk-s1">0</b><span>STARS</span></div>' +
        '<div><b id="pk-s2">0</b><span>TODAY</span></div>' +
        '<div><b id="pk-s3">0</b><span>DAY RUN</span></div>' +
      "</div>" +
      '<p style="margin:14px 0 6px">Badges</p><div id="pk-badges"></div>' +
      '<button id="pk-close">Back to playing</button>' +
    "</div>";

  function mount() {
    document.body.appendChild(pk);
    document.body.appendChild(fx);
    document.body.appendChild(sheet);
    document.getElementById("pk-pet").addEventListener("click", open);
    document.getElementById("pk-close").addEventListener("click", close);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) close(); });
    paint();
  }

  /* ---------- painting ---------- */
  function paint() {
    var i = stageIdx(D.stars);
    document.getElementById("pk-face").textContent = stageFace(i);
    var q = Math.min(1, D.todayStars / QUEST);
    document.getElementById("pk-ring").style.setProperty("--pkq", (q * 100).toFixed(1) + "%");
  }
  function bubble(text, ms) {
    var b = document.getElementById("pk-bub");
    b.textContent = text; b.classList.add("on");
    clearTimeout(bubble.t);
    bubble.t = setTimeout(function () { b.classList.remove("on"); }, ms || 1800);
  }
  function confetti(n) {
    var bits = ["⭐", "✨", "🎉", "💫", "🌈"];
    for (var i = 0; i < (n || 14); i++) {
      var s = document.createElement("span");
      s.className = "pk-bit";
      s.textContent = bits[(Math.random() * bits.length) | 0];
      s.style.left = (Math.random() * 94) + "%";
      s.style.animationDelay = (Math.random() * 0.35) + "s";
      s.style.fontSize = (19 + Math.random() * 18) + "px";
      fx.appendChild(s);
      (function (el) { setTimeout(function () { el.remove(); }, 2000); })(s);
    }
  }

  /* ---------- the sheet ---------- */
  function open() {
    var i = stageIdx(D.stars), nx = nextAt(i);
    document.getElementById("pk-big").textContent = stageFace(i);
    document.getElementById("pk-name").textContent = "Your dragon is " + STAGES[i].name;
    document.getElementById("pk-goal").textContent = nx
      ? (nx - D.stars) + " more stars to grow bigger"
      : "Fully grown. Keep collecting!";
    var lo = STAGES[i].at, hi = nx || (lo + 1);
    document.querySelector("#pk-bar i").style.width =
      (nx ? Math.min(100, ((D.stars - lo) / (hi - lo)) * 100) : 100) + "%";
    document.getElementById("pk-s1").textContent = D.stars;
    document.getElementById("pk-s2").textContent = D.todayStars + "/" + QUEST;
    document.getElementById("pk-s3").textContent = D.streakDays;
    document.getElementById("pk-badges").innerHTML = BADGES.map(function (b) {
      var got = D.badges.indexOf(b.id) >= 0;
      return '<div class="pk-b ' + (got ? "" : "off") + '" title="' + b.text + '">' + b.em + "</div>";
    }).join("");
    sheet.classList.add("on");
  }
  function close() { sheet.classList.remove("on"); }

  /* ---------- the loop ---------- */
  var combo = 0, comboTimer = null;

  function checkBadges() {
    BADGES.forEach(function (b) {
      if (D.badges.indexOf(b.id) < 0 && b.need()) {
        D.badges.push(b.id);
        setTimeout(function () { bubble("New badge " + b.em, 2400); beep([660, 880, 1100], 0.1); }, 700);
      }
    });
  }

  function win(n) {
    n = n || 1;
    var before = stageIdx(D.stars);
    combo++;
    if (combo > (D.bestCombo || 0)) D.bestCombo = combo;
    var bonus = combo >= 3 ? n : 0;              // hot streak doubles the star
    D.stars += n + bonus;
    D.todayStars += n + bonus;
    D.lastPlay = today;

    var pet = document.getElementById("pk-pet");
    pet.classList.remove("pk-hop"); void pet.offsetWidth; pet.classList.add("pk-hop");

    var c = document.getElementById("pk-combo");
    if (combo >= 3) { c.textContent = "🔥" + combo; c.classList.add("on"); }
    beep(combo >= 3 ? [660, 880, 1175] : [620, 830], 0.08);

    clearTimeout(comboTimer);
    comboTimer = setTimeout(function () { combo = 0; c.classList.remove("on"); }, 45000);

    var after = stageIdx(D.stars);
    if (after > before) {
      confetti(26);
      bubble("Your dragon grew!", 3000);
      setTimeout(function () { speak("Look! Your dragon grew bigger!"); }, 350);
    } else if (D.todayStars === QUEST) {
      confetti(20);
      bubble("Today's quest done 🎯", 3000);
      setTimeout(function () { speak("You finished today's quest. Well done!"); }, 350);
    } else if (combo === 5) {
      bubble("Five in a row 🔥", 2000);
    }

    checkBadges();
    save();
    paint();
  }

  function miss() {
    combo = 0;
    var c = document.getElementById("pk-combo");
    if (c) c.classList.remove("on");
  }

  window.PlayKit = { win: win, miss: miss, open: open, data: function () { return D; } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();

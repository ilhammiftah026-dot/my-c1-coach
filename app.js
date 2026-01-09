// =======================
// My C1 Coach - app.js
// Offline-friendly (LocalStorage)
// =======================

const STORAGE_KEY = "my_c1_coach_v1";

const DEFAULT_STATE = {
  settings: {
    targetDate: "",     // yyyy-mm-dd
    dailyTime: 30,      // minutes
    weekendTime: 120,   // minutes per day
    links: { link1: "", link2: "", link3: "" }
  },
  profile: {
    themes: "",
    hard: "both"
  },
  diagnostic: {
    reading: { score: 0, total: 5 },
    grammar: { score: 0, total: 5 },
    writingSelf: 1,   // /4
    speakingSelf: 0,  // /4
    estimatedLevel: "",
    priorities: [],
    strengths: [],
    lastRunAt: ""
  },
  plan: {
    generatedAt: "",
    structure: [],
    days: []
  },
  streak: {
    count: 0,
    lastDoneDate: "" // yyyy-mm-dd
  }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_STATE), parsed);
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function deepMerge(target, src) {
  for (const k in src) {
    if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      deepMerge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function formatMin(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(startISO, days) {
  const d = new Date(startISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

let state = loadState();

// -----------------------
// Routing (tabs)
// -----------------------
function setRoute(route) {
  $all(".tab").forEach(b => b.classList.toggle("active", b.dataset.route === route));
  $all(".page").forEach(p => p.classList.remove("active"));
  const page = document.getElementById(`page-${route}`);
  if (page) page.classList.add("active");

  if (route === "home") renderHome();
  if (route === "results") renderResults();
  if (route === "plan") renderPlan();
  if (route === "coach") {
    renderCoach();
    renderGrammarCoach(); // ✅ NEW
  }
  if (route === "settings") renderSettings();
}

function bindTabs() {
  $all(".tab").forEach(btn => {
    btn.addEventListener("click", () => setRoute(btn.dataset.route));
  });
}

// -----------------------
// Diagnostic scoring
// -----------------------
function computeDiagnostic() {
  const questions = $all(".q");
  let readingCorrect = 0, readingTotal = 0;
  let grammarCorrect = 0, grammarTotal = 0;

  for (const q of questions) {
    const skill = q.dataset.skill;
    const answer = q.dataset.answer;
    const input = q.querySelector("input[type=radio]:checked");
    const ok = input && input.value === answer;

    if (skill === "reading") {
      readingTotal++;
      if (ok) readingCorrect++;
    } else if (skill === "grammar") {
      grammarTotal++;
      if (ok) grammarCorrect++;
    }
  }

  const writingSelf = Number($("#self-writing").value || 0);
  const speakingSelf = Number($("#self-speaking").value || 0);

  const total = readingTotal + grammarTotal + 8;
  const points = readingCorrect + grammarCorrect + writingSelf + speakingSelf;

  const pct = Math.round((points / total) * 100);

  let level = "A2";
  if (pct >= 35) level = "B1";
  if (pct >= 50) level = "B1+";
  if (pct >= 62) level = "B2";
  if (pct >= 74) level = "B2+";
  if (pct >= 85) level = "C1";

  const skills = [
    { key: "Compréhension écrite", val: readingCorrect / Math.max(1, readingTotal) },
    { key: "Grammaire", val: grammarCorrect / Math.max(1, grammarTotal) },
    { key: "Expression écrite", val: writingSelf / 4 },
    { key: "Expression orale", val: speakingSelf / 4 }
  ];
  skills.sort((a, b) => a.val - b.val);

  const priorities = [];
  const strengths = [];

  const priorityTemplates = {
    "Compréhension écrite": "Compréhension écrite : connecteurs, implicite, reformulation.",
    "Grammaire": "Grammaire/lexique : subjonctif, accords, pronoms, registre soutenu.",
    "Expression écrite": "Production écrite : structure + connecteurs + précision lexicale (180–220 mots).",
    "Expression orale": "Production orale : plan, transitions, exemples, reformulation."
  };

  priorities.push(priorityTemplates[skills[0].key]);
  priorities.push(priorityTemplates[skills[1].key]);

  strengths.push("Base présente : on va structurer la progression vers B2+/C1.");
  if (skills[3].val >= 0.6) strengths.push(`Plutôt à l’aise en ${skills[3].key.toLowerCase()}.`);

  state.diagnostic = {
    reading: { score: readingCorrect, total: readingTotal },
    grammar: { score: grammarCorrect, total: grammarTotal },
    writingSelf,
    speakingSelf,
    estimatedLevel: level,
    priorities,
    strengths,
    lastRunAt: new Date().toISOString()
  };

  state.profile.themes = $("#profile-themes").value.trim();
  state.profile.hard = $("#profile-hard").value;

  saveState();
  return { points, total, pct, level };
}

// -----------------------
// Plan generator
// -----------------------
function generatePlan30Days() {
  const { dailyTime, weekendTime } = state.settings;
  const priorities = state.diagnostic.priorities.length
    ? state.diagnostic.priorities
    : [
        "Compréhension écrite : connecteurs, implicite, reformulation.",
        "Grammaire/lexique : subjonctif, accords, pronoms, registre soutenu."
      ];

  const structure = [
    `Lun–Ven (${formatMin(dailyTime)}) : 1 bloc grammaire + 1 bloc vocab + 1 mini production (écrit/oral).`,
    `Week-end (${formatMin(weekendTime)}) : compréhension (audio/texte) + production longue + correction + reformulation.`,
    `Chaque jour : 10 min de révision (Anki / listes) + 1 connecteur + 2 reformulations.`
  ];

  const start = todayISO();
  const days = [];

  for (let i = 0; i < 30; i++) {
    const date = addDaysISO(start, i);
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const minutes = isWeekend ? weekendTime : dailyTime;

    const focus = pickDailyFocus(i);
    const tasks = buildTasks(focus, minutes, priorities);

    days.push({ date, minutes, focus, tasks });
  }

  state.plan = { generatedAt: new Date().toISOString(), structure, days };
  saveState();
}

function pickDailyFocus(i) {
  const cycle = ["Grammaire", "Vocabulaire", "Écrit", "Oral", "Lecture", "Écoute"];
  return cycle[i % cycle.length];
}

function buildTasks(focus, minutes, priorities) {
  const links = Object.values(state.settings.links).filter(Boolean);
  const linkLine = links.length ? `Ressource: ${links[0]}` : "Ressource: (ajoute tes liens dans Réglages)";

  const base = [
    `✅ 10 min : révision vocab (liste/Anki) + 5 mots + 2 phrases.`,
    `✅ 10 min : grammaire (accords / pronoms / subjonctif) + 5 exemples.`,
    `✅ 10 min : reformulation (2 phrases → 2 reformulations chacune).`,
  ];

  const add = [];
  if (focus === "Grammaire") {
    add.push("📌 Grammaire : subjonctif (que/quoi/dont), accords du participe, pronoms.");
    add.push("✍️ Mini production : 6 phrases avec connecteurs (cependant, en revanche, donc…).");
  } else if (focus === "Vocabulaire") {
    add.push("📌 Lexique : mots académiques (cause/conséquence, nuance, concession).");
    add.push("🗣️ Oral : 2 minutes — résumer un sujet d’économie en langage simple.");
  } else if (focus === "Écrit") {
    add.push("✍️ Production écrite : 120–180 mots (opinion + 2 arguments + exemple).");
    add.push("🔍 Correction : vérifier accords + connecteurs + précision lexicale.");
  } else if (focus === "Oral") {
    add.push("🗣️ Production orale : plan 3 parties + transitions (d’abord/ensuite/enfin).");
    add.push("🎙️ Reformulation : répéter la même idée en 3 façons différentes.");
  } else if (focus === "Lecture") {
    add.push("📖 Lecture : 1 article court → surligner connecteurs + implicite.");
    add.push("🧠 Reformulation : 5 phrases du texte en tes mots.");
  } else if (focus === "Écoute") {
    add.push("🎧 Écoute : 5–10 min → noter 8 mots nouveaux.");
    add.push("🗣️ Résumé oral : 60–90 sec + 2 reformulations.");
  }

  const extra = [];
  if (minutes >= 45) extra.push("➕ Bonus 10 min : 1 exercice de grammaire + correction.");
  if (minutes >= 120) extra.push("➕ Bonus week-end : rédaction 200 mots + auto-correction (accords/connecteurs).");

  const pri = priorities.slice(0, 2).map(p => `🎯 ${p}`);
  return [...pri, ...base, ...add, ...extra, linkLine];
}

// -----------------------
// Coach of the day + streak
// -----------------------
function renderCoach() {
  $("#coach-date").textContent = new Date().toLocaleDateString("fr-FR", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  $("#coach-streak").textContent = String(state.streak.count);

  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const focus = pickDailyFocus(dayIndex);

  const minutes = isWeekendToday() ? state.settings.weekendTime : state.settings.dailyTime;
  const priorities = state.diagnostic.priorities.length ? state.diagnostic.priorities : [
    "Compréhension écrite : connecteurs, implicite, reformulation.",
    "Grammaire/lexique : subjonctif, accords, pronoms, registre soutenu."
  ];

  const tasks = buildTasks(focus, minutes, priorities);

  $("#coach-session").innerHTML = `
    <h3>Séance (${formatMin(minutes)}) — Focus: ${escapeHtml(focus)}</h3>
    <ul>${tasks.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
  `;

  // ✅ also show grammar lesson
  renderGrammarCoach();
}

function isWeekendToday() {
  const d = new Date();
  const day = d.getDay();
  return day === 0 || day === 6;
}

function markDoneToday() {
  const t = todayISO();
  if (state.streak.lastDoneDate === t) return;

  if (state.streak.lastDoneDate) {
    const prev = state.streak.lastDoneDate;
    const prevDate = new Date(prev + "T00:00:00");
    const curDate = new Date(t + "T00:00:00");
    const diffDays = Math.round((curDate - prevDate) / (1000*60*60*24));
    state.streak.count = (diffDays === 1) ? state.streak.count + 1 : 1;
  } else {
    state.streak.count = 1;
  }

  state.streak.lastDoneDate = t;
  saveState();
}

// -----------------------
// Rendering
// -----------------------
function renderHome() {
  $("#home-level").textContent = state.diagnostic.estimatedLevel || "—";
  $("#home-streak").textContent = String(state.streak.count);
  $("#home-daily").textContent = formatMin(state.settings.dailyTime);

  const target = state.settings.targetDate
    ? new Date(state.settings.targetDate + "T00:00:00").toLocaleDateString("fr-FR")
    : "Choisis une date cible dans Réglages (ex: dans 6 mois).";

  $("#home-goal").textContent = `Objectif: C1 • Date cible: ${target}`;

  const pr = state.diagnostic.priorities.length
    ? state.diagnostic.priorities
    : [
        "Compréhension écrite : connecteurs, implicite, reformulation.",
        "Grammaire/lexique : subjonctif, accords, pronoms, registre soutenu.",
        "Production écrite : structure + connecteurs + précision lexicale (180–220 mots).",
        "Production orale : plan, transitions, exemples, reformulation."
      ];

  $("#home-priorities").innerHTML = pr.slice(0, 4).map(x => `<li>${escapeHtml(x)}</li>`).join("");
}

function renderResults() {
  const d = state.diagnostic;
  $("#res-level").textContent = d.estimatedLevel || "—";

  if (!d.lastRunAt) {
    $("#res-scores").textContent = "Fais d’abord le diagnostic 🙂";
    $("#res-strengths").innerHTML = `<li>—</li>`;
    $("#res-priorities").innerHTML = `<li>—</li>`;
    return;
  }

  $("#res-scores").textContent =
    `Compréhension écrite: ${d.reading.score}/${d.reading.total} • ` +
    `Grammaire: ${d.grammar.score}/${d.grammar.total} • ` +
    `Écrit (auto): ${d.writingSelf}/4 • Oral (auto): ${d.speakingSelf}/4`;

  $("#res-strengths").innerHTML = d.strengths.map(x => `<li>${escapeHtml(x)}</li>`).join("");
  $("#res-priorities").innerHTML = d.priorities.map(x => `<li>${escapeHtml(x)}</li>`).join("");
}

function renderPlan() {
  if (!state.plan.days.length) {
    $("#plan-target").textContent = state.settings.targetDate || "—";
    $("#plan-daily").textContent = formatMin(state.settings.dailyTime);
    $("#plan-weekend").textContent = formatMin(state.settings.weekendTime);
    $("#plan-structure").innerHTML = `<li>Génère ton plan depuis “Résultats”</li>`;
    $("#plan-days").innerHTML = "";
    return;
  }

  $("#plan-target").textContent = state.settings.targetDate || "—";
  $("#plan-daily").textContent = formatMin(state.settings.dailyTime);
  $("#plan-weekend").textContent = formatMin(state.settings.weekendTime);

  $("#plan-structure").innerHTML = state.plan.structure.map(x => `<li>${escapeHtml(x)}</li>`).join("");

  $("#plan-days").innerHTML = state.plan.days.map((d, idx) => `
    <div class="day">
      <div class="dtitle">Jour ${idx + 1} — ${escapeHtml(d.focus)}</div>
      <div class="dmeta">${escapeHtml(d.date)} • ${escapeHtml(formatMin(d.minutes))}</div>
      <ul>${d.tasks.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </div>
  `).join("");
}

function renderSettings() {
  if (!state.settings.targetDate) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    state.settings.targetDate = `${yyyy}-${mm}-${dd}`;
    saveState();
  }

  $("#set-target").value = state.settings.targetDate;
  $("#set-daily").value = String(state.settings.dailyTime);
  $("#set-weekend").value = String(state.settings.weekendTime);

  $("#link1").value = state.settings.links.link1 || "";
  $("#link2").value = state.settings.links.link2 || "";
  $("#link3").value = state.settings.links.link3 || "";
}

// -----------------------
// Export/Import
// -----------------------
function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-c1-coach-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = deepMerge(structuredClone(DEFAULT_STATE), parsed);
      saveState();
      renderHome();
      renderResults();
      renderPlan();
      renderSettings();
      renderCoach();
      alert("Import terminé ✅");
    } catch (e) {
      alert("Fichier invalide ❌");
    }
  };
  reader.readAsText(file);
}

// -----------------------
// Helpers
// -----------------------
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ================================
// C1 GRAMMAR ENGINE ✅
// ================================
const GRAMMAR_PROGRAM = [
  {
    title: "Les connecteurs logiques",
    rule: "Les connecteurs servent à structurer un texte (cause, conséquence, opposition, but).",
    example: "Bien que l'économie progresse, le chômage reste élevé.",
    exercise: "Complète : ___ il pleuve, je viendrai.",
    answer: "Bien que"
  },
  {
    title: "Le subjonctif",
    rule: "On utilise le subjonctif après certaines expressions de doute, nécessité, émotion.",
    example: "Il faut que tu fasses attention.",
    exercise: "Complète : Il est important que tu ___ (être) ponctuelle.",
    answer: "sois"
  },
  {
    title: "Accords du participe passé",
    rule: "Le participe passé s'accorde avec le COD placé avant.",
    example: "Les lettres que j'ai écrites.",
    exercise: "Complète : Les fautes que j'ai ___ (corriger).",
    answer: "corrigées"
  },
  {
    title: "Pronoms relatifs",
    rule: "Qui, que, dont, où servent à relier deux propositions.",
    example: "Le livre dont je parle est intéressant.",
    exercise: "Complète : L’entreprise ___ je travaille recrute.",
    answer: "où"
  }
];

function getTodayGrammar() {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return GRAMMAR_PROGRAM[dayIndex % GRAMMAR_PROGRAM.length];
}

// ✅ NEW: display grammar lesson inside Coach page
function renderGrammarCoach() {
  const box = document.getElementById("grammar-coach");
  if (!box) return;

  const g = getTodayGrammar();

  box.innerHTML = `
    <h3>📘 Leçon grammaire du jour : ${escapeHtml(g.title)}</h3>
    <p><strong>Règle :</strong> ${escapeHtml(g.rule)}</p>
    <p><strong>Exemple :</strong> ${escapeHtml(g.example)}</p>

    <div class="exercise">
      <p><strong>Exercice :</strong> ${escapeHtml(g.exercise)}</p>
      <button id="btn-show-answer" class="btn secondary">Voir la réponse</button>
      <p id="grammar-answer" style="display:none; margin-top:10px;">
        ✅ <strong>Réponse :</strong> ${escapeHtml(g.answer)}
      </p>
    </div>
  `;

  const btn = document.getElementById("btn-show-answer");
  const ans = document.getElementById("grammar-answer");
  if (btn && ans) {
    btn.addEventListener("click", () => {
      ans.style.display = ans.style.display === "none" ? "block" : "none";
    });
  }
}

// -----------------------
// Init bindings
// -----------------------
function init() {
  bindTabs();

  $("#go-diagnostic").addEventListener("click", () => setRoute("diagnostic"));
  $("#go-coach").addEventListener("click", () => setRoute("coach"));

  const wr = $("#self-writing");
  const sp = $("#self-speaking");
  const wrVal = $("#self-writing-val");
  const spVal = $("#self-speaking-val");

  function syncRanges() {
    wrVal.textContent = wr.value;
    spVal.textContent = sp.value;
  }
  wr.addEventListener("input", syncRanges);
  sp.addEventListener("input", syncRanges);
  syncRanges();

  $("#btn-score").addEventListener("click", () => {
    const r = computeDiagnostic();
    $("#diag-note").textContent = `OK ✅ Score global: ${r.points}/${r.total} (${r.pct}%) → niveau estimé ${r.level}.`;
    setRoute("results");
  });

  $("#btn-generate-plan").addEventListener("click", () => {
    generatePlan30Days();
    setRoute("plan");
  });

  $("#btn-go-coach").addEventListener("click", () => setRoute("coach"));
  $("#btn-rebuild").addEventListener("click", () => {
    generatePlan30Days();
    renderPlan();
    alert("Plan mis à jour ✅");
  });

  $("#btn-done").addEventListener("click", () => {
    markDoneToday();
    renderCoach();
    renderHome();
  });

  $("#btn-save").addEventListener("click", () => {
    state.settings.targetDate = $("#set-target").value;
    state.settings.dailyTime = Number($("#set-daily").value);
    state.settings.weekendTime = Number($("#set-weekend").value);

    state.settings.links.link1 = $("#link1").value.trim();
    state.settings.links.link2 = $("#link2").value.trim();
    state.settings.links.link3 = $("#link3").value.trim();

    saveState();
    renderHome();
    alert("Réglages enregistrés ✅");
  });

  $("#btn-export").addEventListener("click", exportData);
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });

  renderHome();
  renderResults();
  renderPlan();
  renderSettings();
  renderCoach();

  setRoute("home");
}

init();

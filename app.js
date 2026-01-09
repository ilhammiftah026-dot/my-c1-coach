// ===============================
// My C1 Coach - app.js (FULL)
// Offline-friendly (LocalStorage)
// ===============================

const STORAGE_KEY = "my_c1_coach_v1";

const DEFAULT_STATE = {
  settings: {
    targetDate: "",
    dailyTime: 30,
    links: {
      link1: "https://apprendre.tv5monde.com/fr",
      link2: "https://francaisfacile.rfi.fr/fr/",
      link3: "https://www.institutfrancais.com/fr"
    }
  },
  diagnostic: {
    read: null,
    gram: null,
    write: null,
    listen: null,
    level: null,
    details: null,
    strengths: [],
    priorities: []
  },
  plan: {
    generatedAt: null,
    weeks: []
  },
  daily: {
    dateKey: null,
    focus: null,
    duration: null,
    tasks: [],
    done: false
  },
  streak: {
    lastDoneDateKey: null,
    count: 0
  }
};

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const st = JSON.parse(raw);
    // merge shallow defaults
    return {
      ...structuredClone(DEFAULT_STATE),
      ...st,
      settings: { ...structuredClone(DEFAULT_STATE.settings), ...(st.settings||{}),
        links: { ...structuredClone(DEFAULT_STATE.settings.links), ...((st.settings||{}).links||{}) }
      }
    };
  }catch(e){
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dateKeyToday(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function isWeekend(){
  const n = new Date().getDay(); // 0 Sun, 6 Sat
  return (n === 0 || n === 6);
}

function clampNum(v, min, max, fallback){
  const n = Number(v);
  if(Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ---------------- UI Helpers ----------------
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function showScreen(name){
  qsa(".screen").forEach(s => s.classList.remove("show"));
  qsa(".tab").forEach(t => t.classList.remove("active"));

  qs(`#screen-${name}`)?.classList.add("show");
  qs(`.tab[data-screen="${name}"]`)?.classList.add("active");
}

function renderHome(state){
  qs("#homeLevel").textContent = state.diagnostic.level || "—";
  qs("#homeStreak").textContent = String(state.streak.count || 0);
  qs("#homeTime").textContent = `${state.settings.dailyTime || 30} min`;
}

function renderLinks(state){
  const box = qs("#linksBox");
  if(!box) return;
  box.innerHTML = "";

  const links = state.settings.links || {};
  const items = [
    ["TV5Monde", links.link1],
    ["RFI", links.link2],
    ["Institut Français", links.link3]
  ];

  items.forEach(([label,url], idx)=>{
    if(!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label;
    box.appendChild(a);
  });
}

function renderResults(state){
  const d = state.diagnostic;

  qs("#levelEstimated").textContent = d.level || "—";
  qs("#scoreDetails").textContent = d.details || "—";

  const sBox = qs("#strengths");
  const pBox = qs("#priorities");
  sBox.innerHTML = "";
  pBox.innerHTML = "";

  (d.strengths || []).forEach(x=>{
    const li = document.createElement("li");
    li.textContent = x;
    sBox.appendChild(li);
  });

  (d.priorities || []).forEach(x=>{
    const li = document.createElement("li");
    li.textContent = x;
    pBox.appendChild(li);
  });
}

function renderPlan(state){
  const box = qs("#planBox");
  if(!box) return;

  if(!state.plan.weeks || state.plan.weeks.length === 0){
    box.innerHTML = `<p class="muted">Aucun plan généré pour l’instant. Va dans Résultats → “Générer mon plan 6 mois”.</p>`;
    return;
  }

  box.innerHTML = state.plan.weeks.map(w=>`
    <div class="week">
      <div class="row" style="justify-content:space-between; align-items:center">
        <h4>Semaine ${w.week} — ${w.title}</h4>
        <span class="tag">${w.tag}</span>
      </div>
      <ul>${w.tasks.map(t=>`<li>${t}</li>`).join("")}</ul>
    </div>
  `).join("");
}

function renderDaily(state){
  const d = state.daily;
  qs("#dailyBadge").textContent = d.dateKey ? `📅 ${d.dateKey}` : "—";
  qs("#dailyDuration").textContent = d.duration ? `${d.duration} min` : "—";
  qs("#dailyHint").textContent = isWeekend()
    ? "Week-end : séance longue (≈ 2h)"
    : "Semaine : séance courte (30–45 min)";

  qs("#dailyFocus").textContent = d.focus || "—";

  const list = qs("#dailyTasks");
  list.innerHTML = "";
  (d.tasks || []).forEach(t=>{
    const li = document.createElement("li");
    li.textContent = t;
    list.appendChild(li);
  });

  qs("#doneMsg").textContent = d.done ? "✅ Séance déjà validée aujourd’hui. Bravo !" : "";
}

// ---------------- Diagnostic Logic ----------------
function estimateLevel(read, gram, write, listen){
  // total / 28
  const total = read + gram + write + listen;
  const pct = total / 28;

  if(pct < 0.35) return "A2";
  if(pct < 0.52) return "B1";
  if(pct < 0.68) return "B1/B1+";
  if(pct < 0.80) return "B2";
  if(pct < 0.90) return "B2+";
  return "C1 (début)";
}

function computeStrengthsPriorities(read, gram, write, listen){
  const strengths = [];
  const priorities = [];

  // strengths
  if(read >= 7) strengths.push("Compréhension écrite : base solide.");
  if(gram >= 7) strengths.push("Grammaire : bon socle.");
  if(write >= 3) strengths.push("Production écrite : bonne capacité.");
  if(listen >= 3) strengths.push("Oral : compréhension/réponse déjà bien.");

  if(strengths.length === 0) strengths.push("Base présente : on va structurer la progression vers B2+/C1.");

  // priorities for C1 (based on your described issues)
  priorities.push("Compréhension orale : vocabulaire difficile + reformulation.");
  priorities.push("Compréhension écrite : connecteurs, implicite, inférences.");
  priorities.push("Grammaire/lexique : subjonctif, accords, pronoms, registre soutenu.");
  priorities.push("Production écrite : structure + connecteurs + précision lexicale (180–220 mots).");
  priorities.push("Production orale : plan, transitions, exemples, reformulation.");

  // adjust focus if some score very low
  if(listen <= 1) priorities.unshift("Oral prioritaire : écoute quotidienne + shadowing.");
  if(write <= 1) priorities.unshift("Écrit prioritaire : 10 minutes/jour de rédaction + correction.");

  return { strengths, priorities };
}

// ---------------- Plan 6 months ----------------
function buildPlan(state){
  const lvl = state.diagnostic.level || "B1";
  const dailyTime = Number(state.settings.dailyTime || 30);

  // Define intensity
  const intensity = dailyTime >= 60 ? "Intensif" : (dailyTime >= 45 ? "Soutenu" : "Standard");

  // 24 weeks (6 months)
  const weeks = [];
  for(let i=1;i<=24;i++){
    let tag = "B1 → B2";
    if(lvl.includes("B2") || lvl.includes("C1")) tag = "B2 → C1";
    if(i >= 13) tag = "Objectif C1";

    const title = (i<=4) ? "Fondations (lexique + grammaire utile)"
      : (i<=12) ? "Consolidation B2 (compréhension + production)"
      : (i<=20) ? "Montée C1 (reformulation + nuance + registre)"
      : "Simulation examens (C1)";

    const tasks = [
      `📖 Lecture (TV5/RFI) + surligner connecteurs (15–20 min)`,
      `🧠 Grammaire ciblée (subjonctif / pronoms / accords) (10–15 min)`,
      `🎧 Écoute + reformulation (5–15 min)`,
      `✍️ Mini écrit (80–220 mots selon semaine)`,
      `🗣 Oral : 2 minutes → 5 minutes (progressif)`
    ];

    // tweak by phase
    if(i>=13) tasks[3] = "✍️ Écrit : 180–220 mots + plan + connecteurs + conclusion";
    if(i>=21) tasks.splice(0,0,"📝 1 sujet type C1 (production écrite) + auto-correction");

    weeks.push({ week:i, title, tag: `${tag} • ${intensity}`, tasks });
  }

  state.plan.generatedAt = new Date().toISOString();
  state.plan.weeks = weeks;
  saveState(state);
}

// ---------------- Daily Coach ----------------
function dailyFocusFromState(state){
  // Use priorities + known difficulty (oral + grammar + vocab)
  const p = state.diagnostic.priorities || [];
  if(p.length) return p[0].replace("prioritaire : ","");
  // fallback
  return "Lexique + reformulation + connecteurs";
}

function buildDailyTasks(state){
  const minutesWeek = Number(state.settings.dailyTime || 30);
  const minutes = isWeekend() ? 120 : minutesWeek;

  const lvl = state.diagnostic.level || "B1";
  const focus = dailyFocusFromState(state);

  const tasks = [];

  if(minutes <= 30){
    tasks.push("🎧 7 min écoute (RFI/TV5) + noter 6 mots");
    tasks.push("🗣 5 min shadowing (répéter à voix haute)");
    tasks.push("📖 1 petit article + 5 connecteurs à repérer");
    tasks.push("✍️ 5 phrases (avec 2 connecteurs) sur ton sujet d’études");
  } else if(minutes <= 45){
    tasks.push("🎧 10 min écoute + reformuler 5 phrases");
    tasks.push("📖 1 article (TV5/RFI) + résumer en 8 phrases");
    tasks.push("🧠 1 règle (subjonctif/accords/pronoms) + 6 exemples");
    tasks.push("🗣 5 min : expliquer un sujet d’économie avec plan (intro→2 idées→conclusion)");
  } else if(minutes <= 60){
    tasks.push("🎧 12 min écoute + reformulation (10 phrases)");
    tasks.push("📖 1 article long + 10 connecteurs + vocabulaire");
    tasks.push("🧠 Grammaire : 2 micro-leçons + exercices");
    tasks.push("✍️ 120–160 mots : opinion nuancée + connecteurs");
    tasks.push("🗣 6–8 min : parler + transitions + exemple");
  } else {
    tasks.push("🎧 20 min écoute (2 sources) + résumé oral 2 min");
    tasks.push("📖 2 articles + tableau vocabulaire (20 mots)");
    tasks.push("🧠 Grammaire C1 : subjonctif + pronoms + accords complexes");
    tasks.push("✍️ 180–220 mots : plan + connecteurs + registre soutenu");
    tasks.push("🗣 10 min : exposé (intro→2 arguments→contre-argument→conclusion)");
  }

  // small personalization message
  tasks.unshift(`🎯 Focus du jour : ${focus}`);
  tasks.unshift(`📌 Niveau actuel : ${lvl}`);

  state.daily = {
    dateKey: dateKeyToday(),
    focus,
    duration: minutes,
    tasks,
    done: false
  };
  saveState(state);
}

function ensureDaily(state){
  const today = dateKeyToday();
  if(!state.daily.dateKey || state.daily.dateKey !== today){
    buildDailyTasks(state);
  }
}

// ---------------- Streak ----------------
function markDoneToday(state){
  const today = dateKeyToday();
  if(state.daily.dateKey !== today) ensureDaily(state);

  if(!state.daily.done){
    state.daily.done = true;

    // streak logic
    if(state.streak.lastDoneDateKey !== today){
      // if yesterday done -> increment, else reset to 1
      const last = state.streak.lastDoneDateKey;
      const y = new Date();
      y.setDate(y.getDate()-1);
      const yKey = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`;

      if(last === yKey){
        state.streak.count = (state.streak.count || 0) + 1;
      } else {
        state.streak.count = 1;
      }
      state.streak.lastDoneDateKey = today;
    }

    saveState(state);
  }
}

// ---------------- Export/Import ----------------
function exportData(){
  const state = loadState();
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-c1-coach-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const st = JSON.parse(reader.result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
      init();
      alert("✅ Import réussi !");
    }catch(e){
      alert("❌ Fichier invalide.");
    }
  };
  reader.readAsText(file);
}

// ---------------- Init & Events ----------------
function init(){
  const state = loadState();

  // fill settings inputs
  qs("#targetDate").value = state.settings.targetDate || "";
  qs("#dailyTime").value = String(state.settings.dailyTime || 30);
  qs("#link1").value = state.settings.links.link1 || "";
  qs("#link2").value = state.settings.links.link2 || "";
  qs("#link3").value = state.settings.links.link3 || "";

  ensureDaily(state);

  renderHome(state);
  renderResults(state);
  renderPlan(state);
  renderDaily(state);
  renderLinks(state);
}

function wire(){
  // Tabs
  qs("#tabs").addEventListener("click", (e)=>{
    const btn = e.target.closest(".tab");
    if(!btn) return;
    showScreen(btn.dataset.screen);
    // rerender in case
    const st = loadState();
    ensureDaily(st);
    renderHome(st);
    renderResults(st);
    renderPlan(st);
    renderDaily(st);
    renderLinks(st);
  });

  // Home buttons
  qs("#goDiag").addEventListener("click", ()=>showScreen("diag"));
  qs("#goDaily").addEventListener("click", ()=>showScreen("daily"));

  // Diagnostic actions
  qs("#runDiag").addEventListener("click", ()=>{
    const state = loadState();
    const read = clampNum(qs("#scoreRead").value, 0, 10, 5);
    const gram = clampNum(qs("#scoreGram").value, 0, 10, 4);
    const write = clampNum(qs("#scoreWrite").value, 0, 4, 1);
    const listen = clampNum(qs("#scoreListen").value, 0, 4, 0);

    const lvl = estimateLevel(read, gram, write, listen);
    const total = read + gram + write + listen;

    const { strengths, priorities } = computeStrengthsPriorities(read, gram, write, listen);

    state.diagnostic = {
      read, gram, write, listen,
      level: lvl,
      details: `Lecture ${read}/10 • Grammaire ${gram}/10 • Écrit ${write}/4 • Oral ${listen}/4 • Total ${total}/28`,
      strengths,
      priorities
    };

    saveState(state);
    ensureDaily(state);
    renderResults(state);
    renderHome(state);
    renderDaily(state);

    showScreen("results");
  });

  qs("#resetDiag").addEventListener("click", ()=>{
    qs("#scoreRead").value = 5;
    qs("#scoreGram").value = 4;
    qs("#scoreWrite").value = 1;
    qs("#scoreListen").value = 0;
  });

  // Results -> Plan
  qs("#genPlanBtn").addEventListener("click", ()=>{
    const state = loadState();
    buildPlan(state);
    renderPlan(state);
    showScreen("plan");
  });

  qs("#goDailyFromRes").addEventListener("click", ()=>{
    showScreen("daily");
    const st = loadState();
    ensureDaily(st);
    renderDaily(st);
    renderLinks(st);
  });

  // Plan buttons
  qs("#regenPlan").addEventListener("click", ()=>{
    const state = loadState();
    buildPlan(state);
    renderPlan(state);
    alert("✅ Plan regénéré !");
  });

  qs("#exportBtn").addEventListener("click", exportData);
  qs("#importFile").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importData(f);
    e.target.value = "";
  });

  // Daily actions
  qs("#markDone").addEventListener("click", ()=>{
    const state = loadState();
    markDoneToday(state);
    renderDaily(state);
    renderHome(state);
  });

  qs("#newDaily").addEventListener("click", ()=>{
    const state = loadState();
    buildDailyTasks(state);
    renderDaily(state);
    renderLinks(state);
    alert("✅ Coach du jour regénéré !");
  });

  // Settings
  qs("#saveSettings").addEventListener("click", ()=>{
    const state = loadState();
    state.settings.targetDate = qs("#targetDate").value || "";
    state.settings.dailyTime = clampNum(qs("#dailyTime").value, 10, 240, 30);
    state.settings.links.link1 = qs("#link1").value.trim();
    state.settings.links.link2 = qs("#link2").value.trim();
    state.settings.links.link3 = qs("#link3").value.trim();

    saveState(state);
    ensureDaily(state);
    renderHome(state);
    renderDaily(state);
    renderLinks(state);

    alert("✅ Réglages enregistrés !");
  });

  qs("#hardReset").addEventListener("click", ()=>{
    localStorage.removeItem(STORAGE_KEY);
    init();
    alert("✅ Tout est réinitialisé.");
    showScreen("home");
  });
}

// boot
wire();
init();
showScreen("home");


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== ΡΥΘΜΙΣΕΙΣ: βάλε εδώ το firebaseConfig σου (Βήμα Β στις οδηγίες) =====
const firebaseConfig = {
  apiKey: "AIzaSyAch8LqPh78C4o7Edh8vuyHqfy4CdyibXE",
  authDomain: "gramm-1fb0a.firebaseapp.com",
  projectId: "gramm-1fb0a",
  storageBucket: "gramm-1fb0a.firebasestorage.app",
  messagingSenderId: "164591062110",
  appId: "1:164591062110:web:0ac91ae41d21b8e7d0b8cf"
};
const WORKER_URL = "https://gramm.stelios-andritsakis.workers.dev";

const $ = id => document.getElementById(id), qa = s => document.querySelectorAll(s);
const ic = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const tfetch = (u, o, ms = 25000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(t)); };
const cloudOn = !!firebaseConfig.apiKey;
const today = () => new Date().toISOString().slice(0, 10);
const LS = (k, v) => v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v));

let app, auth, db, user = null;
if (cloudOn) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }

let cfg = Object.assign({ kcal: 2000, protein: 170, water: 2.5, gemini: '', unsplash: '', name: '' }, LS('fuel_cfg'));
let days = LS('fuel_days') || {};
const blank = () => ({ meals: [], water: 0, workout: false, lock: 600 });
const day = () => days[today()] || (days[today()] = blank());
const sum = k => day().meals.reduce((a, m) => a + (m[k] || 0), 0);
const fmt = n => Math.round(n).toLocaleString('el-GR');

// ===== ΑΠΟΘΗΚΕΥΣΗ (Firestore αν είσαι συνδεδεμένος, αλλιώς τοπικά) =====
async function save() {
  LS('fuel_days', days);
  if (!user) return;
  const pct = Math.min(sum('protein') / cfg.protein, 1) * 100;
  await setDoc(doc(db, 'users', user.uid, 'days', today()), day());
  await setDoc(doc(db, 'users', user.uid), { name: user.displayName || 'Χρήστης', score: Math.round(pct), date: today(), goals: { kcal: cfg.kcal, protein: cfg.protein, water: cfg.water } }, { merge: true });
}
async function loadCloud() {
  const s = await getDocs(collection(db, 'users', user.uid, 'days'));
  s.forEach(d => days[d.id] = Object.assign(blank(), d.data()));
  LS('fuel_days', days);
}

// ===== RENDER =====
function renderGauge() {
  const N = 16, pct = Math.min(sum('kcal') / cfg.kcal, 1), svg = $('arc');
  let h = '';
  for (let i = 0; i < N; i++) {
    const a = -120 + (i / (N - 1)) * 240;
    h += `<rect class="seg ${i < pct * N ? 'f' : ''}" x="136" y="14" width="28" height="42" rx="11" transform="rotate(${a} 150 130)" style="animation-delay:${i * .12}s"/>`;
  }
  svg.innerHTML = h;
  $('kcalEaten').textContent = fmt(sum('kcal')); $('kcalGoal').textContent = fmt(cfg.kcal);
}
function renderProtein() {
  const p = sum('protein'), pct = Math.min(p / cfg.protein, 1), bar = $('pBar');
  const col = pct >= 1 ? '#34c58a' : pct >= .75 ? '#7ac943' : pct >= .4 ? '#ff8a4c' : '#ef5b5b';
  bar.style.setProperty('--pc', col); bar.classList.toggle('done', pct >= 1);
  bar.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(pct * 10) ? 'f' : ''}"></i>`).join('');
  $('pVal').textContent = fmt(p); $('pGoal').textContent = cfg.protein;
}
function weekKeys() {
  const d = new Date(), wd = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - wd + i); return x.toISOString().slice(0, 10); });
}
function renderBank() {
  const keys = weekKeys(), t = today(); let bank = 0, max = 1;
  const vals = keys.map(k => { const d = days[k]; if (!d || !d.meals.length) return null; const v = cfg.kcal - d.meals.reduce((a, m) => a + m.kcal, 0); if (k < t) bank += v; max = Math.max(max, Math.abs(v)); return v; });
  $('bankTotal').textContent = fmt(Math.max(bank, 0));
  $('bankDays').innerHTML = vals.map((v, i) => `<i class="${v < 0 ? 'n' : ''} ${keys[i] === t ? 't' : ''}" style="height:${v === null ? 3 : Math.max(Math.abs(v) / max * 100, 8)}%"></i>`).join('');
  const left = cfg.kcal - sum('kcal') - day().lock;
  $('lockRange').value = day().lock; $('lockVal').textContent = day().lock;
  $('lockMsg').textContent = left >= 0 ? `Μένουν ${fmt(left)} kcal για πριν το βράδυ` : `Ξεπερνάς κατά ${fmt(-left)} kcal`;
}
function waterGoal() { return cfg.water + (day().workout ? .5 : 0) + (day().meals.some(m => m.salty) ? .3 : 0); }
function renderWater() {
  const g = waterGoal(), d = day(), why = [];
  if (d.meals.some(m => m.salty)) why.push('+0.3L αλμυρό γεύμα'); if (d.workout) why.push('+0.5L προπόνηση');
  $('waterVal').textContent = d.water.toFixed(2).replace(/0$/, ''); $('waterGoal').textContent = g.toFixed(1);
  $('waterFill').style.width = Math.min(d.water / g * 100, 100) + '%';
  $('waterNote').textContent = why.join(' • ') || 'Βασικός στόχος';
  $('workoutBtn').classList.toggle('on', d.workout);
}
function renderMeals(fresh) {
  const ms = day().meals;
  $('meals').innerHTML = ms.length ? ms.map((m, i) => `
  <article class="meal ${fresh && i === 0 ? 'new' : ''}">
    <div class="thumb" style="${m.img ? `background-image:url('${m.img}')` : ''}">${m.img ? '' : ic('fork')}</div>
    <div><b class="n">${m.name}</b><div class="macros">${m.time} • Π ${m.protein}g • Υ ${m.carbs}g • Λ ${m.fat}g</div></div>
    <div class="k">${fmt(m.kcal)}<div class="macros">kcal</div></div>
    <div class="dig">Χώνεψη <span>${[1, 2, 3, 4, 5].map(n => `<button data-i="${i}" data-n="${n}" class="${m.dig === n ? 'on' : ''}">${n}</button>`).join('')}</span></div>
    ${m.warning ? `<div class="warn">${ic('alert')}${m.warning}</div>` : ''}
  </article>`).join('') : '<p class="empty">Δεν υπάρχει καταχώρηση ακόμα. Πάτα το κεντρικό κουμπί.</p>';
  qa('.dig button').forEach(b => b.onclick = () => { day().meals[b.dataset.i].dig = +b.dataset.n; save(); renderMeals(); });
}
async function renderBoard() {
  const me = user ? user.uid : null; let rows = [];
  if (user) { const s = await getDocs(collection(db, 'users')); s.forEach(d => { const v = d.data(); if (v.date === today()) rows.push({ id: d.id, ...v }); }); }
  else rows = [{ id: 'x', name: cfg.name || 'Εσύ', score: Math.round(Math.min(sum('protein') / cfg.protein, 1) * 100) }];
  rows.sort((a, b) => b.score - a.score);
  $('board').innerHTML = rows.map((r, i) => `<div class="fr ${r.id === me || !user ? 'me' : ''}"><span class="rk">${i + 1}</span><div class="av">${(r.name || '?')[0]}</div><div style="flex:1"><b>${r.name}</b><div class="tr"><i style="width:${r.score}%"></i></div></div><b>${r.score}%</b></div>`).join('') + (user ? '' : '<p class="sub tiny">Συνδέσου για να δεις φίλους.</p>');
}
function renderAll() {
  renderGauge(); renderProtein(); renderBank(); renderWater(); renderMeals();
  $('hello').textContent = 'Γεια σου' + (cfg.name ? ', ' + cfg.name : '');
  $('date').textContent = new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
  let s = 0; for (const k of Object.keys(days).sort().reverse()) { if (days[k].meals.length) s++; else if (k !== today()) break; } $('streak').textContent = s;
}

// ===== GEMINI =====
async function analyze(text) {
  if (!WORKER_URL) throw new Error('Λείπει το WORKER_URL στο app.js.');
  if (!user) throw new Error('Συνδέσου με Google από τις Ρυθμίσεις για να δουλέψει το AI.');
  const token = await user.getIdToken();
  const heavy = Object.values(days).flatMap(d => d.meals).filter(m => m.dig >= 4).map(m => m.name);
  const prompt = `Είσαι διατροφολόγος. Ανάλυσε το γεύμα: "${text}". Επίστρεψε ΜΟΝΟ JSON με πεδία: name (σύντομος ελληνικός τίτλος), kcal, protein, carbs, fat (αριθμοί, συνολικά για όλη την ποσότητα), salty (boolean: πολύ αλάτι), imageQuery (2-3 αγγλικές λέξεις για αναζήτηση φωτογραφίας), warning (string στα ελληνικά ή null). Για το warning: αν το γεύμα μοιάζει με κάποιο από αυτά που ο χρήστης βρήκε βαρύ [${heavy.join('; ')}], γράψε σύντομη προειδοποίηση, αλλιώς null.`;
  const r = await tfetch(WORKER_URL + '/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }) });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Σφάλμα AI (' + r.status + '): ' + t.slice(0, 180)); }
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));
}
async function fetchImage(q) {
  if (!q || !user) return '';
  try { const r = await fetch(`${WORKER_URL}/unsplash?query=${encodeURIComponent(q)}`, { headers: { Authorization: 'Bearer ' + await user.getIdToken() } }); return (await r.json()).results[0].urls.small; } catch { return ''; }
}
async function logMeal() {
  const text = $('logInput').value.trim(); if (!text) return;
  $('logBtn').classList.add('busy'); $('logStatus').textContent = 'Το AI αναλύει το γεύμα...';
  try {
    const a = await analyze(text), img = await fetchImage(a.imageQuery);
    day().meals.unshift({ name: a.name, kcal: +a.kcal || 0, protein: +a.protein || 0, carbs: +a.carbs || 0, fat: +a.fat || 0, salty: !!a.salty, warning: a.warning || null, img, dig: 0,
      time: new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) });
    await save(); $('logInput').value = ''; $('sheet').classList.remove('on'); renderAll(); renderMeals(true); show('meals');
  } catch (e) { $('logStatus').textContent = e.name === 'AbortError' ? 'Το Worker δεν απάντησε σε 25 δευτερόλεπτα (κολλάει στο Gemini ή στο Firebase).' : e instanceof TypeError ? 'Δεν έφτασε το αίτημα στο Worker (ALLOWED ή Deploy).' : e.message; }
  $('logBtn').classList.remove('busy');
}

// ===== ΠΛΟΗΓΗΣΗ & EVENTS =====
function show(v) {
  qa('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  qa('nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'friends') renderBoard();
}
qa('nav [data-v]').forEach(b => b.onclick = () => show(b.dataset.v));
$('aiBtn').onclick = () => { $('sheet').classList.add('on'); setTimeout(() => $('logInput').focus(), 200); };
$('sheet').onclick = e => { if (e.target === $('sheet')) $('sheet').classList.remove('on'); };
$('closeSheet').onclick = () => $('sheet').classList.remove('on');
$('logBtn').onclick = logMeal; $('logInput').onkeydown = e => { if (e.key === 'Enter') logMeal(); };
$('addWater').onclick = () => { day().water += .25; save(); renderWater(); };
$('workoutBtn').onclick = () => { day().workout = !day().workout; save(); renderWater(); };
$('lockRange').oninput = e => { day().lock = +e.target.value; renderBank(); }; $('lockRange').onchange = save;

function fillSettings() { $('sKcal').value = cfg.kcal; $('sPro').value = cfg.protein; $('sWater').value = cfg.water; }
$('saveSettings').onclick = () => {
  Object.assign(cfg, { kcal: +$('sKcal').value, protein: +$('sPro').value, water: +$('sWater').value });
  LS('fuel_cfg', cfg); save(); renderAll(); $('setMsg').textContent = 'Αποθηκεύτηκε.';
};
$('authBtn').onclick = async () => {
  if (!cloudOn) { $('setMsg').textContent = 'Δεν έχεις βάλει ακόμα firebaseConfig στο app.js.'; return; }
  user ? await signOut(auth) : await signInWithPopup(auth, new GoogleAuthProvider());
};
if (cloudOn) onAuthStateChanged(auth, async u => {
  user = u; $('authBtn').textContent = u ? 'Αποσύνδεση (' + (u.displayName || '') + ')' : 'Σύνδεση με Google';
  if (u) { cfg.name = cfg.name || (u.displayName || '').split(' ')[0]; await loadCloud(); await save(); }
  renderAll();
});

fillSettings(); renderAll();

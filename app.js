import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const tfetch = (u, o, ms = 30000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(t)); };
const today = () => new Date().toLocaleDateString('sv-SE');
const LS = (k, v) => v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v));
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
let user = null;

let cfg = Object.assign({ name: '', sex: 'm', age: '', weight: '', height: '', act: 1.3, goal: 'lose', challenge: null }, LS('fuel_cfg'));
let days = LS('fuel_days') || {};
const blank = () => ({ meals: [], water: 0, workout: null, lock: 600 });
const day = () => days[today()] || (days[today()] = blank());
const sum = k => day().meals.reduce((a, m) => a + (m[k] || 0), 0);
const fmt = n => Math.round(n).toLocaleString('el-GR');
const MET = { 'Βάρη': 5, 'Τρέξιμο': 9.8, 'Περπάτημα': 3.5, 'Ποδήλατο': 7.5, 'HIIT': 8, 'Κολύμβηση': 7, 'Ποδόσφαιρο': 7, 'Άλλο': 5 };

// ===== ΥΠΟΛΟΓΙΣΜΟΣ ΣΤΟΧΩΝ (Mifflin-St Jeor) =====
function targets() {
  const w = +cfg.weight, h = +cfg.height, a = +cfg.age;
  if (!(w > 0 && h > 0 && a > 0)) return null;
  const bmr = 10 * w + 6.25 * h - 5 * a + (cfg.sex === 'm' ? 5 : -161), tdee = bmr * cfg.act;
  const wk = day().workout, burn = wk ? (MET[wk.type] || 5) * w * wk.min / 60 : 0;
  const adj = cfg.goal === 'lose' ? -.2 * tdee : cfg.goal === 'gain' ? .1 * tdee : 0;
  const base = Math.max(tdee + adj, cfg.sex === 'm' ? 1500 : 1200);
  const kcal = Math.round(base / 10) * 10 + Math.round(burn * .5 / 10) * 10;
  return { bmr, tdee, burn, kcal, protein: Math.round(w * (cfg.goal === 'maintain' ? 1.8 : 2) / 5) * 5,
    water: +(w * .035 + (wk ? wk.min / 60 * .7 : 0)).toFixed(1), deficit: Math.round(tdee + burn - kcal) };
}
const G = () => targets() || { kcal: 2000, protein: 150, water: 2.5 };

// ===== ΑΠΟΘΗΚΕΥΣΗ =====
async function save() {
  day().goal = G().kcal; LS('fuel_days', days); LS('fuel_cfg', cfg);
  if (!user) return;
  await setDoc(doc(db, 'users', user.uid, 'days', today()), day());
  await setDoc(doc(db, 'users', user.uid), { cfg }, { merge: true });
}
async function loadCloud() {
  const s = await getDocs(collection(db, 'users', user.uid, 'days'));
  s.forEach(d => days[d.id] = Object.assign(blank(), d.data()));
  const p = await getDoc(doc(db, 'users', user.uid));
  if (p.exists() && p.data().cfg) cfg = Object.assign(cfg, p.data().cfg);
  LS('fuel_days', days); LS('fuel_cfg', cfg);
}

// ===== RENDER =====
function renderGauge() {
  const N = 16, pct = Math.min(sum('kcal') / G().kcal, 1);
  $('arc').innerHTML = Array.from({ length: N }, (_, i) => `<rect class="seg ${i < pct * N ? 'f' : ''}" x="136" y="14" width="28" height="42" rx="11" transform="rotate(${-120 + i / (N - 1) * 240} 150 130)" style="animation-delay:${i * .12}s"/>`).join('');
  $('kcalEaten').textContent = fmt(sum('kcal')); $('kcalGoal').textContent = fmt(G().kcal);
}
function renderProtein() {
  const g = G().protein, p = sum('protein'), pct = Math.min(p / g, 1), bar = $('pBar');
  bar.style.setProperty('--pc', pct >= 1 ? '#34c58a' : pct >= .75 ? '#7ac943' : pct >= .4 ? '#ff8a4c' : '#ef5b5b');
  bar.classList.toggle('done', pct >= 1);
  bar.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(pct * 10) ? 'f' : ''}"></i>`).join('');
  $('pVal').textContent = fmt(p); $('pGoal').textContent = g;
}
function weekKeys() { const d = new Date(), wd = (d.getDay() + 6) % 7; return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - wd + i); return x.toLocaleDateString('sv-SE'); }); }
function renderBank() {
  const keys = weekKeys(), t = today(); let bank = 0, max = 1;
  const vals = keys.map(k => { const d = days[k]; if (!d || !d.meals.length) return null; const v = (d.goal || G().kcal) - d.meals.reduce((a, m) => a + m.kcal, 0); if (k < t) bank += v; max = Math.max(max, Math.abs(v)); return v; });
  $('bankTotal').textContent = fmt(Math.max(bank, 0));
  $('bankDays').innerHTML = vals.map((v, i) => `<i class="${v < 0 ? 'n' : ''} ${keys[i] === t ? 't' : ''}" style="height:${v === null ? 3 : Math.max(Math.abs(v) / max * 100, 8)}%"></i>`).join('');
  const left = G().kcal - sum('kcal') - day().lock;
  $('lockRange').value = day().lock; $('lockVal').textContent = day().lock;
  $('lockMsg').textContent = left >= 0 ? `Μένουν ${fmt(left)} kcal για πριν το βράδυ` : `Ξεπερνάς κατά ${fmt(-left)} kcal`;
}
function renderWater() {
  const d = day(), salty = d.meals.some(m => m.salty), g = G().water + (salty ? .3 : 0), why = [];
  if (salty) why.push('+0.3L αλμυρό γεύμα'); if (d.workout) why.push('προπόνηση');
  $('waterVal').textContent = d.water.toFixed(2).replace(/0$/, ''); $('waterGoal').textContent = g.toFixed(1);
  $('waterFill').style.width = Math.min(d.water / g * 100, 100) + '%';
  $('waterNote').textContent = why.length ? 'Ανέβηκε λόγω: ' + why.join(', ') : 'Στόχος βάσει βάρους';
  $('workoutBtn').classList.toggle('on', !!d.workout);
}
function renderMeals(fresh) {
  const ms = day().meals;
  $('meals').innerHTML = ms.length ? ms.map((m, i) => `
  <article class="meal ${fresh && i === 0 ? 'new' : ''}">
    <div class="thumb" style="${m.img ? `background-image:url('${m.img}')` : ''}">${m.img ? '' : ic('fork')}</div>
    <div><b class="n">${m.name}</b><div class="macros">${m.slot ? m.slot + ' • ' : ''}${m.time} • Π ${m.protein}g • Υ ${m.carbs}g • Λ ${m.fat}g</div></div>
    <div class="k">${fmt(m.kcal)}<div class="macros">kcal</div><button class="ib" data-e="${i}" aria-label="Διόρθωση">${ic('pencil')}</button></div>
    <div class="dig">Χώνεψη <span>${[1, 2, 3, 4, 5].map(n => `<button data-i="${i}" data-n="${n}" class="${m.dig === n ? 'on' : ''}">${n}</button>`).join('')}</span></div>
    ${m.warning ? `<div class="warn">${ic('alert')}${m.warning}</div>` : ''}
  </article>`).join('') : '<p class="empty">Δεν υπάρχει καταχώρηση ακόμα. Πάτα το κεντρικό κουμπί.</p>';
  qa('.dig button').forEach(b => b.onclick = () => { day().meals[b.dataset.i].dig = +b.dataset.n; save(); renderMeals(); });
  qa('.ib').forEach(b => b.onclick = () => openEdit(+b.dataset.e));
}
function renderStrip() {
  const s = $('strip'), c = cfg.challenge;
  if (!targets()) { s.innerHTML = '<b>Συμπλήρωσε βάρος, ύψος και ηλικία</b><div class="sub tiny">για να υπολογίσω τους στόχους σου</div>'; s.onclick = () => show('me'); return; }
  if (c) { const d = Math.min(Math.floor((new Date(today()) - new Date(c.start)) / 864e5) + 1, c.days); s.innerHTML = `<b>Challenge: ημέρα ${d} από ${c.days}</b><div class="tr"><i style="width:${d / c.days * 100}%"></i></div>`; s.onclick = () => show('plan'); }
  else { s.innerHTML = '<b>Βάλε ένα challenge</b><div class="sub tiny">π.χ. flat κοιλιά σε 60 μέρες, με πλάνο από το AI</div>'; s.onclick = () => show('plan'); }
}
function renderPlan() {
  const t = targets(), g = G(), w = day().workout;
  $('tK').textContent = fmt(g.kcal); $('tP').textContent = g.protein; $('tW').textContent = g.water;
  $('why').textContent = t ? `Ο οργανισμός σου καίει περίπου ${fmt(t.tdee)} kcal τη μέρα στην ηρεμία και την καθημερινότητα. ${cfg.goal === 'lose' ? `Στόχος σου είναι έλλειμμα περίπου ${fmt(t.deficit)} kcal, ασφαλές για σταδιακή απώλεια λίπους.` : cfg.goal === 'gain' ? 'Έχεις μικρό πλεόνασμα για μυϊκή ανάπτυξη.' : 'Τρως όσο καις.'}${w ? ` Η προπόνηση καίει ~${fmt(t.burn)} kcal και σου επιτρέπω να φας τις μισές πίσω.` : ''} Πρωτεΐνη: ${cfg.goal === 'maintain' ? '1.8' : '2'} g ανά κιλό, νερό: 35 ml ανά κιλό.` : 'Πήγαινε στην καρτέλα "Εγώ" και συμπλήρωσε τα στοιχεία σου.';
  if (w) { $('wType').value = w.type; $('wMin').value = w.min; }
  const c = cfg.challenge; $('chOut').innerHTML = c ? chHTML(c) : '';
  if (c) { $('chGoal').value = c.goal; $('chDays').value = c.days; }
}
const chHTML = c => `<p><span class="verdict ${c.plan.verdict === 'ρεαλιστικό' ? '' : c.plan.verdict === 'δύσκολο' ? 'hard' : 'no'}">${c.plan.verdict}</span> • στόχος ~${c.plan.kgLoss} kg σε ${c.days} μέρες</p><p>${c.plan.summary}</p><ul>${c.plan.tips.map(t => `<li>${t}</li>`).join('')}</ul>${c.plan.milestones.map(m => `<p class="sub tiny">Ημέρα ${m.day}: ${m.text}</p>`).join('')}`;
function renderAll() {
  renderGauge(); renderProtein(); renderBank(); renderWater(); renderMeals(); renderStrip(); renderPlan();
  $('hello').textContent = 'Γεια σου' + (cfg.name ? ', ' + cfg.name : '');
  $('date').textContent = new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
  let s = 0; for (let i = 0; i < 400; i++) { const x = new Date(); x.setDate(x.getDate() - i); const d = days[x.toLocaleDateString('sv-SE')]; if (d && d.meals.length) s++; else if (i > 0) break; } $('streak').textContent = s;
}

// ===== GEMINI (μέσω Worker) =====
async function gemini(parts) {
  if (!user) throw new Error('Συνδέσου με Google (καρτέλα "Εγώ") για να δουλέψει το AI.');
  const r = await tfetch(WORKER_URL + '/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json' } }) });
  if (!r.ok) throw new Error('Σφάλμα AI (' + r.status + '): ' + (await r.text().catch(() => '')).slice(0, 160));
  return JSON.parse((await r.json()).candidates[0].content.parts[0].text.replace(/```json|```/g, ''));
}
const netErr = e => e.name === 'AbortError' ? 'Το AI άργησε πολύ. Δοκίμασε ξανά.' : e instanceof TypeError ? 'Δεν έφτασε το αίτημα στο Worker.' : e.message;

async function prep(f) {
  const bm = await createImageBitmap(f), mk = max => { const s = Math.min(1, max / Math.max(bm.width, bm.height)), c = document.createElement('canvas'); c.width = bm.width * s; c.height = bm.height * s; c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .75); };
  return { b64: mk(900).split(',')[1], thumb: mk(96) };
}
async function fetchImage(q) {
  if (!q || !user) return '';
  try { const r = await fetch(`${WORKER_URL}/unsplash?query=${encodeURIComponent(q)}`, { headers: { Authorization: 'Bearer ' + await user.getIdToken() } }); return (await r.json()).results[0].urls.small; } catch { return ''; }
}
async function logMeal(photo) {
  const text = $('logInput').value.trim(); if (!text && !photo) return;
  $('logBtn').classList.add('busy'); $('logStatus').textContent = photo ? 'Το AI κοιτάζει τη φωτογραφία...' : 'Το AI αναλύει το γεύμα...';
  try {
    const heavy = Object.values(days).flatMap(d => d.meals).filter(m => m.dig >= 4).map(m => m.name);
    const prompt = `Είσαι διατροφολόγος. ${photo ? 'Ανάλυσε το φαγητό της φωτογραφίας και εκτίμησε ποσότητες.' : ''} ${text ? `Περιγραφή χρήστη: "${text}".` : ''} Επίστρεψε ΜΟΝΟ JSON με πεδία: name (σύντομος ελληνικός τίτλος), kcal, protein, carbs, fat (αριθμοί, συνολικά για όλη την ποσότητα), salty (boolean: πολύ αλάτι), imageQuery (2-3 αγγλικές λέξεις), warning (ελληνικά ή null). Για το warning: αν μοιάζει με κάτι που ο χρήστης βρήκε βαρύ [${heavy.join('; ')}] γράψε σύντομη προειδοποίηση, αλλιώς null.`;
    const a = await gemini([...(photo ? [{ inline_data: { mime_type: 'image/jpeg', data: photo.b64 } }] : []), { text: prompt }]);
    const img = photo ? photo.thumb : await fetchImage(a.imageQuery);
    day().meals.unshift({ name: a.name, kcal: +a.kcal || 0, protein: +a.protein || 0, carbs: +a.carbs || 0, fat: +a.fat || 0, salty: !!a.salty, warning: a.warning || null, img, dig: 0, slot: ($('logSlot')||{}).value||'', time: new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) });
    await save(); $('logInput').value = ''; $('sheet').classList.remove('on'); renderAll(); renderMeals(true); show('meals');
  } catch (e) { $('logStatus').textContent = netErr(e); }
  $('logBtn').classList.remove('busy');
}
async function makeChallenge() {
  const goal = $('chGoal').value.trim(), d = +$('chDays').value;
  if (!targets()) { $('chOut').innerHTML = '<p>Πρώτα συμπλήρωσε τα στοιχεία σου στην καρτέλα "Εγώ".</p>'; return; }
  if (!goal || !(d > 0)) { $('chOut').innerHTML = '<p>Γράψε στόχο και αριθμό ημερών.</p>'; return; }
  $('chBtn').classList.add('busy'); $('chOut').innerHTML = '<p>Το AI φτιάχνει το πλάνο...</p>';
  try {
    const prompt = `Είσαι προπονητής και διατροφολόγος. Χρήστης: ${cfg.sex === 'm' ? 'άνδρας' : 'γυναίκα'}, ${cfg.age} ετών, ${cfg.weight} kg, ${cfg.height} cm. Στόχος: "${goal}" σε ${d} ημέρες. Επίστρεψε ΜΟΝΟ JSON: verdict ("ρεαλιστικό" | "δύσκολο" | "μη ρεαλιστικό"), summary (2-3 ειλικρινείς προτάσεις στα ελληνικά, να αναφέρεις ότι το λίπος δεν χάνεται τοπικά από την κοιλιά αλλά από όλο το σώμα), kgLoss (αριθμός: ρεαλιστικά κιλά απώλειας με ασφαλή ρυθμό έως 1% του βάρους την εβδομάδα), tips (5 σύντομες πρακτικές συμβουλές στα ελληνικά), milestones (3 αντικείμενα {day, text} στα ελληνικά). Μην προτείνεις ακραίες δίαιτες.`;
    cfg.challenge = { goal, days: d, start: today(), plan: await gemini([{ text: prompt }]) };
    await save(); renderAll();
  } catch (e) { $('chOut').innerHTML = `<p>${netErr(e)}</p>`; }
  $('chBtn').classList.remove('busy');
}

// ===== ΔΙΟΡΘΩΣΗ ΓΕΥΜΑΤΟΣ =====
let editIdx = -1;
function openEdit(i) { const m = day().meals[i]; editIdx = i; $('eName').value = m.name; $('eK').value = m.kcal; $('eP').value = m.protein; $('eC').value = m.carbs; $('eF').value = m.fat; $('editSheet').classList.add('on'); }
$('eSave').onclick = () => { Object.assign(day().meals[editIdx], { name: $('eName').value, kcal: +$('eK').value || 0, protein: +$('eP').value || 0, carbs: +$('eC').value || 0, fat: +$('eF').value || 0 }); $('editSheet').classList.remove('on'); save(); renderAll(); };
$('eDel').onclick = () => { day().meals.splice(editIdx, 1); $('editSheet').classList.remove('on'); save(); renderAll(); };
$('closeEdit').onclick = () => $('editSheet').classList.remove('on');

// ===== ΠΛΟΗΓΗΣΗ & EVENTS =====
function show(v) { qa('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v)); qa('nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
qa('nav [data-v]').forEach(b => b.onclick = () => show(b.dataset.v));
$('aiBtn').onclick = () => { $('sheet').classList.add('on'); setTimeout(() => $('logInput').focus(), 200); };
$('closeSheet').onclick = () => $('sheet').classList.remove('on');
qa('.sheet').forEach(s => s.onclick = e => { if (e.target === s) s.classList.remove('on'); });
$('logBtn').onclick = () => logMeal(); $('logInput').onkeydown = e => { if (e.key === 'Enter') logMeal(); };
$('camBtn').onclick = () => $('camInput').click();
$('camInput').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { logMeal(await prep(f)); } catch { $('logStatus').textContent = 'Δεν μπόρεσα να διαβάσω τη φωτογραφία.'; } e.target.value = ''; };
$('addWater').onclick = () => { day().water += .25; save(); renderWater(); };
$('workoutBtn').onclick = () => { show('plan'); };
$('lockRange').oninput = e => { day().lock = +e.target.value; renderBank(); }; $('lockRange').onchange = save;
$('wType').innerHTML = Object.keys(MET).map(k => `<option>${k}</option>`).join('');
$('wSave').onclick = () => { const m = +$('wMin').value; if (m > 0) { day().workout = { type: $('wType').value, min: m }; save(); renderAll(); } };
$('wClear').onclick = () => { day().workout = null; $('wMin').value = ''; save(); renderAll(); };
$('chBtn').onclick = makeChallenge;

const F = { pName: 'name', pSex: 'sex', pAge: 'age', pW: 'weight', pH: 'height', pAct: 'act', pGoal: 'goal' };
Object.entries(F).forEach(([id, k]) => $(id).value = cfg[k]);
$('saveP').onclick = () => { Object.entries(F).forEach(([id, k]) => cfg[k] = k === 'act' ? +$(id).value : $(id).value.trim()); save(); renderAll(); $('setMsg').textContent = 'Αποθηκεύτηκε. Οι στόχοι σου υπολογίστηκαν στην καρτέλα Πλάνο.'; };
$('authBtn').onclick = async () => { user ? await signOut(auth) : await signInWithPopup(auth, new GoogleAuthProvider()); };
onAuthStateChanged(auth, async u => {
  user = u; $('authBtn').textContent = u ? 'Αποσύνδεση (' + (u.displayName || '') + ')' : 'Σύνδεση με Google';
  if (u) { await loadCloud(); cfg.name = cfg.name || (u.displayName || '').split(' ')[0]; Object.entries(F).forEach(([id, k]) => $(id).value = cfg[k]); await save(); }
  renderAll();
});
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
renderAll();
window.FU = { get cfg() { return cfg; }, get days() { return days; }, day, save, renderAll, gemini, G, sum, show, today };
import('./extras.js?v=2');

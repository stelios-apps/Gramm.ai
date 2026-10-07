// FuelUp extras v2
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const F = window.FU, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (d, k) => Math.round(d.meals.reduce((a, m) => a + (m[k] || 0), 0));

// ---- 1. Το κόμμα δουλεύει (82,4 -> 82.4) ----
['pW', 'bwIn', 'eP', 'eC', 'eF'].forEach(id => { const el = $(id); el.type = 'text'; el.setAttribute('inputmode', 'decimal'); el.addEventListener('input', () => { el.value = el.value.replace(',', '.'); }); });

// ---- 2. Τι δεν τρως ----
$('v-me').insertAdjacentHTML('beforeend', '<div class="card form"><b>Τι δεν τρως</b><label>Αλλεργίες, ό,τι αποφεύγεις ή δεν σου αρέσει<input id="avoidIn" placeholder="π.χ. θαλασσινά, μανιτάρια, γάλα"></label><button id="avoidSave" class="btn">Αποθήκευση</button></div>');
const loadAvoid = () => { $('avoidIn').value = F.cfg.avoid || ''; };
loadAvoid(); document.querySelector('nav [data-v="me"]').addEventListener('click', loadAvoid);
$('avoidSave').onclick = async () => { F.cfg.avoid = $('avoidIn').value.trim(); await F.save(); $('avoidSave').textContent = 'Αποθηκεύτηκε ✓'; setTimeout(() => $('avoidSave').textContent = 'Αποθήκευση', 1500); };

// ---- 3. Φαγητό έξω: στις προτάσεις ----
$('sugBtn').insertAdjacentHTML('beforebegin', '<label>Πού θα φας;<select id="sugPlace"><option value="home">Σπίτι (μαγειρεύω)</option><option value="out">Έξω, από μαγαζί</option><option value="delivery">Delivery</option></select></label><label id="sugKindL" style="display:none">Τι μαγαζί ή κουζίνα;<input id="sugKind" placeholder="π.χ. σουβλατζίδικο, ιταλικό, sushi"></label>');
$('sugPlace').onchange = () => { $('sugKindL').style.display = $('sugPlace').value === 'home' ? 'none' : 'flex'; };
let sugs = [];
async function addMeal(m, slot) {
  F.day().meals.unshift({ name: m.name, kcal: +m.kcal || 0, protein: +m.protein || 0, carbs: +m.carbs || 0, fat: +m.fat || 0, salty: false, warning: null, img: '', dig: 0, slot, time: new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) });
  await F.save(); F.renderAll(); F.show('meals');
}
$('sugBtn').onclick = async () => {
  const slot = $('sugSlot').value, place = $('sugPlace').value, kind = $('sugKind').value.trim(), g = F.G();
  const left = Math.max(g.kcal - F.sum('kcal'), 0), pl = Math.max(g.protein - F.sum('protein'), 0);
  const heavy = Object.values(F.days).flatMap(d => d.meals).filter(m => m.dig >= 4).map(m => m.name);
  const small = ['Σνακ', 'Δεκατιανό', 'Απογευματινό'].includes(slot);
  $('sugBtn').classList.add('busy'); $('sugOut').innerHTML = '<p class="sub tiny">Το AI σκέφτεται...</p>';
  try {
    const where = place === 'home' ? 'Θα μαγειρέψει ή θα φάει στο σπίτι, με απλά υλικά από ελληνικό σούπερ μάρκετ.' : `Θα φάει ${place === 'out' ? 'έξω σε μαγαζί' : 'από delivery'}${kind ? ' (' + kind + ')' : ''}. Πρότεινε υπαρκτά πιάτα που βρίσκονται συνήθως σε τέτοιο μαγαζί στην Ελλάδα, τις πιο έξυπνες επιλογές για τον στόχο του, και υπολόγισε μερίδες εστιατορίου με λάδι και σάλτσες.`;
    const prompt = `Είσαι διατροφολόγος στην Ελλάδα. Στόχος χρήστη: ${F.cfg.goal === 'lose' ? 'απώλεια λίπους' : F.cfg.goal === 'gain' ? 'μυϊκή ανάπτυξη' : 'διατήρηση'}. Σήμερα υπολείπονται ${left} kcal και ${pl} g πρωτεΐνης. Πρότεινε 3 διαφορετικές επιλογές για: ${slot}. ${small ? 'Κράτα τες μικρές (150-300 kcal).' : 'Κράτα τες ισορροπημένες και χορταστικές.'} ${where} ΑΠΑΓΟΡΕΥΕΤΑΙ να περιέχουν: [${F.cfg.avoid || 'τίποτα συγκεκριμένο'}]. Απόφυγε ό,τι μοιάζει με: [${heavy.join('; ')}]. Επίστρεψε ΜΟΝΟ JSON: {"options":[{"name":"σύντομος τίτλος","desc":"τι περιέχει και πόσο, 1 πρόταση","kcal":0,"protein":0,"carbs":0,"fat":0}]}`;
    const a = await F.gemini([{ text: prompt }]);
    sugs = a.options || a;
    if (!Array.isArray(sugs) || !sugs.length) throw new Error('Το AI δεν επέστρεψε προτάσεις. Δοκίμασε ξανά.');
    $('sugOut').innerHTML = sugs.map((s, i) => `<div class="sug"><b>${esc(s.name)}</b><p>${esc(s.desc)}</p><p class="sub tiny">${Math.round(s.kcal)} kcal • Π ${Math.round(s.protein)}g • Υ ${Math.round(s.carbs)}g • Λ ${Math.round(s.fat)}g</p><button class="btn" data-s2="${i}">Το έφαγα, πρόσθεσέ το</button></div>`).join('');
    document.querySelectorAll('[data-s2]').forEach(b => b.onclick = () => addMeal(sugs[+b.dataset.s2], slot));
  } catch (e) { $('sugOut').innerHTML = `<p class="sub tiny">${esc(e.message)}</p>`; }
  $('sugBtn').classList.remove('busy');
};

// ---- 4. Φαγητό έξω: στην καταγραφή ----
$('logSlot').insertAdjacentHTML('afterend', '<label class="sub tiny" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="logOut" style="flex:none;width:18px;height:18px;padding:0"> Από μαγαζί ή έξω (μεγαλύτερη μερίδα, λάδι, σάλτσες)</label>');
const tag = () => { const i = $('logInput'); if ($('logOut').checked && i.value.trim() && !i.value.includes('[έξω:')) i.value += ' [έξω: μερίδα εστιατορίου με λάδι και σάλτσες, υπολόγισε περισσότερες θερμίδες]'; };
document.addEventListener('click', e => { if (e.target.closest('#logBtn')) tag(); }, true);
$('logInput').addEventListener('keydown', e => { if (e.key === 'Enter') tag(); }, true);

// ---- 5. Δεδομένα: εξαγωγή και διαγραφή ----
$('v-me').insertAdjacentHTML('beforeend', '<div class="card form"><b>Τα δεδομένα μου</b><div class="grid2"><button id="exJ" class="btn dark">Εξαγωγή JSON</button><button id="exC" class="btn dark">Εξαγωγή CSV</button></div><button id="delAll" class="btn dark" style="background:#b13a3a">Διαγραφή όλων των δεδομένων</button></div>');
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
$('exJ').onclick = () => dl('fuelup.json', JSON.stringify({ cfg: F.cfg, days: F.days }, null, 1), 'application/json');
$('exC').onclick = () => {
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"', r = ['Ημερομηνία,Γεύμα,Ώρα,Όνομα,kcal,Πρωτεΐνη,Υδατάνθρακες,Λίπος,Χώνεψη'];
  Object.keys(F.days).sort().forEach(k => F.days[k].meals.forEach(m => r.push([k, q(m.slot), m.time, q(m.name), m.kcal, m.protein, m.carbs, m.fat, m.dig || ''].join(','))));
  dl('fuelup.csv', '\ufeff' + r.join('\n'), 'text/csv');
};
$('delAll').onclick = async () => {
  if (!confirm('Θα διαγραφούν ΟΛΑ τα δεδομένα σου, και στο cloud. Σίγουρα;')) return;
  try {
    const u = getAuth().currentUser;
    if (u) { const db = getFirestore(), s = await getDocs(collection(db, 'users', u.uid, 'days')); await Promise.all(s.docs.map(d => deleteDoc(d.ref))); await deleteDoc(doc(db, 'users', u.uid)); }
    localStorage.removeItem('fuel_days'); localStorage.removeItem('fuel_cfg'); location.reload();
  } catch (e) { alert('Σφάλμα: ' + e.message); }
};

// ---- 6. Εβδομαδιαία σύνοψη AI ----
$('v-plan').insertAdjacentHTML('beforeend', '<div class="card form"><b>Σύνοψη εβδομάδας</b><button id="wkBtn" class="btn">Ανάλυσε την εβδομάδα μου</button><div id="wkOut"></div></div>');
$('wkBtn').onclick = async () => {
  const rows = [];
  for (let i = 0; i < 7; i++) { const x = new Date(); x.setDate(x.getDate() - i); const k = x.toLocaleDateString('sv-SE'), d = F.days[k]; if (d && d.meals.length) rows.push({ date: k, goal: d.goal, kcal: sum(d, 'kcal'), protein: sum(d, 'protein'), water: d.water, workout: d.workout && d.workout.type, meals: d.meals.map(m => `${m.slot || ''} ${m.name} (χώνεψη ${m.dig || '-'})`) }); }
  if (rows.length < 2) { $('wkOut').innerHTML = '<p class="sub tiny">Χρειάζονται τουλάχιστον 2 μέρες με καταγραφές.</p>'; return; }
  $('wkBtn').classList.add('busy'); $('wkOut').innerHTML = '<p class="sub tiny">Το AI αναλύει...</p>';
  try {
    const a = await F.gemini([{ text: `Είσαι φιλικός διατροφολόγος. Στόχος χρήστη: ${F.cfg.goal}. Δεδομένα τελευταίων ημερών: ${JSON.stringify(rows)}. Ανάλυσε μοτίβα (θερμίδες vs στόχος, πρωτεΐνη, νερό, γεύματα που βάραιναν, ώρες). Επίστρεψε ΜΟΝΟ JSON στα ελληνικά: {"summary":"2-3 προτάσεις","wins":["2-3 θετικά"],"improve":["2-3 βελτιώσεις"],"tip":"μία πρακτική συμβουλή για την επόμενη εβδομάδα"}` }]);
    const li = x => (x || []).map(t => `<li>${esc(t)}</li>`).join('');
    $('wkOut').innerHTML = `<p>${esc(a.summary)}</p><b class="sub">Τα πήγες καλά</b><ul>${li(a.wins)}</ul><b class="sub">Για βελτίωση</b><ul>${li(a.improve)}</ul><p><b>Συμβουλή:</b> ${esc(a.tip)}</p>`;
  } catch (e) { $('wkOut').innerHTML = `<p class="sub tiny">${esc(e.message)}</p>`; }
  $('wkBtn').classList.remove('busy');
};

// FuelUp extras v1: είδος γεύματος, "Τι να φάω;", αγαπημένα, βάρος
const F = window.FU, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOTS = ['Πρωινό', 'Δεκατιανό', 'Μεσημεριανό', 'Απογευματινό', 'Βραδινό', 'Σνακ'];
const autoSlot = () => { const h = new Date().getHours(); return h < 10 ? 'Πρωινό' : h < 12 ? 'Δεκατιανό' : h < 16 ? 'Μεσημεριανό' : h < 19 ? 'Απογευματινό' : h < 23 ? 'Βραδινό' : 'Σνακ'; };
const opts = sel => SLOTS.map(s => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('');

document.head.insertAdjacentHTML('beforeend', '<style>.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{border:0;background:var(--sand);border-radius:99px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer;color:var(--ink)}.chip:active{transform:scale(.95)}.sug{background:var(--bg);border-radius:16px;padding:10px 12px;margin-top:8px}.sug p{margin:2px 0;font-size:13px}.sug .btn{padding:8px;margin-top:6px;width:100%;font-size:13px}</style>');

// ---------- Προσθήκη γεύματος χωρίς AI ----------
async function addMeal(m, slot) {
  F.day().meals.unshift({ name: m.name, kcal: +m.kcal || 0, protein: +m.protein || 0, carbs: +m.carbs || 0, fat: +m.fat || 0, salty: !!m.salty, warning: null, img: m.img || '', dig: 0, slot, time: new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) });
  await F.save(); $('sheet').classList.remove('on'); F.renderAll(); F.show('meals');
}

// ---------- 1. Είδος γεύματος + αγαπημένα στο παράθυρο καταγραφής ----------
document.querySelector('#sheet .inrow').insertAdjacentHTML('beforebegin', `<select id="logSlot">${opts(autoSlot())}</select><div><span class="sub tiny">Αγαπημένα και πρόσφατα (χωρίς AI):</span><div id="favs" class="chips" style="margin-top:6px"></div></div>`);
let favList = [];
function drawFavs() {
  const seen = new Map();
  Object.keys(F.days).sort().reverse().forEach(k => F.days[k].meals.forEach(m => { if (!seen.has(m.name)) seen.set(m.name, m); }));
  favList = [...seen.values()].slice(0, 8);
  $('favs').innerHTML = favList.length ? favList.map((m, i) => `<button class="chip" data-f="${i}">${esc(m.name)}</button>`).join('') : '<span class="sub tiny">Θα εμφανιστούν μετά το πρώτο σου γεύμα.</span>';
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => addMeal(favList[+b.dataset.f], $('logSlot').value));
}
$('aiBtn').addEventListener('click', () => { $('logSlot').value = autoSlot(); drawFavs(); });

// ---------- 2. Τι να φάω; ----------
$('v-plan').insertBefore(Object.assign(document.createElement('div'), {
  className: 'card form', id: 'sugCard',
  innerHTML: `<b>Τι να φάω;</b><label>Για ποιο γεύμα<select id="sugSlot">${opts(autoSlot())}</select></label><button id="sugBtn" class="btn">Πρότεινέ μου</button><div id="sugOut"></div>`
}), $('v-plan').children[2]);
let sugs = [];
$('sugBtn').onclick = async () => {
  const slot = $('sugSlot').value, g = F.G(), left = Math.max(g.kcal - F.sum('kcal'), 0), pl = Math.max(g.protein - F.sum('protein'), 0);
  const heavy = Object.values(F.days).flatMap(d => d.meals).filter(m => m.dig >= 4).map(m => m.name);
  const small = slot === 'Σνακ' || slot === 'Δεκατιανό' || slot === 'Απογευματινό';
  $('sugBtn').classList.add('busy'); $('sugOut').innerHTML = '<p class="sub tiny">Το AI σκέφτεται...</p>';
  try {
    const prompt = `Είσαι διατροφολόγος στην Ελλάδα. Στόχος χρήστη: ${F.cfg.goal === 'lose' ? 'απώλεια λίπους' : F.cfg.goal === 'gain' ? 'μυϊκή ανάπτυξη' : 'διατήρηση'}. Σήμερα υπολείπονται ${left} kcal και ${pl} g πρωτεΐνης. Πρότεινε 3 διαφορετικές επιλογές για: ${slot}. ${small ? 'Κράτα τες μικρές (150-300 kcal).' : 'Κράτα τες ισορροπημένες και χορταστικές.'} Απλά υλικά από ελληνικό σούπερ μάρκετ, με συγκεκριμένες ποσότητες. Απόφυγε ό,τι μοιάζει με: [${heavy.join('; ')}]. Επίστρεψε ΜΟΝΟ JSON: {"options":[{"name":"σύντομος τίτλος","desc":"τι περιέχει και πόσο, 1 πρόταση","kcal":0,"protein":0,"carbs":0,"fat":0}]}`;
    const a = await F.gemini([{ text: prompt }]);
    sugs = a.options || a;
    if (!Array.isArray(sugs) || !sugs.length) throw new Error('Το AI δεν επέστρεψε προτάσεις. Δοκίμασε ξανά.');
    $('sugOut').innerHTML = sugs.map((s, i) => `<div class="sug"><b>${esc(s.name)}</b><p>${esc(s.desc)}</p><p class="sub tiny">${Math.round(s.kcal)} kcal • Π ${Math.round(s.protein)}g • Υ ${Math.round(s.carbs)}g • Λ ${Math.round(s.fat)}g</p><button class="btn" data-s="${i}">Το έφαγα, πρόσθεσέ το</button></div>`).join('');
    document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => addMeal(sugs[+b.dataset.s], slot));
  } catch (e) { $('sugOut').innerHTML = `<p class="sub tiny">${esc(e.message)}</p>`; }
  $('sugBtn').classList.remove('busy');
};

// ---------- 3. Βάρος με γράφημα ----------
$('v-me').insertAdjacentHTML('beforeend', '<div class="card form" style="margin-top:2px"><b>Βάρος</b><div class="grid2"><label>Σήμερα (kg)<input id="bwIn" type="number" inputmode="decimal" placeholder="π.χ. 82.4"></label><button id="bwSave" class="btn" style="align-self:end">Καταγραφή</button></div><div id="bwChart"></div></div>');
function drawBw() {
  const w = F.cfg.weights || {}, k = Object.keys(w).sort().slice(-30);
  if (k.length < 2) { $('bwChart').innerHTML = '<p class="sub tiny">Χρειάζονται τουλάχιστον 2 καταγραφές για γράφημα.</p>'; return; }
  const v = k.map(x => w[x]), mn = Math.min(...v), mx = Math.max(...v), r = (mx - mn) || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * 280 + 10).toFixed(1)},${(70 - (y - mn) / r * 60).toFixed(1)}`).join(' ');
  $('bwChart').innerHTML = `<svg viewBox="0 0 300 80" style="width:100%"><polyline points="${pts}" fill="none" stroke="#ff8a4c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><p class="sub tiny">${v[0]} kg → ${v[v.length - 1]} kg (${(v[v.length - 1] - v[0]).toFixed(1)} kg)</p>`;
}
$('bwSave').onclick = async () => {
  const w = parseFloat($('bwIn').value); if (!(w > 20 && w < 400)) return;
  F.cfg.weights = F.cfg.weights || {}; F.cfg.weights[F.today()] = w; F.cfg.weight = w; $('pW').value = w;
  await F.save(); F.renderAll(); drawBw(); $('bwIn').value = '';
};
document.querySelector('nav [data-v="me"]').addEventListener('click', drawBw);
drawBw();
import('./extras2.js?v=1');

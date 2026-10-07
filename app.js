// ===== DUMMY DATA (θα αντικατασταθεί από Firebase στο επόμενο βήμα) =====
const GOAL = { kcal: 2000, protein: 170, water: 2.5 };
const state = {
  workout: false,
  water: 1.25,
  lock: 600,
  meals: [
    { icon: '🥣', name: 'Γιαούρτι 2% με whey & βρώμη', time: '08:30', kcal: 420, p: 42, c: 38, f: 9, salty: false, dig: 1 },
    { icon: '🍫', name: 'Alpro Dark Chocolate 250ml', time: '11:15', kcal: 150, p: 4, c: 17, f: 6, salty: false, dig: 2 },
    { icon: '🌯', name: '2 τυλιχτά μπιφτέκι (χωρίς πατάτες)', time: '14:10', kcal: 610, p: 56, c: 48, f: 24, salty: true, dig: 4,
      warn: 'Την προηγούμενη φορά αυτό σε φούσκωσε (βαθμός 4/5).' },
  ],
  // Διαφορά στόχου - κατανάλωσης ανά μέρα (Δευ, Τρι ολοκληρωμένες, Τετ = σήμερα)
  week: [['Δ', 320], ['Τ', 540], ['Τ', null], ['Π', 0], ['Π', 0], ['Σ', 0], ['Κ', 0]],
  friends: [
    { n: 'Μαρία', c: '#fb7185', s: 96 }, { n: 'Νίκος (εσύ)', c: '#8b5cf6', s: 88, me: true },
    { n: 'Γιάννης', c: '#22d3ee', s: 81 }, { n: 'Ελένη', c: '#fbbf24', s: 64 },
  ],
};

const $ = id => document.getElementById(id);
const sum = k => state.meals.reduce((a, m) => a + m[k], 0);
const fmt = n => n.toLocaleString('el-GR');

function countUp(el, to, ms = 1400) {
  const from = +el.dataset.v || 0, t0 = performance.now();
  el.dataset.v = to;
  const step = t => {
    const k = Math.min((t - t0) / ms, 1), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ===== RENDER =====
function renderProtein() {
  const p = sum('p'), pct = Math.min(p / GOAL.protein, 1), card = document.querySelector('.protein');
  const [color, msg] =
    pct >= 1   ? ['#4ade80', '🎯 Στόχος πρωτεΐνης ολοκληρώθηκε!'] :
    pct >= .75 ? ['#22d3ee', 'Σχεδόν έτοιμος, ένα γεύμα ακόμα'] :
    pct >= .4  ? ['#fbbf24', 'Καλή πορεία, συνέχισε'] :
                 ['#fb7185', 'Χρειάζεσαι περισσότερη πρωτεΐνη'];
  card.style.setProperty('--pc', color);
  card.classList.toggle('done', pct >= 1);
  $('proteinArc').style.strokeDashoffset = 540.4 * (1 - pct);
  $('proteinMsg').textContent = msg;
  countUp($('proteinVal'), p);
}

function renderKcal() {
  const e = sum('kcal');
  countUp($('kcalEaten'), e);
  $('kcalGoal').textContent = fmt(GOAL.kcal);
  $('kcalLeft').textContent = fmt(Math.max(GOAL.kcal - e, 0)) + ' kcal';
  $('kcalBar').style.width = Math.min(e / GOAL.kcal * 100, 100) + '%';
  $('mCarb').textContent = sum('c') + ' g';
  $('mFat').textContent = sum('f') + ' g';
  $('mPro').textContent = sum('p') + ' g';
}

function renderBank() {
  const todayIdx = 2, eaten = sum('kcal');
  const days = state.week.map(([l, v], i) => [l, i === todayIdx ? GOAL.kcal - eaten : v]);
  const banked = state.week.slice(0, todayIdx).reduce((a, [, v]) => a + v, 0);
  countUp($('bankTotal'), banked);
  const max = Math.max(...days.map(([, v]) => Math.abs(v)), 1);
  $('bankDays').innerHTML = days.map(([l, v], i) =>
    `<div class="dayCol ${v < 0 ? 'neg' : ''} ${i === todayIdx ? 'today' : ''}">
       <i data-h="${Math.abs(v) / max * 100}%"></i><span>${l}</span></div>`).join('');
  requestAnimationFrame(() => document.querySelectorAll('.dayCol i').forEach(i => i.style.height = i.dataset.h));
  renderLock();
}

function renderLock() {
  const left = GOAL.kcal - sum('kcal') - state.lock;
  $('lockVal').textContent = fmt(state.lock) + ' kcal';
  $('lockMsg').textContent = left >= 0
    ? `Κρατάς ${fmt(state.lock)} kcal για το βράδυ. Σου μένουν ${fmt(left)} kcal για το υπόλοιπο της μέρας.`
    : `Ξεπερνάς τον στόχο κατά ${fmt(-left)} kcal. Μείωσε το κλείδωμα ή το επόμενο γεύμα.`;
}

function renderWater() {
  const goal = GOAL.water + (state.workout ? 0.5 : 0) + (state.meals.some(m => m.salty) ? 0.3 : 0);
  $('waterGoal').textContent = goal.toFixed(1);
  $('waterVal').textContent = state.water.toFixed(2).replace(/0$/, '');
  $('waterBar').style.width = Math.min(state.water / goal * 100, 100) + '%';
  const why = [];
  if (state.meals.some(m => m.salty)) why.push('+0.3 L για αλμυρό γεύμα');
  if (state.workout) why.push('+0.5 L για προπόνηση');
  $('waterNote').textContent = why.length ? 'Ο στόχος ανέβηκε: ' + why.join(', ') + ' (αποφυγή κατακράτησης).' : 'Βασικός στόχος νερού.';
}

function mealHTML(m, i, isNew) {
  return `<article class="meal ${isNew ? 'new' : ''}">
    <div class="thumb">${m.icon}</div>
    <div class="info"><div class="name">${m.name}</div>
      <div class="sub">${m.time} • Π ${m.p}g • Υ ${m.c}g • Λ ${m.f}g${m.salty ? ' • 🧂 αλμυρό' : ''}</div></div>
    <div class="kcal">${m.kcal}<div class="sub">kcal</div></div>
    <label class="dig">Χώνεψη
      <input type="range" min="1" max="5" value="${m.dig}" data-i="${i}" class="slider digSlider">
      <b id="digv${i}">${m.dig}/5</b></label>
    ${m.warn ? `<div class="warn">⚠️ ${m.warn}</div>` : ''}
  </article>`;
}
function renderMeals(newFirst) {
  $('meals').innerHTML = state.meals.map((m, i) => mealHTML(m, i, newFirst && i === 0)).join('');
  document.querySelectorAll('.digSlider').forEach(s => s.oninput = () => {
    state.meals[s.dataset.i].dig = +s.value; $('digv' + s.dataset.i).textContent = s.value + '/5';
  });
}

function renderBoard() {
  $('board').innerHTML = state.friends.map((f, i) => `
    <div class="friend ${f.me ? 'me' : ''}" style="--c:${f.c}">
      <div class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</div>
      <div class="av">${f.n[0]}</div>
      <div class="flex-1"><div class="font-semibold">${f.n}</div>
        <div class="bar"><i style="width:${f.s}%"></i></div></div>
      <b class="font-display text-lg">${f.s}%</b></div>`).join('');
}

function renderAll() { renderProtein(); renderKcal(); renderBank(); renderWater(); renderMeals(); renderBoard(); }

// ===== AI LOGGER (προσομοίωση, το Gemini μπαίνει στο βήμα 2) =====
async function logMeal() {
  const text = $('logInput').value.trim();
  if (!text) { $('logStatus').textContent = 'Γράψε πρώτα τι έφαγες ή ήπιες.'; return; }
  $('logBtn').classList.add('busy'); $('logStatus').textContent = 'Το AI αναλύει το γεύμα...';
  await new Promise(r => setTimeout(r, 1200));
  const kcal = 250 + Math.floor(Math.random() * 350);
  state.meals.unshift({ icon: '🍽️', name: text, time: new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }),
    kcal, p: Math.round(kcal * .08), c: Math.round(kcal * .1), f: Math.round(kcal * .03), salty: /γύρο|τηγαν|πίτσα|burger/i.test(text), dig: 3 });
  $('logInput').value = ''; $('logBtn').classList.remove('busy');
  $('logStatus').textContent = 'Καταχωρήθηκε (δοκιμαστικές τιμές). Οι πραγματικές θα έρθουν με το Gemini.';
  renderAll(); renderMeals(true);
}

// ===== EVENTS =====
$('date').textContent = new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
$('logBtn').onclick = logMeal;
$('logInput').onkeydown = e => e.key === 'Enter' && logMeal();
$('addWater').onclick = () => { state.water += 0.25; renderWater(); };
$('workoutBtn').onclick = e => { state.workout = !state.workout; e.currentTarget.classList.toggle('on', state.workout); renderWater(); };
$('lockRange').oninput = e => { state.lock = +e.target.value; renderLock(); };
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
});

renderAll();

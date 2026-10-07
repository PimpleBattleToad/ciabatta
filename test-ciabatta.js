// Проверка расчётного ядра ciabatta.html
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(__dirname, 'ciabatta.html');
const html = fs.readFileSync(file, 'utf8');

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('FAIL: <script> не найден'); process.exit(1); }
const fullScript = scriptMatch[1];

// 1. Синтаксис всего скрипта
try { new vm.Script(fullScript, { filename: 'ciabatta-inline.js' }); }
catch (e) { console.error('FAIL: синтаксическая ошибка в скрипте —', e.message); process.exit(1); }
console.log('OK  синтаксис скрипта');

// 2. Ядро расчёта
const core = fullScript.match(/\/\*CALC-START\*\/([\s\S]*?)\/\*CALC-END\*\//);
if (!core) { console.error('FAIL: маркеры CALC не найдены'); process.exit(1); }
const ctx = vm.createContext({});
vm.runInContext(core[1] + '\n;this.computeRecipe=computeRecipe;this.waterTemp=waterTemp;this.buildPlan=buildPlan;this.roundRecipe=roundRecipe;', ctx);

let fails = 0;
function near(name, got, want, tol) {
  tol = tol === undefined ? 0.01 : tol;
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'OK  ' : 'FAIL') + '  ' + name + ': ' + got + (ok ? '' : ' ≠ ожидалось ' + want));
}
const base = { mode:'flour', flourWeight:500, doughWeight:1000, loaves:2, loafWeight:350,
  hydration:75, salt:2, yeastPct:0.8, prefPct:40, prefHyd:45, prefYeastShare:100 };

// режим "по муке"
let r = ctx.computeRecipe(base);
near('мука', r.flour, 500);
near('мука в биге (40 %)', r.prefFlour, 200);
near('мука в основное тесто', r.mainFlour, 300);
near('вода в биге (45 %)', r.prefWater, 90);
near('вся вода (75 %)', r.totalWater, 375);
near('вода в основное тесто', r.mainWater, 285);
near('соль 2 %', r.salt, 10);
near('дрожжи 0,8 %', r.yeast, 4);
near('дрожжи в биге (100 %)', r.prefYeast, 4);
near('дрожжи в основное тесто', r.mainYeast, 0);
near('вес биги', r.prefWeight, 294);
near('вес теста', r.totalDough, 889);
near('сумма компонентов = вес теста', r.flour + r.totalWater + r.salt + r.yeast, r.totalDough);
near('гидратация от веса теста, %', r.doughHydration, 375 / 889 * 100);
near('соль от веса теста, %', r.saltInDough, 10 / 889 * 100);
console.log('     название закваски: ' + r.prefName);

// режим "по весу теста"
r = ctx.computeRecipe(Object.assign({}, base, { mode:'dough', doughWeight:1000 }));
near('мука из 1000 г теста', r.flour, 1000 / 1.778);
near('вес теста = 1000', r.totalDough, 1000, 0.02);

// режим "по буханкам"
r = ctx.computeRecipe(Object.assign({}, base, { mode:'loaves', loaves:2, loafWeight:350 }));
near('тесто для 2×350 г', r.totalDough, 700, 0.02);

// без закваски
r = ctx.computeRecipe(Object.assign({}, base, { prefPct:0 }));
near('прямой замес: мука', r.flour, 500);
near('прямой замес: мука в основное тесто', r.mainFlour, 500);
near('прямой замес: закваска = 0', r.prefWeight, 0);
near('прямой замес: вес теста', r.totalDough, 889);
console.log('     название без закваски: ' + r.prefName);

// поляш
r = ctx.computeRecipe(Object.assign({}, base, { prefPct:30, prefHyd:100 }));
near('поляш: вода в закваске', r.prefWater, 150);
near('поляш: вода в основное тесто', r.mainWater, 225);
console.log('     название при 100 % воды: ' + r.prefName);

// нехватка воды
r = ctx.computeRecipe(Object.assign({}, base, { prefPct:100, prefHyd:100 }));
near('дефицит воды обнаружен', r.waterDeficit, 125, 0.5);

// температура воды
near('температура воды (24/21/23/5)', ctx.waterTemp(24, 21, 23, 5), 23);

// план работ
let plan = ctx.buildPlan({ prefPct:0, prefHours:16, prefTemp:17 }, 'без закваски');
near('план без закваски: минут', plan.totalMinutes, 230);
near('план без закваски: шагов', plan.steps.length, 5);
plan = ctx.buildPlan({ prefPct:40, prefHours:16, prefTemp:17 }, 'бига');
near('план с бигой: минут', plan.totalMinutes, 1200);
near('план с бигой: шагов', plan.steps.length, 7);
near('план с бигой: первый шаг — замес закваски', plan.steps[0].at, 0);

// защита от мусора
if (ctx.computeRecipe(Object.assign({}, base, { flourWeight:0, mode:'flour' })) !== null) { fails++; console.log('FAIL  нулевая мука должна давать null'); }
else console.log('OK    нулевая мука → null');

// ---------- целые граммы ----------
console.log('\n-- округление до целых граммов --');
const FIELDS = ['flour','prefFlour','mainFlour','totalWater','prefWater','mainWater',
  'salt','yeast','prefYeast','mainYeast','prefWeight','totalDough'];
function allInt(name, o){
  const bad = FIELDS.filter(f => !Number.isInteger(o[f]));
  if (bad.length) { fails++; console.log('FAIL  ' + name + ': не целые — ' + bad.map(f => f + '=' + o[f]).join(', ')); }
  else console.log('OK    ' + name + ': все веса целые');
}
function sumsHold(name, o){
  const ok1 = o.prefFlour + o.mainFlour === o.flour;
  const ok2 = o.prefWater + o.mainWater === o.totalWater;
  const ok3 = o.prefYeast + o.mainYeast === o.yeast;
  const ok4 = o.flour + o.totalWater + o.salt + o.yeast === o.totalDough;
  const ok5 = o.prefFlour + o.prefWater + o.prefYeast === o.prefWeight;
  const bad = [!ok1 && 'мука', !ok2 && 'вода', !ok3 && 'дрожжи', !ok4 && 'итог', !ok5 && 'вес закваски'].filter(Boolean);
  if (bad.length) { fails++; console.log('FAIL  ' + name + ': не сходятся суммы — ' + bad.join(', ')); }
  else console.log('OK    ' + name + ': все суммы сходятся');
}

// от веса теста: итог должен быть ровно 1000
let rr = ctx.roundRecipe(ctx.computeRecipe(Object.assign({}, base, { mode:'dough', doughWeight:1000 })), 1000);
allInt('1000 г теста', rr);
sumsHold('1000 г теста', rr);
near('итог ровно 1000 г', rr.totalDough, 1000, 0);
console.log('     мука ' + rr.flour + ' (бига ' + rr.prefFlour + ' + тесто ' + rr.mainFlour + '), вода ' +
  rr.totalWater + ' (бига ' + rr.prefWater + ' + тесто ' + rr.mainWater + '), соль ' + rr.salt + ', дрожжи ' + rr.yeast);
near('округлять больше нечего (отклонение 0)', rr.targetDelta, 0, 0);

// от веса муки: цель не задана, но суммы те же
rr = ctx.roundRecipe(ctx.computeRecipe(Object.assign({}, base, { mode:'flour', flourWeight:500 })), null);
allInt('500 г муки', rr);
sumsHold('500 г муки', rr);
near('мука ровно 500 г', rr.flour, 500, 0);

// по буханкам: 2 × 350 г теста
rr = ctx.roundRecipe(ctx.computeRecipe(Object.assign({}, base, { mode:'loaves', loaves:2, loafWeight:350 })), 700);
allInt('2×350 г', rr);
sumsHold('2×350 г', rr);
near('итог ровно 700 г', rr.totalDough, 700, 0);

// другие режимы и пресеты — веса целые и суммы сходятся
[['поляш', { prefPct:30, prefHyd:100, hydration:78, yeastPct:1 }],
 ['прямой замес', { prefPct:0, yeastType:'instant', yeastPct:0.5, hydration:80 }],
 ['цельное зерно', { prefPct:30, prefHyd:50, hydration:80, yeastPct:1 }],
 ['гидратация 60 %', { hydration:60 }],
 ['гидратация 95 %', { hydration:95 }],
 ['много соли', { salt:2.5, prefPct:50, prefHyd:55 }]].forEach(function(c){
  const raw = ctx.computeRecipe(Object.assign({}, base, c[1], { mode:'dough', doughWeight:900 }));
  const o = ctx.roundRecipe(raw, 900);
  allInt(c[0], o);
  sumsHold(c[0], o);
  near(c[0] + ': итог ровно 900 г', o.totalDough, 900, 0);
});

// очень маленькая партия: меньше грамма → 1 г и флаг
rr = ctx.roundRecipe(ctx.computeRecipe(Object.assign({}, base, { mode:'flour', flourWeight:100, prefPct:0, yeastPct:0.4 })), null);
allInt('малая партия 100 г', rr);
sumsHold('малая партия 100 г', rr);
near('дрожжи 0,4 г → 1 г', rr.yeast, 1, 0);
if (rr.bumped !== true) { fails++; console.log('FAIL  флаг «меньше 1 г» не выставлен'); }
else console.log('OK    флаг «меньше 1 г» выставлен');

// некруглый вес теста и закваска 100 %
rr = ctx.roundRecipe(ctx.computeRecipe(Object.assign({}, base, { mode:'dough', doughWeight:1234, prefPct:100, prefHyd:100, hydration:80 })), 1234);
allInt('1234 г, вся мука в закваске', rr);
sumsHold('1234 г, вся мука в закваске', rr);
near('итог ровно 1234 г', rr.totalDough, 1234, 0);
near('в основном тесте муки нет', rr.mainFlour, 0, 0);

// проценты после округления не разъезжаются больше чем на 1 %
rr = ctx.roundRecipe(ctx.computeRecipe(Object.assign({}, base, { mode:'dough', doughWeight:1000 })), 1000);
near('гидратация после округления (75 ± 1 %)', rr.pWater, 75, 1);
near('соль после округления (2 ± 0,2 %)', rr.pSalt, 2, 0.2);

// ---------- структура страницы ----------
const idsMatch = fullScript.match(/var ids = \[([\s\S]*?)\];/);
const ids = idsMatch[1].match(/'([a-zA-Z]+)'/g).map(s => s.replace(/'/g, ''));
const dynamic = ['flourWeight', 'doughWeight', 'loaves', 'loafWeight'];
const missing = ids.filter(id => !html.includes('id="' + id + '"') && !dynamic.includes(id));
if (missing.length) { fails++; console.log('FAIL  нет элементов с id: ' + missing.join(', ')); }
else console.log('OK   все поля ввода существуют');

// 4. Баланс тегов (грубая проверка структуры)
for (const tag of ['html', 'head', 'body', 'script', 'style', 'section', 'table', 'div']) {
  const open = (html.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
  const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  if (open !== close) { fails++; console.log(`FAIL  <${tag}>: открыто ${open}, закрыто ${close}`); }
}
console.log('OK   баланс основных тегов проверен');

console.log(fails === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nПРОВАЛЕНО ПРОВЕРОК: ${fails}`);
process.exit(fails === 0 ? 0 : 1);

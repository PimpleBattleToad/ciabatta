// Прогон полного скрипта страницы на заглушке DOM: ловим ошибки рендера.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'ciabatta.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const NUMBER_IDS = ['hydration','salt','yeastPct','prefPct','prefHyd','prefYeastShare','prefHours',
  'prefTemp','ddt','flourTemp','roomTemp','friction','flourWeight','doughWeight','loaves','loafWeight'];
const els = {};
function El(id){ this.id = id; this.value = ''; this.innerHTML = ''; this.textContent = '';
  this.style = {}; this._l = {}; this.type = NUMBER_IDS.includes(id) ? 'number' : 'text';
  if (id === 'mode' || id === 'yeastType') this.type = 'select-one';
  if (id === 'start') this.type = 'time';
  if (id === 'presets' || id === 'printBtn' || id === 'copyBtn') this.tagName = 'BUTTON';
}
El.prototype.addEventListener = function(t, f){ (this._l[t] = this._l[t] || []).push(f); };
El.prototype.closest = function(){ return null; };
El.prototype.querySelectorAll = function(){ return []; };

const docListeners = {};
const document = {
  getElementById(id){ return els[id] || (els[id] = new El(id)); },
  addEventListener(t, f){ (docListeners[t] = docListeners[t] || []).push(f); }
};
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const errors = [];
const ctx = vm.createContext({
  document, localStorage, console,
  window: { print(){}, prompt(){}, },
  navigator: {},
  setTimeout: (f) => 0,
  Math, JSON, String, Number, Object, Array, isFinite, parseInt, parseFloat, Date
});

try { vm.runInContext(script, ctx, { filename: 'page.js' }); }
catch (e) { errors.push('рендер упал: ' + e.stack.split('\n').slice(0, 3).join(' | ')); }

function check(name, cond, extra){
  console.log((cond ? 'OK  ' : 'FAIL') + '  ' + name + (cond ? '' : ' — ' + (extra || '')));
  if (!cond) errors.push(name);
}

check('режим по умолчанию — вес теста', els.mode.value === 'dough', 'mode=' + els.mode.value);
check('поле веса теста создано', !!els.doughWeight, 'нет #doughWeight');
check('заголовок с весом теста заполнен', /г теста всего/.test(els.bigNumber.innerHTML), els.bigNumber.innerHTML);
check('нет ошибок в блоке предупреждений', els.alerts.innerHTML.indexOf('alert err') === -1,
  els.alerts.innerHTML.replace(/<[^>]+>/g, ' ').trim().slice(0, 200));
check('таблица закваски построена', /Мука/.test(els.recipeTables.innerHTML));
check('таблица пекарских процентов есть', /Пекарские проценты/.test(els.recipeTables.innerHTML));
check('таблица дрожжей с процентами (без undefined)', els.waterBox.innerHTML.indexOf('undefined') === -1,
  els.waterBox.innerHTML.slice(0, 200));
check('температура воды посчитана', /температура воды/.test(els.waterBox.innerHTML));
check('нет "NaN" в разметке', (els.recipeTables.innerHTML + els.waterBox.innerHTML + els.plan.innerHTML).indexOf('NaN') === -1);
check('план с временем старта 09:00', /09:00/.test(els.plan.innerHTML), els.plan.innerHTML.slice(0, 100));
check('всего шагов в плане', (els.plan.innerHTML.match(/<tr>/g) || []).length === 7,
  'шагов: ' + (els.plan.innerHTML.match(/<tr>/g) || []).length);
check('настройки сохранены в localStorage', !!store['ciabatta-calc-v1']);
check('липкая строка с итогом заполнена', els.sbVal.textContent === '1\u00A0000 г',
  'sbVal=' + els.sbVal.textContent);

// --- целые граммы в готовой разметке ---
const digits = s => s.replace(/[^\d]/g, '');
check('итог ровно 1000 г (по умолчанию 1000 г теста)', digits(els.bigNumber.innerHTML) === '1000',
  'получено: ' + els.bigNumber.innerHTML.replace(/<[^>]+>/g, ''));
const gramCells = (els.recipeTables.innerHTML + els.waterBox.innerHTML)
  .match(/class="num"><b>([^<]+)<\/b>/g) || [];
const fractional = gramCells.filter(c => /[,.]/.test(c) && !/%/.test(c));
check('все граммы — целые числа', fractional.length === 0,
  'с дробями: ' + fractional.join(' | '));
check('граммовых ячеек найдено > 8', gramCells.length > 8, 'найдено ' + gramCells.length);
// регрессия: длинная подсказка в колонке без переноса распирала страницу шире экрана
const longNumCells = els.recipeTables.innerHTML.match(/class="num"[^>]*>([^<]{14,})</g) || [];
check('в колонках без переноса нет длинного текста', longNumCells.length === 0,
  longNumCells.join(' | ').slice(0, 200));
check('колонка подсказок помечена классом note', /class="note"/.test(els.recipeTables.innerHTML));
check('в подсказке сказано про целые граммы', /целые граммы/.test(els.alerts.innerHTML));
// сумма по таблице основного теста совпадает с итогом
const tableNums = (els.recipeTables.innerHTML.match(/<b>(\d[\d\u00A0 ]*)<\/b>/g) || [])
  .map(m => parseInt(m.replace(/[^\d]/g, ''), 10));
check('таблицы содержат числовые значения', tableNums.length > 5, 'найдено ' + tableNums.length);

// смена режима на "число буханок"
els.mode.value = 'loaves';
docListeners.input.forEach(f => f({ target: { tagName: 'SELECT', id: 'mode' } }));
check('режим буханок: поля появились', !!els.loaves && !!els.loafWeight, 'loaves=' + !!els.loaves);
check('режим буханок: расчёт пересчитан', /г теста всего/.test(els.bigNumber.innerHTML), els.bigNumber.innerHTML);

// ручной ввод: гидратация 100 %
els.hydration.value = '100';
docListeners.input.forEach(f => f({ target: { tagName: 'INPUT', id: 'hydration' } }));
check('новый ввод пересчитал рецепт', /г теста всего/.test(els.bigNumber.innerHTML));
check('нет ошибок при гидратации 100 %', els.alerts.innerHTML.indexOf('alert err') === -1,
  els.alerts.innerHTML.replace(/<[^>]+>/g, ' ').trim().slice(0, 200));

// пресет "На поляше" (индекс 2)
const presetHandler = els.presets._l.click[0];
presetHandler({ target: { closest: () => ({ dataset: { i: '2' } }) } });
check('пресет поляша применился', els.prefHyd.value == 100 && els.prefPct.value == 30,
  'prefHyd=' + els.prefHyd.value + ' prefPct=' + els.prefPct.value);
check('в рецепте появился поляш', /Поляш/.test(els.recipeTables.innerHTML));
check('гидратация 78 % из пресета', els.hydration.value == 78, 'hydration=' + els.hydration.value);

// пресет "Прямой замес" (индекс 3)
presetHandler({ target: { closest: () => ({ dataset: { i: '3' } }) } });
check('прямой замес: нет блока закваски', !/за 1 ч до замеса/.test(els.recipeTables.innerHTML));
check('прямой замес: дрожжи целиком в тесте', /Дрожжи сухие быстродействующие/.test(els.recipeTables.innerHTML));

// нехватка воды: 100 % муки в закваске при гидратации закваски 100 %
els.prefPct.value = '100'; els.prefHyd.value = '100'; els.hydration.value = '70';
docListeners.input.forEach(f => f({ target: { tagName: 'INPUT', id: 'prefPct' } }));
check('предупреждение о дефиците воды показано', /больше, чем нужно/.test(els.alerts.innerHTML),
  els.alerts.innerHTML.replace(/<[^>]+>/g, ' ').trim().slice(0, 200));

// слишком тёплая мука → отрицательная температура воды
els.prefPct.value = '0'; els.flourTemp.value = '40'; els.roomTemp.value = '30'; els.ddt.value = '22';
docListeners.input.forEach(f => f({ target: { tagName: 'INPUT', id: 'flourTemp' } }));
check('предупреждение об отрицательной температуре воды', /отрицательная/.test(els.alerts.innerHTML),
  els.alerts.innerHTML.replace(/<[^>]+>/g, ' ').trim().slice(0, 160));

// мусор в поле
els.prefPct.value = '0'; els.flourTemp.value = '21'; els.roomTemp.value = '23'; els.ddt.value = '24';
els.salt.value = 'abc';
docListeners.input.forEach(f => f({ target: { tagName: 'INPUT', id: 'salt' } }));
check('нечисловой ввод не ломает рендер', els.recipeTables.innerHTML.indexOf('NaN') === -1);

console.log(errors.length ? '\nОШИБКИ: ' + errors.length : '\nРЕНДЕР РАБОТАЕТ БЕЗ ОШИБОК');
process.exit(errors.length ? 1 : 0);

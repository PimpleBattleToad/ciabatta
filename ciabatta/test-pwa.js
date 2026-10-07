// Проверка «телефонной» упаковки: PWA-файлы, иконки и локальный сервер.
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { spawn } = require('child_process');

const dir = __dirname;
let fails = 0;

function check(name, cond, extra){
  console.log((cond ? 'OK  ' : 'FAIL') + '  ' + name + (cond ? '' : ' — ' + (extra || '')));
  if (!cond) fails++;
}
const full = f => path.join(dir, f);
const exists = f => fs.existsSync(full(f));
const text = f => fs.readFileSync(full(f), 'utf8');
const json = f => JSON.parse(text(f));
function pngSize(buf){ return buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20); }

// ---------- 1. файлы на месте ----------
console.log('-- файлы --');
['ciabatta.html', 'index.html', 'manifest.json', 'sw.js',
 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/maskable-512.png',
 'serve-lan.js', 'serve-lan.ps1', 'tools/make-icons.py', 'README.md'].forEach(f => {
  check('есть ' + f, exists(f));
});

// ---------- 2. манифест ----------
console.log('\n-- манифест --');
let man = null;
try { man = json('manifest.json'); check('manifest.json — валидный JSON', true); }
catch (e) { check('manifest.json — валидный JSON', false, e.message); }
if (man){
  check('name и short_name заполнены', !!man.name && !!man.short_name);
  check('display = standalone (запуск без браузерных панелей)', man.display === 'standalone', man.display);
  check('start_url задан', !!man.start_url, man.start_url);
  check('theme_color совпадает с темой страницы',
    man.theme_color && text('ciabatta.html').indexOf('name="theme-color" content="' + man.theme_color + '"') !== -1);
  const sizes = (man.icons || []).map(i => i.sizes);
  check('есть иконка 192x192', sizes.indexOf('192x192') !== -1, sizes.join(', '));
  check('есть иконка 512x512', sizes.indexOf('512x512') !== -1, sizes.join(', '));
  check('есть maskable-иконка для Android', (man.icons || []).some(i => i.purpose === 'maskable'));
  check('пути в манифесте относительные (сайт работает из подпапки, как на GitHub Pages)',
    !String(man.start_url).startsWith('/') &&
    (man.icons || []).every(i => !String(i.src).startsWith('/')),
    'start_url=' + man.start_url);
  (man.icons || []).forEach(ic => {
    if (!exists(ic.src)) { check('файл иконки ' + ic.src, false); return; }
    const real = pngSize(fs.readFileSync(full(ic.src)));
    const want = ic.sizes.replace('x', 'x');
    check('иконка ' + ic.src + ' действительно ' + want, real === want, 'на диске ' + real);
  });
}

// ---------- 2b. имена файлов с точным регистром (Linux-хостинг как GitHub Pages) ----------
console.log('\n-- регистр имён файлов --');
// На Windows «Icon-192.PNG» и «icon-192.png» — один файл, а на хостинге — разные.
// Поэтому сверяем каждое имя с реальной записью в папке, буква в букву.
function existsExact(rel){
  let cur = dir;
  for (const part of rel.split('/')){
    if (!fs.existsSync(cur) || fs.readdirSync(cur).indexOf(part) === -1) return false;
    cur = path.join(cur, part);
  }
  return true;
}
const refs = new Set();
(man && man.icons ? man.icons : []).forEach(i => refs.add(i.src));
const swText = text('sw.js');
(swText.match(/'\.\/([^']+)'/g) || []).forEach(m => {
  const p = m.replace(/'/g, '').replace('./', '');
  if (p && p !== '') refs.add(p);
});
['manifest.json', 'icons/icon-180.png'].forEach(p => refs.add(p));
const wrongCase = [...refs].filter(p => !existsExact(p));
check('все ссылки совпадают с именами файлов буква в букву', wrongCase.length === 0,
  'не найдено: ' + wrongCase.join(', '));
check('ссылок проверено', refs.size >= 7, 'проверено ' + refs.size);

// ---------- 3. страница готова к установке ----------
console.log('\n-- страница --');
const page = text('ciabatta.html');
check('подключён манифест', /rel="manifest" href="manifest\.json"/.test(page));
check('есть apple-touch-icon', /rel="apple-touch-icon"/.test(page));
check('есть theme-color', /name="theme-color"/.test(page));
check('нет viewport-fit=cover — содержимое не уезжает под вырез экрана', !/viewport-fit=cover/.test(page));
check('колонка подсказок переносится, а не nowrap (иначе таблица распирает страницу)',
  /td\.note,th\.note\{[^}]*white-space:normal/.test(page) && /<td class="note"/.test(page));
check('длинные подсказки больше не попадают в nowrap-колонку',
  !/class="num" style="color:var\(--dim\)"/.test(page));
check('таблицы защищены от обрезки: прокрутка внутри блока',
  /#recipeTables,#waterBox,#plan\{overflow-x:auto\}/.test(page));
check('диагностика называет вылезающий элемент',
  /ВЫЛЕЗАЕТ/.test(page) && /getBoundingClientRect/.test(page));
check('в диагностике есть номер сборки — видно, свежая ли версия открыта',
  /var BUILD = 'v\d+'/.test(page) && /BUILD \+ ' · ширина '/.test(page));
check('есть автоподгонка: страница ужимается, если вьюпорт шире экрана',
  /style\.zoom = z/.test(page) && /vv\.width \* 1\.05/.test(page));
check('служебная строка скрыта и включается только по ?debug',
  /location\.search\.indexOf\('debug'\)/.test(page) && /<div id="diag"[^>]*hidden/.test(page));
check('есть липкая строка с итогом', /id="stickyBar"/.test(page) && /id="sbVal"/.test(page));
check('липкая строка обновляется в render()', /sbVal[\s\S]{0,80}textContent = g\(r\.totalDough\)/.test(page));
check('есть регистрация service worker', /serviceWorker\.register\('sw\.js'\)/.test(page));
check('service worker не регистрируется с локального файла', /location\.protocol === 'https:'/.test(page)
  && /typeof location !== 'undefined'/.test(page));
check('мобильная вёрстка: медиазапрос 880px', /@media \(max-width:880px\)/.test(page));
check('шрифт в полях 16px (иначе Android зумит при вводе)', /input\[type=number\][^{]*\{[^}]*font-size:16px/.test(page));
check('липкая строка скрыта при печати', /#stickyBar\{display:none!important\}/.test(page));
check('index.html ведёт на калькулятор', /url=\.\/ciabatta\.html/.test(text('index.html')));
const style = (page.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
const openB = (style.match(/\{/g) || []).length, closeB = (style.match(/\}/g) || []).length;
check('CSS без потерянных скобок', openB === closeB, openB + ' «{» против ' + closeB + ' «}»');
check('на телефоне есть отступ снизу под липкую строку', /padding-bottom|padding:16px 12px calc\(88px/.test(style));

// ---------- 4. офлайн-кэш ----------
console.log('\n-- офлайн-кэш --');
const sw = text('sw.js');
try { new vm.Script(sw, { filename: 'sw.js' }); check('sw.js — валидный JS', true); }
catch (e) { check('sw.js — валидный JS', false, e.message); }
const assets = (sw.match(/ASSETS = \[([\s\S]*?)\]/) || [, ''])[1].match(/'\.\/[^']*'/g) || [];
check('в кэш перечислены файлы', assets.length >= 6, 'найдено ' + assets.length);
const missing = assets.map(a => a.replace(/'/g, '')).map(a => a.replace(/^\.\//, ''))
  .filter(a => a && a !== '' && !exists(a));
check('все файлы из кэша существуют', missing.length === 0, 'нет: ' + missing.join(', '));
check('страница берётся из сети с откатом в кэш (правки видны сразу)',
  /fetch\(req\)[\s\S]*catch[\s\S]*caches\.match/.test(sw));

// ---------- 4b. Telegram Mini App ----------
console.log('\n-- Telegram --');
check('подключён telegram-web-app.js', /src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/.test(page));
check('инициализация защищена проверкой наличия Telegram',
  /window\.Telegram && window\.Telegram\.WebApp/.test(page));
check('вызывается ready() и expand() (полный экран)',
  /tg\.ready\(\)/.test(page) && /tg\.expand\(\)/.test(page));
check('обёрнуто в try/catch — старый клиент не сломает страницу',
  /if \(tg\)\{[\s\S]{0,400}try \{[\s\S]{0,400}catch/.test(page));
check('данные tgWebAppData из адреса не читаются и не отправляются',
  !/tgWebAppData/.test(page) && !/initData/.test(page));
check('масштаб зафиксирован: maximum-scale=1 (иначе страница остаётся увеличенной)',
  /maximum-scale=1/.test(page), 'нет maximum-scale в viewport');
check('запрещён зум пользователем: user-scalable=no', /user-scalable=no/.test(page));
check('страница не выезжает по горизонтали', /html,body\{overflow-x:hidden\}/.test(page));
check('в Telegram на телефоне принудительно одна колонка', /html\.tg \.grid\{grid-template-columns:1fr\}/.test(page));
check('класс tg ставится по platform android/ios или узкому вьюпорту',
  /tg\.platform === 'android'/.test(page) && /className \+= ' tg'/.test(page));
check('есть диагностическая строка вьюпорта', /id="diag"/.test(page) && /· видно /.test(page));

// ---------- 4c. архив для публикации ----------
console.log('\n-- архив для публикации --');
if (!exists('ciabatta-site.zip')){
  console.log('OK    ciabatta-site.zip не собран (необязательный шаг: tools/make-zip.ps1)');
} else {
  const buf = fs.readFileSync(full('ciabatta-site.zip'));
  const names = [];
  for (let i = 0; (i = buf.indexOf(Buffer.from('PK\x01\x02', 'latin1'), i)) !== -1; i += 46){
    const len = buf.readUInt16LE(i + 28);
    names.push(buf.toString('utf8', i + 46, i + 46 + len));
  }
  check('в архиве есть страницы', names.includes('index.html') && names.includes('ciabatta.html'), names.join(', '));
  check('в архиве есть манифест и офлайн-кэш',
    names.includes('manifest.json') && names.includes('sw.js'));
  check('все иконки лежат в icons/ с прямыми слэшами',
    names.filter(n => n.indexOf('icons/') === 0).length === 4 && !names.some(n => n.indexOf('\\') !== -1),
    names.join(', '));
}

// ---------- 5. локальный сервер ----------
function get(port, urlPath){
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 1500 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

(async function(){
  console.log('\n-- локальный сервер --');
  const port = 8099;
  let child = null;
  try {
    child = spawn(process.execPath, [full('serve-lan.js'), String(port)], { cwd: dir, stdio: 'ignore' });
  } catch (e) {
    check('сервер удалось запустить', false, e.message);
  }

  let up = false;
  for (let i = 0; i < 40 && !up; i++){
    try { const r = await get(port, '/ciabatta.html'); up = r.status === 200; }
    catch (e) { await new Promise(r => setTimeout(r, 150)); }
  }
  check('сервер отвечает по HTTP', up, up ? '' : 'порт ' + port + ' не поднялся (возможно, сеть ограничена политикой)');

  if (up){
    let r = await get(port, '/ciabatta.html');
    check('GET /ciabatta.html → 200', r.status === 200, 'код ' + r.status);
    check('отдаётся как HTML в UTF-8', /text\/html/.test(r.type) && /utf-8/i.test(r.type), r.type);
    check('русский текст не побился', r.body.indexOf('Калькулятор чиабатты') !== -1);
    check('в отданном HTML есть манифест', r.body.indexOf('manifest.json') !== -1);

    r = await get(port, '/');
    check('GET / → 200 (страница-редирект)', r.status === 200, 'код ' + r.status);

    r = await get(port, '/manifest.json');
    check('манифест отдаётся с JSON-типом (Chrome принимает application/json)',
      r.status === 200 && /json/.test(r.type), r.status + ' ' + r.type);

    r = await get(port, '/icons/icon-192.png');
    check('иконка отдаётся как PNG', r.status === 200 && /image\/png/.test(r.type), r.status + ' ' + r.type);
    check('иконка не пустая', r.body.length > 4000, r.body.length + ' байт');

    r = await get(port, '/sw.js');
    check('sw.js отдаётся', r.status === 200 && /javascript/.test(r.type), r.status + ' ' + r.type);

    r = await get(port, '/nope.html');
    check('несуществующий файл → 404', r.status === 404, 'код ' + r.status);

    for (const bad of ['/../README.md', '/%2e%2e/README.md', '/../../Windows/win.ini',
                       '/..%5cREADME.md', '/icons/..%2f..%2fREADME.md',
                       '/C:%5cWindows%5cwin.ini', '/%2e%2e%2ficons/icon-512.png']){
      r = await get(port, bad);
      check('выход за пределы папки закрыт: ' + bad, r.status === 403 || r.status === 404,
        'код ' + r.status + (r.status === 200 ? ' — отдал ' + r.body.length + ' байт' : ''));
    }
    // контрольная проверка, что обычные файлы по-прежнему отдаются
    r = await get(port, '/README.md');
    check('обычный файл рядом с калькулятором отдаётся', r.status === 200 && /Калькулятор/.test(r.body), 'код ' + r.status);
  }

  if (child) child.kill();

  // ---------- 6. публикация в подпапке (так отдаёт GitHub Pages) ----------
  console.log('\n-- публикация в подпапке: /имя-репозитория/ (GitHub Pages) --');
  const pagesDir = full('_pages');
  if (!pagesDir.startsWith(dir)) { check('временная папка внутри проекта', false, pagesDir); }
  fs.rmSync(pagesDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(pagesDir, 'ciabatta'), { recursive: true });
  ['index.html', 'ciabatta.html', 'manifest.json', 'sw.js'].forEach(f =>
    fs.copyFileSync(full(f), path.join(pagesDir, 'ciabatta', f)));
  fs.cpSync(full('icons'), path.join(pagesDir, 'ciabatta', 'icons'), { recursive: true });
  fs.copyFileSync(full('serve-lan.js'), path.join(pagesDir, 'serve-lan.js'));

  const subPort = 8098;
  let sub = null;
  try {
    sub = spawn(process.execPath, [path.join(pagesDir, 'serve-lan.js'), String(subPort)],
      { cwd: pagesDir, stdio: 'ignore' });
  } catch (e) { check('сервер подпапки запустился', false, e.message); }

  let subUp = false;
  for (let i = 0; i < 40 && !subUp; i++){
    try { const r = await get(subPort, '/ciabatta/ciabatta.html'); subUp = r.status === 200; }
    catch (e) { await new Promise(r => setTimeout(r, 150)); }
  }
  check('сайт открывается по адресу /имя-репозитория/ciabatta.html', subUp);

  if (subUp){
    let r = await get(subPort, '/ciabatta/');
    check('адрес папки /имя-репозитория/ → 200 (index.html)', r.status === 200 && /ciabatta\.html/.test(r.body),
      'код ' + r.status);

    r = await get(subPort, '/ciabatta/manifest.json');
    check('манифест доступен из подпапки', r.status === 200, 'код ' + r.status);
    let m = null;
    try { m = JSON.parse(r.body); } catch (e) {}
    check('start_url относительный — не привязан к корню домена',
      !!m && !String(m.start_url).startsWith('/'), m && m.start_url);
    check('scope относительный', !!m && !String(m.scope).startsWith('/'), m && m.scope);

    r = await get(subPort, '/ciabatta/icons/icon-192.png');
    check('иконка находится по относительному пути', r.status === 200 && /image\/png/.test(r.type),
      'код ' + r.status + ' ' + r.type);

    r = await get(subPort, '/ciabatta/sw.js');
    check('service worker доступен из подпапки (офлайн и установка работают)',
      r.status === 200 && /javascript/.test(r.type), 'код ' + r.status);
  }

  if (sub){
    sub.kill();
    // ждём реального завершения: пока процесс жив, Windows не отдаёт его рабочий каталог
    await new Promise(r => { sub.once('exit', r); setTimeout(r, 2000); });
  }
  if (pagesDir.startsWith(dir)){
    try { fs.rmSync(pagesDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }); }
    catch (e) { console.log('     (временную папку _pages убрать не удалось: ' + e.code + ' — удалите вручную)'); }
  }
  check('временная папка уборки не осталась', !fs.existsSync(pagesDir), '_pages осталась в проекте');

  console.log(fails === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nПРОВАЛЕНО ПРОВЕРОК: ' + fails);
  process.exit(fails === 0 ? 0 : 1);
})();

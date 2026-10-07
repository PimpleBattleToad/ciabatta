/* Крошечный статический сервер: чтобы открыть калькулятор на телефоне по Wi-Fi.
   Запуск:  node serve-lan.js 8080     (или serve-lan.ps1)
   Затем на телефоне откройте адрес, который напечатает сервер. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = __dirname;
const port = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer(function(req, res){
  let rel = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);

  // Защита от выхода за пределы папки: никаких «..» и обратных слэшей в пути.
  if (rel.indexOf('\\') !== -1 || rel.split('/').indexOf('..') !== -1){
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 — выход за пределы папки запрещён');
    return;
  }

  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, path.normalize(rel).replace(/^[/\\]+/, ''));
  // вторая проверка на всякий случай: итоговый путь обязан остаться внутри папки
  if (!file.startsWith(root)) { res.writeHead(403); res.end('403'); return; }

  fs.readFile(file, function(err, data){
    if (err){
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — файл не найден: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.on('error', function(e){
  if (e.code === 'EADDRINUSE') console.error('Порт ' + port + ' занят — запустите с другим номером, например: node serve-lan.js 8081');
  else if (e.code === 'EPERM' || e.code === 'EACCES') console.error('Нет разрешения открыть порт ' + port + ' (сеть ограничена sandbox-политикой).');
  else console.error('Ошибка сервера: ' + e.message);
  process.exit(1);
});

server.listen(port, '0.0.0.0', function(){
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(function(list){
    (list || []).forEach(function(i){
      if (i && i.family === 'IPv4' && !i.internal) ips.push(i.address);
    });
  });
  console.log('Калькулятор чиабатты раздаётся из: ' + root);
  console.log('Откройте на телефоне в той же сети Wi-Fi:');
  if (ips.length) ips.forEach(function(ip){ console.log('   http://' + ip + ':' + port + '/ciabatta.html'); });
  else console.log('   сетевой адрес не найден — проверьте подключение к Wi-Fi');
  console.log('Остановить: Ctrl+C');
});

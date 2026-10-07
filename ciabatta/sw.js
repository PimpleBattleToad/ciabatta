/* Офлайн-кэш калькулятора чиабатты.
   Меняйте версию при правках файлов — тогда обновится у всех, кто уже установил. */
var CACHE = 'ciabatta-v4';

var ASSETS = [
  './',
  './index.html',
  './ciabatta.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      // каждый файл отдельно: если чего-то нет — установка всё равно пройдёт
      .then(function(c){
        return Promise.all(ASSETS.map(function(url){
          return c.add(url).catch(function(){});
        }));
      })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== CACHE; })
                               .map(function(k){ return caches.delete(k); }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  try { if (new URL(req.url).origin !== self.location.origin) return; } catch (err) { return; }

  var accept = req.headers.get('accept') || '';
  var isPage = req.mode === 'navigate' || accept.indexOf('text/html') !== -1;

  if (isPage){
    // страница: сначала сеть (чтобы правки были свежими), офлайн — из кэша
    e.respondWith(
      fetch(req)
        .then(function(res){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
          return res;
        })
        .catch(function(){
          return caches.match(req).then(function(m){
            return m || caches.match('./ciabatta.html');
          });
        })
    );
    return;
  }

  // иконки, манифест: сначала кэш
  e.respondWith(
    caches.match(req).then(function(m){
      if (m) return m;
      return fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        return res;
      });
    })
  );
});

/* Офлайн-первый кэш.
   Страница всегда отдаётся из памяти телефона — приложение открывается мгновенно
   и работает без интернета и без VPN. Сеть нужна только чтобы забрать обновление:
   оно скачивается в фоне и применяется по кнопке «Обновить». */
var CACHE  = "dengi-salona-v10";
var ASSETS = ["./", "./index.html", "./manifest.webmanifest",
              "./icon-180.png", "./icon-192.png", "./icon-512.png",
              "./icon-512-maskable.png", "./favicon.png"];

function tell(msg){
  return self.clients.matchAll({includeUncontrolled:true}).then(function(cs){
    cs.forEach(function(c){ c.postMessage(msg); });
  });
}

self.addEventListener("install", function(e){
  // Каждый файл кладём отдельно: один недокачанный не срывает установку на слабой связи.
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ASSETS.map(function(u){
      return c.add(new Request(u, {cache:"reload"})).catch(function(){});
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; })
                           .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* Тихо освежаем файл в кэше. Если поменялась сама страница — говорим приложению. */
function refresh(request, cached, notify){
  return fetch(new Request(request.url, {cache:"reload"})).then(function(res){
    if(!res || !res.ok) throw 0;
    var copy = res.clone();
    return caches.open(CACHE).then(function(c){
      if(!notify) return c.put(request, copy);
      return res.text().then(function(fresh){
        return (cached ? cached.clone().text() : Promise.resolve("")).then(function(old){
          return c.put(request, copy).then(function(){
            return tell({type: fresh !== old ? "update-ready" : "up-to-date"});
          });
        });
      });
    });
  }).catch(function(){ if(notify) return tell({type:"offline"}); });
}

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.origin !== self.location.origin) return;

  // Любой переход по адресу — это наша единственная страница.
  // Отдаём её из памяти сразу, а в фоне смотрим, не вышло ли обновление.
  if(req.mode === "navigate"){
    e.respondWith(caches.match("./index.html").then(function(cached){
      return cached || fetch(req).catch(function(){ return caches.match("./"); });
    }));
    e.waitUntil(caches.match("./index.html").then(function(cached){
      if(cached) return refresh(new Request("./index.html"), cached, true);
    }));
    return;
  }

  // Иконки и манифест меняются только вместе с версией кэша — берём из памяти.
  e.respondWith(caches.match(req).then(function(cached){
    if(cached) return cached;
    return fetch(req).then(function(res){
      if(res && res.ok){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){ return caches.match("./index.html"); });
  }));
});

/* Кнопка «Проверить обновление» из приложения. */
self.addEventListener("message", function(e){
  var d = e.data || {};
  if(d.type !== "check-update") return;
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.match("./index.html").then(function(cached){
      return refresh(new Request("./index.html"), cached, true);
    });
  }));
});

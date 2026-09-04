/* ============================================================
   sw.js — service worker do Contas DK
   Estratégia:
     - App shell em cache (cache-first) para abrir rápido offline.
     - Ao trocar a versão, o cache antigo é limpo.
   ============================================================ */

const VERSAO = 'contasdk-v2';

const ARQUIVOS = [
  './',
  './index.html',
  './css/style.css',
  './js/auth.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// instala e pré-carrega o app shell
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

// remove caches de versões anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

// cache-first com fallback de rede; guarda novas respostas GET
self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  evento.respondWith(
    caches.match(req).then((cacheado) => {
      if (cacheado) return cacheado;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copia = resp.clone();
            caches.open(VERSAO).then((cache) => cache.put(req, copia));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

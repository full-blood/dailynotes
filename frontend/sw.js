// Force la mise à jour immédiate du Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force l'activation immédiate
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Supprime tous les anciens caches
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('🗑️ Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Prend le contrôle immédiatement
    })
  );
});

// Écoute le message pour activer immédiatement
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


// ============================================
// CONFIGURATION DU SERVICE WORKER
// ============================================

const CACHE_NAME = 'daily-notes-v10';
const RUNTIME_CACHE = 'daily-notes-runtime-v10';

// Fichiers à mettre en cache lors de l'installation
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css?v=28',
  '/js/app.js?v=74',
  '/js/db-local.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Font Awesome (CDN)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ============================================
// ÉVÉNEMENT : INSTALL
// S'exécute une seule fois lors de l'installation du SW
// ============================================

self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker : Installation...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Mise en cache des ressources statiques...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ Service Worker installé avec succès');
        // Force l'activation immédiate
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Erreur lors de l\'installation:', error);
      })
  );
});

// ============================================
// ÉVÉNEMENT : ACTIVATE
// S'exécute après l'installation, nettoie les anciens caches
// ============================================

self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker : Activation...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Supprimer les anciens caches
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Garder uniquement les caches de cette version
              return name !== CACHE_NAME && name !== RUNTIME_CACHE;
            })
            .map((name) => {
              console.log('🗑️ Suppression ancien cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker activé');
        // Prendre le contrôle immédiatement
        return self.clients.claim();
      })
  );
});

// ============================================
// ÉVÉNEMENT : FETCH
// Intercepte TOUTES les requêtes HTTP
// ============================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ========================================
  // STRATÉGIE 1 : Fichiers statiques
  // Cache-First (rapide)
  // ========================================
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log('📦 Cache hit:', url.pathname);
            return cachedResponse;
          }

          // Pas en cache : aller chercher sur le réseau
          console.log('🌐 Cache miss, fetch:', url.pathname);
          return fetch(request)
            .then((response) => {
              // Mettre en cache pour la prochaine fois
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseClone);
                });
              }
              return response;
            });
        })
        .catch(() => {
          // Erreur réseau ET pas de cache : page offline
          console.error('❌ Ressource introuvable:', url.pathname);
          return new Response('Ressource non disponible', {
            status: 404,
            statusText: 'Not Found'
          });
        })
    );
    return;
  }

  // ========================================
  // STRATÉGIE 2 : API calls (/api/*)
  // Network-First (données fraîches prioritaires)
  // ========================================
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Sauvegarder la réponse dans le cache runtime
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Réseau échoue : essayer le cache
          console.log('🌐 Réseau échoué, tentative cache pour:', url.pathname);
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                console.log('📦 Données API depuis le cache');
                return cachedResponse;
              }
              // Pas de cache : erreur
              return new Response(
                JSON.stringify({ error: 'No network and no cache' }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
    return;
  }

  // ========================================
  // STRATÉGIE 3 : Autres ressources
  // Network-First avec fallback cache
  // ========================================
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Mettre en cache si succès
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback sur le cache
        return caches.match(request);
      })
  );
});

// ============================================
// ÉVÉNEMENT : MESSAGE
// Permet la communication avec l'app
// ============================================

self.addEventListener('message', (event) => {
  console.log('📬 Message reçu dans le SW:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      }).then(() => {
        console.log('🗑️ Tous les caches supprimés');
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});

// ============================================
// GESTION DES ERREURS
// ============================================

self.addEventListener('error', (event) => {
  console.error('❌ Erreur Service Worker:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Promise rejetée dans SW:', event.reason);
});

console.log('👷 Service Worker chargé et en attente...');

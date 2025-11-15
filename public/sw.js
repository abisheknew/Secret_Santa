self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { clients.claim(); });
self.addEventListener('fetch', event => { /* noop: simple offline + cache could be added */ });

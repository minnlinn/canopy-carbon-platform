'use strict';

(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  const offerUpdate = worker => {
    if (document.querySelector('.pwa-update')) return;
    const notice = document.createElement('aside');
    notice.className = 'pwa-update';
    notice.setAttribute('aria-live', 'polite');
    Object.assign(notice.style, {
      position: 'fixed',
      zIndex: '10000',
      right: '16px',
      bottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      maxWidth: 'calc(100vw - 32px)',
      padding: '14px 16px',
      border: '1px solid #cad7ce',
      borderRadius: '8px',
      background: '#fff',
      color: '#173b2e',
      boxShadow: '0 8px 28px rgba(17,56,42,.16)',
      font: '600 14px/1.4 sans-serif'
    });
    const message = document.createElement('span');
    message.textContent = 'A new Canopy version is ready.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Update';
    Object.assign(button.style, {
      border: '0',
      borderRadius: '5px',
      padding: '9px 13px',
      background: '#1b513d',
      color: '#fff',
      font: 'inherit',
      cursor: 'pointer'
    });
    button.addEventListener('click', () => worker.postMessage({ type: 'SKIP_WAITING' }));
    notice.append(message, button);
    document.body.append(notice);
  };

  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(installing);
      });
    });
  }).catch(error => console.error('Canopy service worker registration failed:', error));
})();
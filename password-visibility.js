'use strict';

const hiddenPasswordIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><path d="m3 3 18 18"/></svg>';
const visiblePasswordIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';

function setPasswordVisibility(input, visible) {
  const toggle = input.closest('.password-field')?.querySelector('.password-toggle');
  input.type = visible ? 'text' : 'password';
  if (!toggle) return;
  toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.innerHTML = visible ? visiblePasswordIcon : hiddenPasswordIcon;
}

function initializePasswordInput(input) {
  if (input.dataset.passwordVisibilityInitialized === 'true') return;
  input.dataset.passwordVisibilityInitialized = 'true';
  input.type = 'password';

  const wrapper = document.createElement('span');
  wrapper.className = 'password-field';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);

  const toggle = document.createElement('button');
  toggle.className = 'password-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.innerHTML = hiddenPasswordIcon;
  wrapper.append(toggle);

  toggle.addEventListener('click', () => setPasswordVisibility(input, input.type === 'password'));
}

function resetPasswordVisibility() {
  document.querySelectorAll('input[data-password-visibility-initialized="true"]').forEach(input => {
    setPasswordVisibility(input, false);
  });
}

document.querySelectorAll('input[type="password"], input[data-password-visibility-initialized="true"]')
  .forEach(initializePasswordInput);

new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(node => {
    if (!(node instanceof Element)) return;
    if (node.matches('input[type="password"]')) initializePasswordInput(node);
    node.querySelectorAll('input[type="password"]').forEach(initializePasswordInput);
  }));
}).observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('click', event => {
  if (event.target.closest?.('[data-auth-tab]')) resetPasswordVisibility();
}, true);
document.addEventListener('submit', resetPasswordVisibility, true);
document.addEventListener('reset', resetPasswordVisibility, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetPasswordVisibility();
});
window.addEventListener('pagehide', resetPasswordVisibility);
window.addEventListener('pageshow', resetPasswordVisibility);

'use strict';

(() => {
  const requestPanel = document.querySelector('#requestPanel');
  const changePanel = document.querySelector('#changePanel');
  const successPanel = document.querySelector('#successPanel');
  const message = document.querySelector('#resetMessage');
  const requestButton = document.querySelector('#requestButton');
  const saveButton = document.querySelector('#savePasswordButton');
  const config = window.CANOPY_CONFIG || {};
  const configured = config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient;
  const requestedRedirect = 'https://canopy-carbon-platform.vercel.app/reset-password.html';
  const url = new URL(location.href);
  const callbackParams = new URLSearchParams(url.hash.slice(1));
  url.searchParams.forEach((value, key) => callbackParams.set(key, value));

  let supabase = null;
  let recoverySession = null;
  let passwordWasUpdated = false;

  function showMessage(text, kind = 'error') {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function showExpired(text) {
    recoverySession = null;
    changePanel.hidden = true;
    successPanel.hidden = true;
    requestPanel.hidden = false;
    showMessage(text || 'This reset link is invalid, expired, or already used. Request a new link below.');
  }

  function clearRecoveryUrl() {
    const cleanUrl = new URL(location.href);
    ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'token_hash', 'error', 'error_description', 'error_code', 'code'].forEach(key => cleanUrl.searchParams.delete(key));
    cleanUrl.hash = '';
    history.replaceState(history.state, '', cleanUrl);
  }

  function showPasswordForm(session) {
    if (!session?.access_token || !session?.refresh_token || !session.user?.id) return;
    recoverySession = session;
    requestPanel.hidden = true;
    successPanel.hidden = true;
    changePanel.hidden = false;
    showMessage('Recovery link verified. Choose a new password.', 'success');
  }

  if (!configured) {
    requestButton.disabled = true;
    showMessage('Password recovery is unavailable because Supabase is not configured on this deployment.');
    return;
  }

  supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const callbackError = callbackParams.get('error_description') || callbackParams.get('error');
  if (callbackError) {
    showExpired('This reset link is invalid, expired, or already used. Request a new link below.');
    supabase.auth.initialize().then(clearRecoveryUrl, clearRecoveryUrl);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && !callbackError) {
      showPasswordForm(session);
      clearRecoveryUrl();
    }
    if (event === 'SIGNED_OUT' && !passwordWasUpdated && !callbackError) {
      recoverySession = null;
    }
  });

  const tokenHash = callbackParams.get('token_hash');
  if (tokenHash) {
    if (callbackParams.get('type') !== 'recovery') {
      showExpired();
      supabase.auth.initialize().then(clearRecoveryUrl, clearRecoveryUrl);
    } else {
      requestPanel.hidden = true;
      showMessage('Verifying your secure reset link…', 'success');
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error || !recoverySession) showExpired();
        clearRecoveryUrl();
      }).catch(() => {
        showExpired();
        clearRecoveryUrl();
      });
    }
  }

  document.querySelector('#resetRequestForm').addEventListener('submit', async event => {
    event.preventDefault();
    requestButton.disabled = true;
    showMessage('Sending reset instructions…', 'success');
    try {
      const email = new FormData(event.currentTarget).get('email').trim();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: requestedRedirect });
      if (error) throw error;
      event.currentTarget.reset();
      showMessage('If an account exists for that email, password-reset instructions have been sent.', 'success');
    } catch (error) {
      const detail = error.message === 'Failed to fetch'
        ? 'Cannot reach the configured Supabase Auth server. Check the Supabase project URL and network connection, then retry.'
        : error.message || 'Could not send the reset email. Please try again.';
      showMessage(detail);
    } finally {
      requestButton.disabled = false;
    }
  });

  document.querySelector('#newPasswordForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!recoverySession?.access_token || !recoverySession?.refresh_token) {
      showExpired();
      return;
    }

    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    if (password !== form.get('confirmPassword')) {
      showMessage('The passwords do not match.');
      return;
    }
    if (password.length < 8) {
      showMessage('Use a password with at least 8 characters.');
      return;
    }

    saveButton.disabled = true;
    showMessage('Updating your password…', 'success');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || session.user.id !== recoverySession.user.id) {
        showExpired();
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      passwordWasUpdated = true;
      recoverySession = null;
      await supabase.auth.signOut({ scope: 'local' });
      changePanel.hidden = true;
      requestPanel.hidden = true;
      successPanel.hidden = false;
      showMessage('Your password is ready to use.', 'success');
    } catch (error) {
      const detail = error.message === 'Failed to fetch'
        ? 'Cannot reach the configured Supabase Auth server. Check the Supabase project URL and network connection, then retry.'
        : error.message || 'Could not update your password. Request a fresh reset link and try again.';
      showMessage(detail);
    } finally {
      saveButton.disabled = false;
    }
  });
})();
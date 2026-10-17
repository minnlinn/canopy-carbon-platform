'use strict';

(() => {
  const button = document.querySelector('#backToDashboard');
  const message = document.querySelector('#dashboardNavigationStatus');
  const home = new URL('./index.html', location.href).href;
  const config = window.CANOPY_CONFIG || {};

  function showMessage(text) {
    if (message) {
      message.textContent = text;
      message.hidden = !text;
    }
  }

  button?.addEventListener('click', async event => {
    event.preventDefault();
    button.setAttribute('aria-busy', 'true');
    showMessage('Checking your Canopy account…');

    const configured = config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient;
    if (!configured) {
      location.assign(home);
      return;
    }

    try {
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        location.assign(home);
        return;
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const user = userData.user;
      if (!user || user.id !== sessionData.session.user.id) {
        location.assign(home);
        return;
      }

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id,role')
        .eq('id', user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile || profile.id !== user.id || !['admin', 'sme', 'partner'].includes(String(profile.role || '').trim().toLowerCase())) {
        throw new Error('Your Canopy dashboard role could not be verified. Please contact an administrator.');
      }

      showMessage(`Opening your ${profile.role.toLowerCase()} dashboard…`);
      location.assign(home);
    } catch (error) {
      console.error('Could not verify Canopy dashboard access:', error);
      showMessage(error.message || 'Could not verify your account. Please try again.');
      button.removeAttribute('aria-busy');
    }
  });
})();

// Hosted servers (with a database) require an account; a local backend answers 503 and skips this.
(() => {
  const dialog = document.getElementById('account-dialog');
  const form = document.getElementById('account-form');
  const status = document.getElementById('account-status');

  async function check() {
    try {
      const response = await apiFetch(`${API_BASE}/api/me`);
      if (response.status === 401) dialog.showModal();
    } catch { /* Backend offline: the workspace already reports it. */ }
  }

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = event.submitter?.value === 'register' ? 'register' : 'login';
    status.textContent = mode === 'register' ? 'Creating your account…' : 'Signing in…';
    try {
      const response = await fetch(`${API_BASE}/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.value, password: form.password.value }),
      });
      const { token } = await readResponse(response);
      localStorage.setItem(TOKEN_KEY, token);
      form.reset();
      status.textContent = '';
      dialog.close();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  check();
})();

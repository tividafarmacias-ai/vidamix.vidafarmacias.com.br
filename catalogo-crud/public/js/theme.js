(() => {
  const storageKey = 'vidamix-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  let preference = null;
  let button;

  function readPreference() {
    try {
      const value = window.localStorage.getItem(storageKey);
      preference = value === 'dark' || value === 'light' ? value : null;
    } catch { /* Keep the current choice when storage is unavailable. */ }
  }

  function apply() {
    const dark = (preference || (system.matches ? 'dark' : 'light')) === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101923' : '#f5f8fc');
    if (button) {
      const label = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(dark));
    }
  }

  // Run in the head, before styles and page content, to avoid a light flash.
  readPreference();
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    readPreference();
    apply();
  });
  window.addEventListener('pageshow', () => { readPreference(); apply(); });

  function mount() {
    const host = document.querySelector('.stories-header-actions')
      || document.querySelector('.site-header-inner') || document.body;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-theme-toggle';
    button.innerHTML = `<svg class="theme-icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.7 13.1A8.7 8.7 0 0 1 10.9 3.3 8.8 8.8 0 1 0 20.7 13.1Z"/></svg><svg class="theme-icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>`;
    button.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem(storageKey, preference); } catch { /* Theme still works in memory. */ }
      apply();
    });
    apply();
    host.append(button);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();

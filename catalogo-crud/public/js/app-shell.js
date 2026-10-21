import { sessionReady, logout } from './auth-session.js';

const indoorDestination = { screen: 'indoor', href: '/artes/indoor-h', label: 'TV Indoor', icon: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8m-4-4v4m-2-14 6 4-6 4z"/>' };
const destinations = [
  { screen: 'home', href: '/', label: 'Início', icon: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>' },
  { screen: 'catalogue', href: '/catalogo', label: 'Catálogo', icon: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>' },
  { screen: 'stories', href: '/artes/stories', label: 'Stories', icon: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-5 7h6m-3-3v6m-1 4h2"/>' },
  { screen: 'feed', href: '/artes/feed', label: 'Feed', icon: '<rect x="3" y="2" width="18" height="20" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>' },
  { screen: 'revista', href: '/revista', label: 'Revista', icon: '<path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>' },
];

const headerDestinations = [
  { screen: 'home', href: '/', label: 'Central' },
  ...destinations.filter(({ screen }) => screen === 'catalogue' || screen === 'revista'),
  { screen: 'backgrounds', href: '/backgrounds', label: 'Backgrounds' },
  ...destinations.filter(({ screen }) => screen === 'stories' || screen === 'feed'),
  indoorDestination,
];

export function getHeaderDestinations(role) {
  if (role === 'admin') return headerDestinations;
  if (role === 'cliente') return headerDestinations.filter(({ screen }) => ['home', 'catalogue', 'stories', 'feed', 'indoor'].includes(screen));
  return [];
}

export function getAppScreen(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return ({
    '/': 'home', '/index.html': 'home',
    '/catalogo': 'catalogue', '/catalogo.html': 'catalogue',
    '/revista': 'revista', '/revista.html': 'revista',
    '/backgrounds': 'backgrounds', '/backgrounds.html': 'backgrounds',
    '/artes/stories': 'stories', '/stories.html': 'stories',
    '/artes/feed': 'feed', '/feed.html': 'feed',
    '/artes/indoor-h': 'indoor', '/indoor-h.html': 'indoor',
  })[path] || null;
}

export function initAppHeader(win, doc, screen, session = null) {
  const header = doc.querySelector('[data-app-header]');
  if (!header || header.dataset.initialized) return;
  header.dataset.initialized = 'true';
  const inner = header.querySelector('.site-header-inner');
  const name = doc.createElement('span');
  name.className = 'app-screen-name';
  name.textContent = screen === 'offline' ? 'Sem conexão'
    : headerDestinations.find((destination) => destination.screen === screen)?.label || 'VidaMix Studio';
  inner.append(name);

  const nav = doc.createElement('nav');
  nav.id = 'site-navigation';
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Navegação principal');
  const brand = header.querySelector('.site-brand');
  if (brand) {
    brand.href = session ? '/' : '/login';
    brand.setAttribute('aria-label', 'VidaMix Studio');
  }
  for (const destination of getHeaderDestinations(session?.user.role)) {
    const link = doc.createElement('a');
    link.href = destination.href;
    link.textContent = destination.label;
    if (destination.screen === screen) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  if (session) {
    const account = doc.createElement('span');
    account.className = 'site-account';
    account.textContent = `${session.user.name || 'Minha conta'} · ${session.user.role === 'admin' ? 'Administrador' : 'Cliente'}`;
    account.title = account.textContent;
    const exit = doc.createElement('button');
    exit.type = 'button';
    exit.className = 'site-logout';
    exit.textContent = 'Sair';
    exit.addEventListener('click', async () => {
      exit.disabled = true;
      exit.textContent = 'Saindo…';
      try { await logout(); }
      catch (error) {
        exit.disabled = false;
        exit.textContent = 'Tentar sair novamente';
        account.textContent = error.message;
        account.setAttribute('role', 'alert');
      }
    });
    nav.append(account);
    inner.append(exit);
  } else {
    const login = doc.createElement('a');
    login.href = '/login';
    login.textContent = 'Entrar';
    nav.append(login);
  }

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'site-menu-toggle';
  toggle.setAttribute('aria-controls', nav.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  inner.append(toggle, nav);

  const compact = win.matchMedia('(max-width: 1100px)');
  const setOpen = (open) => {
    const expanded = compact.matches && open;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
    nav.hidden = compact.matches && !expanded;
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    toggle.focus();
  });
  doc.addEventListener('click', (event) => {
    if (!header.contains(event.target) || nav.contains(event.target)) setOpen(false);
  });
  doc.addEventListener('focusin', (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });
  compact.addEventListener('change', () => setOpen(false));
  win.addEventListener('pageshow', () => setOpen(false));
  setOpen(false);
}

export function hasSoftwareKeyboard({ editable, layoutHeight, visibleHeight, scale = 1 }) {
  // Safari can pan the visual viewport while the keyboard remains open. Panning
  // changes offsetTop, but does not reduce how much height the keyboard occupies.
  return Boolean(editable && Math.abs(scale - 1) < 0.05
    && layoutHeight - visibleHeight > Math.max(120, layoutHeight * 0.18));
}

export function initNavigationFeedback(win, doc) {
  let indicator;
  let timer;
  const hide = () => {
    if (indicator) indicator.hidden = true;
    win.clearTimeout(timer);
  };
  const show = () => {
    if (!indicator) {
      indicator = doc.createElement('div');
      indicator.className = 'app-navigation-loading';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-live', 'polite');
      indicator.innerHTML = '<span class="app-navigation-progress" aria-hidden="true"></span><span class="app-navigation-message">Carregando tela…</span>';
      doc.body.append(indicator);
    }
    indicator.hidden = false;
    win.clearTimeout(timer);
    // A canceled unload prompt or a failed navigation must not leave stale UI.
    timer = win.setTimeout(hide, 15000);
  };
  doc.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const destination = new URL(link.href, win.location.href);
    if (destination.origin !== win.location.origin || !getAppScreen(destination.pathname)) return;
    if (destination.pathname === win.location.pathname && destination.search === win.location.search) return;
    // Allow other click handlers (including editor guards) to cancel navigation.
    Promise.resolve().then(() => { if (!event.defaultPrevented) show(); });
  });
  win.addEventListener('pageshow', hide);
  win.addEventListener('pagehide', hide);
  win.addEventListener('load', hide);
  if (doc.readyState === 'interactive' || doc.readyState === 'loading') show();
}

export function initAppShell(win = window, doc = document, options = {}) {
  const root = doc.documentElement;
  const screen = doc.body.classList.contains('offline-page') ? 'offline' : getAppScreen(win.location.pathname);
  const standalone = win.matchMedia('(display-mode: standalone)');
  const mobile = win.matchMedia('(max-width: 900px)');
  const updateDisplayMode = () => root.classList.toggle('is-standalone', standalone.matches || win.navigator.standalone === true);
  updateDisplayMode();
  standalone.addEventListener('change', updateDisplayMode);
  root.dataset.appScreen = screen || '';
  const ready = screen === 'offline' ? Promise.resolve(null) : Object.hasOwn(options, 'session') ? Promise.resolve(options.session) : sessionReady;
  const navigationReady = ready.then((session) => {
    doc.body.classList.toggle('is-admin', session?.user?.role === 'admin');
    initAppHeader(win, doc, screen, session);
    if (!session && screen !== 'offline') {
      const message = doc.createElement('section');
      message.className = 'app-session-error';
      message.setAttribute('role', 'alert');
      const text = doc.createElement('p');
      text.textContent = 'Não foi possível verificar seu acesso. Entre novamente ou recarregue a página.';
      const login = doc.createElement('a');
      login.href = '/login';
      login.textContent = 'Ir para o login';
      message.append(text, login);
      doc.body.append(message);
      return;
    }
    // Browsing screens share destinations. Editors keep their own step navigation.
    if (session && ['home', 'catalogue', 'revista'].includes(screen)) {
      const nav = doc.createElement('nav');
      nav.className = 'app-tabbar';
      nav.setAttribute('aria-label', 'Navegação do aplicativo');
      const tabs = session.user.role === 'admin' ? destinations : [...destinations.filter(({ screen: key }) => ['home', 'catalogue', 'stories', 'feed'].includes(key)), indoorDestination];
      nav.style.setProperty('--app-tab-count', tabs.length);
      for (const destination of tabs) {
        const link = doc.createElement('a');
        link.href = destination.href;
        link.innerHTML = `<span class="app-tab-icon"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${destination.icon}</svg></span><span>${destination.label}</span>`;
        if (screen === destination.screen) link.setAttribute('aria-current', 'page');
        nav.append(link);
      }
      doc.body.append(nav);
      doc.body.classList.add('has-app-tabbar');
    }
  });

  let baselineHeight = 0;
  let baselineWidth = 0;
  const updateViewport = () => {
    const viewport = win.visualViewport;
    const layoutHeight = Math.max(win.innerHeight || 0, root.clientHeight || 0);
    const layoutWidth = win.innerWidth || root.clientWidth || 0;
    const visibleHeight = viewport?.height || layoutHeight;
    const offsetTop = viewport?.offsetTop || 0;
    root.style.setProperty('--app-viewport-height', `${Math.round(visibleHeight)}px`);
    root.style.setProperty('--app-viewport-top', `${Math.round(offsetTop)}px`);
    const active = doc.activeElement;
    const editable = Boolean(active && !active.disabled && !active.readOnly && (
      active.isContentEditable || active.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]):not([type="hidden"]):not([type="image"])')
    ));
    // Android may resize both layout and visual viewports. Keep the height from
    // before text entry, and discard it when rotation changes the layout width.
    if (Math.abs(layoutWidth - baselineWidth) > 80) baselineHeight = layoutHeight;
    baselineWidth = layoutWidth;
    if (!editable || !baselineHeight) baselineHeight = Math.max(layoutHeight, visibleHeight);
    root.classList.toggle('app-keyboard-open', mobile.matches && hasSoftwareKeyboard({
      editable, layoutHeight: baselineHeight, visibleHeight, scale: viewport?.scale || 1,
    }));
  };
  updateViewport();
  win.visualViewport?.addEventListener('resize', updateViewport);
  win.visualViewport?.addEventListener('scroll', updateViewport);
  win.addEventListener('resize', updateViewport);
  win.addEventListener('orientationchange', updateViewport);
  win.addEventListener('pageshow', updateViewport);
  doc.addEventListener('focusin', updateViewport);
  doc.addEventListener('focusout', () => win.requestAnimationFrame(updateViewport));
  mobile.addEventListener('change', updateViewport);
  initNavigationFeedback(win, doc);
  return navigationReady;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') initAppShell();

const STEPS = Object.freeze([
  { id: 'background', title: 'Escolha o fundo', next: 'Escolher produtos' },
  { id: 'products', title: 'Monte sua composição', next: 'Definir oferta' },
  { id: 'offer', title: 'Prepare a oferta', next: 'Ajustar arte' },
  { id: 'adjust', title: 'Ajuste a arte', next: 'Exportar story' },
  { id: 'export', title: 'Exporte seu story', next: '' },
]);

function isTextEntry(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT'
    && !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}

/** Shares the existing controls with the mobile workflow, preserving their state and listeners. */
export function initStoriesMobileEditor({
  root = document,
  getProgress = () => ({}),
  onStepChange = () => {},
} = {}) {
  const doc = root.ownerDocument || root;
  const view = doc.defaultView;
  const body = doc.body;
  const find = (selector) => root.querySelector(selector);
  const sheet = find('#story-mobile-sheet');
  const nav = find('#story-mobile-nav');
  const panelsScrollport = find('.story-mobile-panels');
  if (!view?.matchMedia || !body || !sheet || !nav) {
    return { sync() {}, showStep() {}, destroy() {} };
  }

  const media = view.matchMedia('(max-width: 900px)');
  const panels = new Map(STEPS.map(({ id }) => [id, find(`#story-mobile-panel-${id}`)]));
  const tabs = new Map(STEPS.map(({ id }) => [id, nav.querySelector(`[data-mobile-step="${id}"]`)]));
  const title = find('#story-mobile-step-title');
  const count = find('#story-mobile-step-count');
  const next = find('#story-mobile-next');
  const back = find('#story-mobile-back');
  const previewToggle = find('#story-mobile-preview-toggle');
  const previewEdit = find('#story-mobile-preview-edit');
  const done = find('#story-mobile-done');
  const status = find('#story-mobile-status');
  const sourceStatus = find('#story-status');
  const originalLocations = new Map();
  const cleanup = [];
  let step = 'background';
  let mobile = false;
  let expanded = false;
  let destroyed = false;
  let frame = null;
  let baselineHeight = 0;
  let baselineWidth = 0;
  let beforeTour = null;

  function listen(target, type, listener, options) {
    target?.addEventListener(type, listener, options);
    cleanup.push(() => target?.removeEventListener(type, listener, options));
  }

  function setExpanded(value) {
    expanded = Boolean(mobile && value);
    if (expanded && sheet.contains(doc.activeElement) && isTextEntry(doc.activeElement)) doc.activeElement.blur();
    body.classList.toggle('story-mobile-preview-expanded', expanded);
    sheet.hidden = !mobile || expanded;
    nav.hidden = !mobile;
    previewToggle?.setAttribute('aria-pressed', String(expanded));
    previewToggle?.setAttribute('aria-label', expanded ? 'Voltar aos controles' : 'Ampliar prévia da arte');
    if (previewToggle) previewToggle.textContent = expanded ? 'Voltar aos controles' : 'Ampliar prévia';
  }

  function updateViewport() {
    frame = null;
    if (!mobile || destroyed) return;
    const viewport = view.visualViewport;
    const layoutHeight = Math.max(view.innerHeight || 0, doc.documentElement?.clientHeight || 0);
    const layoutWidth = view.innerWidth || doc.documentElement?.clientWidth || 0;
    const viewportHeight = viewport?.height || view.innerHeight || layoutHeight;
    const editing = isTextEntry(doc.activeElement);
    if (Math.abs(layoutWidth - baselineWidth) > 80) baselineHeight = layoutHeight;
    baselineWidth = layoutWidth;
    // Retain the unoccluded height on browsers which resize innerHeight for the keyboard.
    if (!editing || !baselineHeight) baselineHeight = Math.max(layoutHeight, viewportHeight);
    const keyboardOpen = editing
      && (!viewport || Math.abs((viewport.scale || 1) - 1) < 0.05)
      && baselineHeight - viewportHeight > Math.max(120, baselineHeight * 0.18);
    body.style.setProperty('--story-viewport-height', `${Math.round(viewportHeight)}px`);
    body.style.setProperty('--story-viewport-top', `${Math.max(0, Math.round(viewport?.offsetTop || 0))}px`);
    body.classList.toggle('story-mobile-keyboard-open', keyboardOpen);
    if (done) done.hidden = !keyboardOpen;
  }

  function scheduleViewport() {
    if (frame === null && mobile && !destroyed) frame = view.requestAnimationFrame(updateViewport);
  }

  function openCollapsedControls(panel) {
    for (const toggle of panel?.querySelectorAll('.story-section-collapse-toggle[aria-expanded="false"]') || []) {
      toggle.click();
    }
  }

  function sync() {
    if (destroyed) return;
    const progress = getProgress() || {};
    const index = STEPS.findIndex((item) => item.id === step);
    const current = STEPS[index];
    if (title) title.textContent = current.title;
    if (count) count.textContent = `Etapa ${index + 1} de ${STEPS.length}`;
    if (next) {
      next.hidden = step === 'export';
      next.textContent = current.next;
    }
    if (back) back.disabled = index === 0;
    for (const item of STEPS) {
      const tab = tabs.get(item.id);
      const panel = panels.get(item.id);
      const active = item.id === step;
      const complete = item.id === 'adjust' ? Boolean(progress.ready) : Boolean(progress[item.id]);
      if (panel) panel.hidden = !mobile || !active;
      if (!tab) continue;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('is-active', active);
      tab.classList.toggle('is-complete', complete);
      tab.classList.toggle('is-ready', item.id === 'export' && Boolean(progress.ready));
      tab.setAttribute('aria-label', `${item.title}${complete ? ', concluída' : ''}`);
    }
    nav.setAttribute('aria-busy', String(Boolean(progress.exporting)));
    if (status && sourceStatus) {
      // Avoid repeatedly replacing a live region when animation or dragging calls sync.
      if (status.textContent !== sourceStatus.textContent) status.textContent = sourceStatus.textContent;
      status.classList.toggle('is-error', sourceStatus.classList.contains('is-error'));
    }
    if (mobile) body.dataset.mobileStep = step;
  }

  function showStep(value, { focus = false, openControls = true } = {}) {
    if (destroyed || !panels.has(value) || !mobile) return false;
    if (sheet.contains(doc.activeElement)
      && !panels.get(value)?.contains(doc.activeElement)
      && isTextEntry(doc.activeElement)) doc.activeElement.blur();
    const changed = step !== value;
    step = value;
    setExpanded(false);
    sync();
    const panel = panels.get(step);
    if (openControls) openCollapsedControls(panel);
    if (changed) {
      if (panel) panel.scrollTop = 0;
      if (panelsScrollport) panelsScrollport.scrollTop = 0;
    }
    if (focus) panel?.focus({ preventScroll: true });
    onStepChange(step);
    scheduleViewport();
    return true;
  }

  function moveControls() {
    for (const control of root.querySelectorAll('[data-mobile-group]')) {
      const panel = panels.get(control.dataset.mobileGroup);
      if (!panel || originalLocations.has(control)) continue;
      const placeholder = doc.createComment(`story-mobile:${control.dataset.mobileGroup}`);
      control.parentNode.insertBefore(placeholder, control);
      originalLocations.set(control, placeholder);
      panel.append(control);
    }
  }

  function restoreControls() {
    for (const [control, placeholder] of originalLocations) {
      if (placeholder.parentNode) placeholder.parentNode.replaceChild(control, placeholder);
    }
    originalLocations.clear();
  }

  function setMobile(value) {
    if (destroyed || mobile === value) return;
    const focused = doc.activeElement;
    const focusedControl = [...originalLocations.keys()].some((control) => control.contains(focused));
    const focusedMobileControl = !focusedControl && (
      nav.contains(focused) || sheet.contains(focused) || focused?.closest?.('.story-mobile-only')
    );
    mobile = value;
    body.classList.toggle('is-mobile-editor', mobile);
    if (mobile) {
      baselineHeight = Math.max(view.innerHeight || 0, doc.documentElement?.clientHeight || 0);
      baselineWidth = view.innerWidth || 0;
      moveControls();
      // A desktop field remains visible if the window is resized while it has focus.
      const focusedGroup = focused?.closest?.('[data-mobile-group]')?.dataset.mobileGroup;
      if (panels.has(focusedGroup)) step = focusedGroup;
      setExpanded(false);
      sync();
      openCollapsedControls(panels.get(step));
      updateViewport();
      onStepChange(step);
      if (focusedGroup) focused.focus({ preventScroll: true });
    } else {
      restoreControls();
      setExpanded(false);
      delete body.dataset.mobileStep;
      body.classList.remove('story-mobile-keyboard-open');
      body.style.removeProperty('--story-viewport-height');
      body.style.removeProperty('--story-viewport-top');
      if (done) done.hidden = true;
      sync();
      onStepChange(step);
      if (focusedControl) focused.focus({ preventScroll: true });
      else if (focusedMobileControl) {
        const desktopFocus = [find('.stories-back-link'), find('#story-product-selection')]
          .find((element) => element && !element.hidden && !element.disabled);
        desktopFocus?.focus({ preventScroll: true });
      }
    }
  }

  if (!nav.querySelector('[role="tablist"]')) nav.setAttribute('role', 'tablist');
  for (const { id } of STEPS) {
    const tab = tabs.get(id);
    const panel = panels.get(id);
    if (!tab || !panel) continue;
    tab.id ||= `story-mobile-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = -1;
    listen(tab, 'click', () => showStep(id));
    listen(tab, 'keydown', (event) => {
      const index = STEPS.findIndex((item) => item.id === id);
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % STEPS.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + STEPS.length) % STEPS.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = STEPS.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      showStep(STEPS[target].id);
      tabs.get(STEPS[target].id)?.focus({ preventScroll: true });
    });
  }
  listen(next, 'click', () => {
    const index = STEPS.findIndex((item) => item.id === step);
    if (index < STEPS.length - 1) showStep(STEPS[index + 1].id, { focus: true });
  });
  listen(back, 'click', () => {
    const index = STEPS.findIndex((item) => item.id === step);
    if (index > 0) showStep(STEPS[index - 1].id, { focus: true });
  });
  listen(previewToggle, 'click', () => setExpanded(!expanded));
  listen(previewEdit, 'click', () => showStep('adjust', { focus: true }));
  listen(done, 'click', () => {
    if (isTextEntry(doc.activeElement)) doc.activeElement.blur();
    // Pointer activation can already have moved focus from the edited field to this button.
    done.blur();
    scheduleViewport();
  });
  listen(doc, 'keydown', (event) => {
    if (mobile && expanded && event.key === 'Escape') {
      event.preventDefault();
      setExpanded(false);
      previewToggle?.focus({ preventScroll: true });
    }
  });
  listen(doc, 'story:reveal-target', (event) => {
    if (!mobile) return;
    beforeTour ||= { step, expanded };
    const target = event.detail?.target;
    const group = target?.closest?.('[data-mobile-group]');
    if (group) showStep(group.dataset.mobileGroup);
    else if (mobile) setExpanded(false);
  });
  listen(doc, 'story:tour-end', () => {
    if (!beforeTour) return;
    const previous = beforeTour;
    beforeTour = null;
    showStep(previous.step, { openControls: false });
    setExpanded(previous.expanded);
  });
  listen(doc, 'focusin', scheduleViewport);
  listen(doc, 'focusout', scheduleViewport);
  listen(view, 'resize', scheduleViewport, { passive: true });
  listen(view, 'orientationchange', scheduleViewport, { passive: true });
  listen(view.visualViewport, 'resize', scheduleViewport, { passive: true });
  listen(view.visualViewport, 'scroll', scheduleViewport, { passive: true });
  const handleMediaChange = () => setMobile(media.matches);
  if (media.addEventListener) listen(media, 'change', handleMediaChange);
  else {
    media.addListener(handleMediaChange);
    cleanup.push(() => media.removeListener(handleMediaChange));
  }

  sheet.hidden = true;
  nav.hidden = true;
  sync();
  setMobile(media.matches);
  return {
    sync,
    showStep,
    destroy() {
      if (destroyed) return;
      setMobile(false);
      destroyed = true;
      if (frame !== null) view.cancelAnimationFrame(frame);
      cleanup.forEach((remove) => remove());
    },
  };
}

const eanOverlay = document.querySelector('#ean-scanner-overlay');
const eanOpenButton = document.querySelector('#ean-overlay-open');
const eanCloseButton = document.querySelector('#ean-overlay-close');
const eanForm = document.querySelector('#ean-launcher');
const eanInput = document.querySelector('#ean-input');
const eanStatus = document.querySelector('#ean-status');
const eanFormat = document.querySelector('#ean-format');
const eanSubmit = document.querySelector('#ean-submit');

let scanTimer;
let lastSubmittedEan = '';
let lookupInProgress = false;
let lookupController;

function normalizeEan(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}

function isValidEan(ean) {
  if (![8, 12, 13, 14].includes(ean.length)) return false;

  const digits = [...ean].map(Number);
  const expectedCheckDigit = digits.pop();
  const sum = digits.reduce((total, digit, index) => {
    const multiplier = (digits.length - 1 - index) % 2 === 0 ? 3 : 1;
    return total + (digit * multiplier);
  }, 0);
  return (10 - (sum % 10)) % 10 === expectedCheckDigit;
}

function setEanStatus(message = '', isError = false) {
  if (!eanStatus) return;
  eanStatus.textContent = message;
  eanStatus.classList.toggle('is-error', isError);
}

function closeScanner() {
  clearTimeout(scanTimer);
  lookupController?.abort();
  lookupController = null;
  lookupInProgress = false;
  eanOverlay.close();
  eanOverlay.hidden = true;
  document.body.classList.remove('scanner-open');
  eanOpenButton.focus();
}

function openScanner() {
  lastSubmittedEan = '';
  lookupInProgress = false;
  eanInput.value = '';
  if (eanSubmit) eanSubmit.disabled = false;
  setEanStatus('Digite o código ou use o leitor.');
  eanOverlay.hidden = false;
  eanOverlay.showModal();
  document.body.classList.add('scanner-open');
  requestAnimationFrame(() => {
    if (window.matchMedia('(pointer: coarse)').matches) eanCloseButton.focus();
    else eanInput.focus();
  });
}

async function openArtworkForEan(ean) {
  if (lookupInProgress || ean === lastSubmittedEan) return;
  lookupInProgress = true;
  lastSubmittedEan = ean;
  const controller = new AbortController();
  lookupController = controller;
  if (eanSubmit) eanSubmit.disabled = true;
  const format = eanFormat?.value === 'feed' ? 'feed' : 'stories';
  setEanStatus('Localizando produto…');

  try {
    const response = await fetch(`/api/products/by-ean/${encodeURIComponent(ean)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const product = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(product.error || 'Produto não encontrado para este EAN.');
    if (!controller.signal.aborted && eanOverlay.open) {
      window.location.assign(`/artes/${format}?productId=${encodeURIComponent(String(product.id))}`);
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    lastSubmittedEan = '';
    setEanStatus(error.message || 'Não foi possível localizar o produto.', true);
    eanInput.focus();
  } finally {
    if (lookupController === controller) {
      lookupInProgress = false;
      if (eanSubmit) eanSubmit.disabled = false;
    }
  }
}

function submitEan({ showValidation = true } = {}) {
  const ean = normalizeEan(eanInput.value);
  eanInput.value = ean;
  if (!isValidEan(ean)) {
    if (showValidation) setEanStatus('Código não reconhecido. Tente novamente.', true);
    return;
  }
  openArtworkForEan(ean);
}

if (eanOverlay && eanOpenButton && eanCloseButton && eanForm && eanInput) {
  eanFormat?.addEventListener('change', () => eanInput.focus());
  eanOpenButton.addEventListener('click', openScanner);
  eanCloseButton.addEventListener('click', closeScanner);
  eanOverlay.addEventListener('click', (event) => {
    if (event.target === eanOverlay) closeScanner();
  });
  eanOverlay.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeScanner();
  });
  eanForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitEan();
  });
  eanInput.addEventListener('input', () => {
    clearTimeout(scanTimer);
    lookupController?.abort();
    lookupController = null;
    lookupInProgress = false;
    if (eanSubmit) eanSubmit.disabled = false;
    eanInput.value = normalizeEan(eanInput.value);
    lastSubmittedEan = '';
    setEanStatus('Digite o código ou use o leitor.');
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (!isValidEan(eanInput.value)) return;
    scanTimer = setTimeout(() => submitEan({ showValidation: false }), 120);
  });
}

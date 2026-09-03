const eanOverlay = document.querySelector('#ean-scanner-overlay');
const eanOpenButton = document.querySelector('#ean-overlay-open');
const eanCloseButton = document.querySelector('#ean-overlay-close');
const eanForm = document.querySelector('#ean-launcher');
const eanInput = document.querySelector('#ean-input');
const eanStatus = document.querySelector('#ean-status');

let scanTimer;
let lastSubmittedEan = '';
let lookupInProgress = false;

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
  eanOverlay.hidden = true;
  eanOpenButton.focus();
}

function openScanner() {
  lastSubmittedEan = '';
  lookupInProgress = false;
  eanInput.value = '';
  setEanStatus('Aguardando leitura…');
  eanOverlay.hidden = false;
  requestAnimationFrame(() => eanInput.focus());
}

async function openStoryForEan(ean) {
  if (lookupInProgress || ean === lastSubmittedEan) return;
  lookupInProgress = true;
  lastSubmittedEan = ean;
  setEanStatus('Localizando produto…');

  try {
    const response = await fetch(`/api/products/by-ean/${encodeURIComponent(ean)}`, {
      headers: { Accept: 'application/json' },
    });
    const product = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(product.error || 'Produto não encontrado para este EAN.');
    window.location.assign(`/artes/stories?productId=${encodeURIComponent(String(product.id))}`);
  } catch (error) {
    lastSubmittedEan = '';
    setEanStatus(error.message || 'Não foi possível localizar o produto.', true);
    eanInput.value = '';
    eanInput.focus();
  } finally {
    lookupInProgress = false;
  }
}

function submitEan({ showValidation = true } = {}) {
  const ean = normalizeEan(eanInput.value);
  eanInput.value = ean;
  if (!isValidEan(ean)) {
    if (showValidation) setEanStatus('Código não reconhecido. Tente novamente.', true);
    return;
  }
  openStoryForEan(ean);
}

if (eanOverlay && eanOpenButton && eanCloseButton && eanForm && eanInput) {
  eanOpenButton.addEventListener('click', openScanner);
  eanCloseButton.addEventListener('click', closeScanner);
  eanOverlay.addEventListener('click', (event) => {
    if (event.target === eanOverlay) closeScanner();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !eanOverlay.hidden) closeScanner();
  });
  eanForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitEan();
  });
  eanInput.addEventListener('input', () => {
    clearTimeout(scanTimer);
    eanInput.value = normalizeEan(eanInput.value);
    lastSubmittedEan = '';
    setEanStatus('Aguardando leitura…');
    if (!isValidEan(eanInput.value)) return;
    scanTimer = setTimeout(() => submitEan({ showValidation: false }), 120);
  });
}
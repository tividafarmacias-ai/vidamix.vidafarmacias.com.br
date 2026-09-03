const eanForm = document.querySelector('#ean-launcher');
const eanInput = document.querySelector('#ean-input');
const eanStatus = document.querySelector('#ean-status');
const eanSubmitButton = eanForm?.querySelector('button[type="submit"]');

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

async function openStoryForEan(ean) {
  if (lookupInProgress || ean === lastSubmittedEan) return;
  lookupInProgress = true;
  lastSubmittedEan = ean;
  eanSubmitButton.disabled = true;
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
  } finally {
    lookupInProgress = false;
    if (eanSubmitButton) eanSubmitButton.disabled = false;
  }
}

function submitEan({ showValidation = true } = {}) {
  const ean = normalizeEan(eanInput?.value);
  if (eanInput && eanInput.value !== ean) eanInput.value = ean;

  if (!isValidEan(ean)) {
    if (showValidation) setEanStatus('Informe um EAN válido com dígito verificador.', true);
    return;
  }
  openStoryForEan(ean);
}

if (eanForm && eanInput) {
  eanForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitEan();
  });

  eanInput.addEventListener('input', () => {
    clearTimeout(scanTimer);
    eanInput.value = normalizeEan(eanInput.value);
    lastSubmittedEan = '';
    setEanStatus();
    if (!isValidEan(eanInput.value)) return;
    scanTimer = setTimeout(() => submitEan({ showValidation: false }), 120);
  });
}
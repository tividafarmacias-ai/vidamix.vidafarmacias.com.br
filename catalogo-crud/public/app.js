const state = {
  page: 1,
  pageSize: 48,
  query: '',
  category: '',
  status: '',
  image: 'com',
  pagination: { page: 1, pageSize: 48, total: 0, totalPages: 1 },
  editingId: null,
  categories: [],
  requestId: 0,
};

const numberFormatter = new Intl.NumberFormat('pt-BR');
const formatNumber = (value) => numberFormatter.format(value);

const elements = {
  summaryTotal: document.querySelector('#summary-total'),
  summaryActive: document.querySelector('#summary-active'),
  summaryImages: document.querySelector('#summary-images'),
  search: document.querySelector('#search-input'),
  category: document.querySelector('#category-filter'),
  categoryChips: document.querySelector('#category-chips'),
  status: document.querySelector('#status-filter'),
  image: document.querySelector('#image-filter'),
  categoryOptions: document.querySelector('#category-options'),
  grid: document.querySelector('#product-grid'),
  empty: document.querySelector('#empty-state'),
  resultsKicker: document.querySelector('#results-kicker'),
  resultsTitle: document.querySelector('#results-title'),
  previousPage: document.querySelector('#previous-page-button'),
  nextPage: document.querySelector('#next-page-button'),
  pageIndicator: document.querySelector('#page-indicator'),
  dialog: document.querySelector('#product-dialog'),
  form: document.querySelector('#product-form'),
  dialogKicker: document.querySelector('#dialog-kicker'),
  dialogTitle: document.querySelector('#dialog-title'),
  deleteButton: document.querySelector('#delete-product-button'),
  saveButton: document.querySelector('#save-product-button'),
  imagePreview: document.querySelector('#dialog-image-preview'),
  imageCaption: document.querySelector('#image-caption'),
  toast: document.querySelector('#toast'),
};

let toastTimer;
let searchTimer;

async function requestJson(url, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(url, {
    ...requestOptions,
    headers: { Accept: 'application/json', ...headers },
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível concluir a operação.');
  }
  return data;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', isError);
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent !== undefined && textContent !== null) element.textContent = textContent;
  return element;
}

function attachImage(container, product) {
  const frame = createElement('div', 'product-image-frame');
  if (!product.possui_imagem_local || !product.imagem_local_url) {
    frame.append(createElement('div', 'image-placeholder', '⌁'));
    container.append(frame);
    return;
  }

  const image = new Image();
  image.alt = product.nome || 'Imagem do produto';
  image.loading = 'lazy';
  image.src = product.imagem_local_url;
  image.addEventListener('error', () => {
    image.remove();
    if (!frame.childElementCount) frame.append(createElement('div', 'image-placeholder', '⌁'));
  });
  frame.append(image);
  container.append(frame);
}

function renderProductCard(product) {
  const card = createElement('article', 'product-card');
  card.dataset.productId = product.id;

  const image = createElement('div', 'product-image');
  attachImage(image, product);

  const content = createElement('div', 'product-card-content');
  const meta = createElement('div', 'product-card-meta');
  const category = createElement(
    'span',
    `badge ${product.status === 'inativo' ? 'inactive' : ''}`,
    product.categoria_produtos || (product.status === 'inativo' ? 'Inativo' : 'Sem categoria'),
  );
  meta.append(category);
  if (product.produto_destaque) {
    const featured = createElement('span', 'favorite-dot');
    featured.title = 'Produto em destaque';
    featured.setAttribute('aria-label', 'Produto em destaque');
    meta.append(featured);
  }

  const title = createElement('h4', null, product.nome || 'Produto sem nome');
  const subtitle = createElement('p', 'product-subtitle', product.subtitulo || product.fabricante || 'Sem subtítulo');
  const footer = createElement('div', 'product-footer');
  footer.append(createElement('span', null, product.ean ? `EAN ${product.ean}` : `ID ${product.id}`));
  footer.append(createElement('span', null, product.fabricante || product.grupo || 'Sem fabricante'));

  const actions = createElement('div', 'product-card-actions');
  const openButton = createElement('button', 'product-open-button', 'Detalhes');
  openButton.type = 'button';
  openButton.setAttribute('aria-label', `Ver detalhes de ${product.nome}`);
  openButton.addEventListener('click', () => openProduct(product.id));

  const storyLink = createElement('a', 'product-story-action', 'Criar arte');
  storyLink.href = `/artes/stories?productId=${encodeURIComponent(String(product.id))}`;
  storyLink.setAttribute('aria-label', `Criar arte para ${product.nome}`);
  storyLink.append(createElement('span', 'product-story-action-icon', '→'));
  actions.append(openButton, storyLink);

  content.append(meta, title, subtitle, footer, actions);
  card.append(image, content);
  return card;
}

function renderSkeletons() {
  elements.grid.replaceChildren(...Array.from({ length: 12 }, () => createElement('div', 'skeleton')));
}

function renderProducts(data) {
  const { items, pagination } = data;
  state.pagination = pagination;
  elements.grid.replaceChildren(...items.map(renderProductCard));
  
  elements.grid.hidden = items.length === 0;

  const start = pagination.total === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
  elements.resultsKicker.textContent = pagination.total
    ? `Mostrando ${formatNumber(start)}–${formatNumber(end)} de ${formatNumber(pagination.total)}`
    : 'Nenhum resultado';
  elements.resultsTitle.textContent = pagination.total === 1 ? '1 produto' : `${formatNumber(pagination.total)} produtos`;
  elements.pageIndicator.textContent = `${pagination.page} / ${pagination.totalPages}`;
  elements.previousPage.disabled = pagination.page <= 1;
  elements.nextPage.disabled = pagination.page >= pagination.totalPages;
}

async function loadSummary() {
  const summary = await requestJson('/api/summary');
  elements.summaryTotal.textContent = formatNumber(summary.total);
  elements.summaryActive.textContent = formatNumber(summary.ativos);
  elements.summaryImages.textContent = formatNumber(summary.com_imagem);
}

async function loadCategories() {
  const response = await requestJson('/api/categories');
  const currentValue = state.category;
  state.categories = response.items;

  const categoryOptions = response.items.map((category) => {
    const option = document.createElement('option');
    option.value = category.nome;
    option.textContent = `${category.nome} (${formatNumber(category.total)})`;
    return option;
  });
  elements.category.replaceChildren(new Option('Todas as categorias', ''), ...categoryOptions);
  elements.category.value = currentValue;
  elements.categoryOptions.replaceChildren(
    ...response.items.map((category) => new Option(category.nome, category.nome)),
  );
  renderCategoryChips();
}

function renderCategoryChips() {
  if (!elements.categoryChips) return;

  const fragment = document.createDocumentFragment();
  const categories = [
    { nome: 'Todas', total: null, value: '' },
    ...state.categories.map((category) => ({ ...category, value: category.nome })),
  ];

  categories.forEach((category) => {
    const chip = createElement('button', 'category-chip');
    chip.type = 'button';
    chip.dataset.category = category.value;
    const selected = state.category === category.value;
    chip.classList.toggle('is-active', selected);
    chip.setAttribute('aria-pressed', String(selected));
    chip.append(createElement('span', null, category.nome));
    if (category.total !== null) {
      chip.append(createElement('small', null, formatNumber(category.total)));
    }
    chip.addEventListener('click', () => setCategoryFilter(category.value));
    fragment.append(chip);
  });

  elements.categoryChips.replaceChildren(fragment);
}

function setCategoryFilter(category) {
  state.page = 1;
  state.category = category;
  elements.category.value = category;
  renderCategoryChips();
  loadProducts();
}

function productsUrl() {
  const parameters = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
  });
  if (state.query) parameters.set('q', state.query);
  if (state.category) parameters.set('categoria', state.category);
  if (state.status) parameters.set('status', state.status);
  if (state.image) parameters.set('imagem', state.image);
  return `/api/products?${parameters.toString()}`;
}

async function loadProducts() {
  const currentRequest = ++state.requestId;
  renderSkeletons();
  try {
    const response = await requestJson(productsUrl());
    if (currentRequest === state.requestId) renderProducts(response);
  } catch (error) {
    if (currentRequest !== state.requestId) return;
    elements.grid.replaceChildren();
    elements.grid.hidden = true;
    elements.empty.hidden = false;
    elements.resultsKicker.textContent = 'Não foi possível carregar';
    elements.resultsTitle.textContent = 'Tente novamente';
    showToast(error.message, true);
  }
}

function setFormValue(name, value) {
  const field = elements.form.elements.namedItem(name);
  if (!field) return;
  if (field.type === 'checkbox') {
    field.checked = Boolean(value);
  } else {
    field.value = value ?? '';
  }
}

function formValue(name) {
  const field = elements.form.elements.namedItem(name);
  return field?.type === 'checkbox' ? field.checked : field?.value ?? '';
}

function resetForm() {
  elements.form.reset();
  setFormValue('status', 'ativo');
  setFormValue('direcao_imagem', 'vertical');
  setFormValue('imagem_arquivo', '');
}

function renderDialogImage(product) {
  elements.imagePreview.replaceChildren();
  const localUrl = product?.imagem_local_url;

  if (localUrl) {
    const image = new Image();
    image.alt = product.nome || 'Imagem do produto';
    image.src = localUrl;
    image.addEventListener('error', () => renderDialogImage(null));
    elements.imagePreview.append(image);
    elements.imageCaption.textContent = `Imagem local disponível (${product.imagem_status || 'manual'}).`;
    return;
  }

  elements.imagePreview.append(createElement('span', null, '⌁'), createElement('p', null, 'Sem imagem local'));
  elements.imageCaption.textContent = 'A imagem local é definida pelo manifesto importado ou por um arquivo em imagens/.';
}

function previewTypedImage() {
  const localFile = String(formValue('imagem_arquivo') || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!localFile.startsWith('imagens/') || localFile.includes('..')) return renderDialogImage(null);
  renderDialogImage({
    nome: formValue('nome') || 'Imagem do produto',
    imagem_local_url: `/assets/${localFile.split('/').map(encodeURIComponent).join('/')}`,
    imagem_status: 'manual',
  });
}

function openDialog(product = null) {
  state.editingId = product?.id ?? null;
  resetForm();

  if (product) {
    elements.dialogKicker.textContent = `Produto #${product.id}`;
    elements.dialogTitle.textContent = 'Editar produto';
    elements.saveButton.textContent = 'Salvar alterações';
    elements.deleteButton.hidden = false;

    [
      'nome', 'subtitulo', 'caracteres', 'grupo', 'principio_ativo', 'ms', 'fabricante',
      'categoria_id', 'categoria_produtos', 'categoria_nome', 'frases_encarte', 'status',
      'data_vigencia_inicio', 'data_vigencia_fim', 'generico', 'produto_destaque', 'ean',
      'direcao_imagem', 'imagem_url', 'imagem_arquivo',
    ].forEach((field) => setFormValue(field, product[field]));
  } else {
    elements.dialogKicker.textContent = 'Novo registro';
    elements.dialogTitle.textContent = 'Adicionar produto';
    elements.saveButton.textContent = 'Criar produto';
    elements.deleteButton.hidden = true;
  }

  renderDialogImage(product);
  elements.dialog.showModal();
  elements.form.elements.namedItem('nome').focus();
}

function closeDialog() {
  if (elements.dialog.open) elements.dialog.close();
  state.editingId = null;
}

async function openProduct(id) {
  try {
    const product = await requestJson(`/api/products/${id}`);
    openDialog(product);
  } catch (error) {
    showToast(error.message, true);
  }
}

function payloadFromForm() {
  const fields = [
    'nome', 'subtitulo', 'caracteres', 'grupo', 'principio_ativo', 'ms', 'fabricante',
    'categoria_id', 'categoria_produtos', 'categoria_nome', 'frases_encarte', 'status',
    'data_vigencia_inicio', 'data_vigencia_fim', 'ean', 'direcao_imagem', 'imagem_url', 'imagem_arquivo',
  ];
  const payload = Object.fromEntries(fields.map((field) => [field, formValue(field)]));
  payload.generico = formValue('generico');
  payload.produto_destaque = formValue('produto_destaque');
  return payload;
}

async function saveProduct(event) {
  event.preventDefault();
  const name = String(formValue('nome')).trim();
  if (!name) {
    showToast('Informe o nome do produto.', true);
    elements.form.elements.namedItem('nome').focus();
    return;
  }

  elements.saveButton.disabled = true;
  elements.saveButton.textContent = 'Salvando…';

  try {
    const editing = Number.isInteger(state.editingId);
    const product = await requestJson(editing ? `/api/products/${state.editingId}` : '/api/products', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadFromForm()),
    });
    closeDialog();
    if (!editing) state.page = 1;
    await Promise.all([loadSummary(), loadCategories(), loadProducts()]);
    showToast(editing ? `${product.nome} foi atualizado.` : `${product.nome} foi criado.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = state.editingId === null ? 'Criar produto' : 'Salvar alterações';
  }
}

async function deleteCurrentProduct() {
  if (!Number.isInteger(state.editingId)) return;
  const productName = String(formValue('nome') || 'este produto');
  if (!window.confirm(`Excluir “${productName}”? Esta ação remove apenas o registro; a imagem local será preservada.`)) {
    return;
  }

  elements.deleteButton.disabled = true;
  try {
    await requestJson(`/api/products/${state.editingId}`, { method: 'DELETE' });
    closeDialog();
    await Promise.all([loadSummary(), loadCategories(), loadProducts()]);
    showToast('Produto excluído.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.deleteButton.disabled = false;
  }
}

function clearFilters() {
  state.page = 1;
  state.query = '';
  state.category = '';
  state.status = '';
  state.image = 'com';
  elements.search.value = '';
  elements.category.value = '';
  elements.status.value = '';
  elements.image.value = 'com';
  renderCategoryChips();
  loadProducts();
}

function bindEvents() {
  document.querySelector('#new-product-button').addEventListener('click', () => openDialog());
  document.querySelector('#close-dialog-button').addEventListener('click', closeDialog);
  document.querySelector('#cancel-dialog-button').addEventListener('click', closeDialog);
  document.querySelector('#clear-filters-button').addEventListener('click', clearFilters);
  elements.form.addEventListener('submit', saveProduct);
  elements.deleteButton.addEventListener('click', deleteCurrentProduct);
  elements.form.elements.namedItem('imagem_arquivo').addEventListener('input', previewTypedImage);

  elements.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.page = 1;
      state.query = elements.search.value.trim();
      loadProducts();
    }, 260);
  });

  elements.category.addEventListener('change', () => {
    setCategoryFilter(elements.category.value);
  });
  elements.status.addEventListener('change', () => {
    state.page = 1;
    state.status = elements.status.value;
    loadProducts();
  });
  elements.image.addEventListener('change', () => {
    state.page = 1;
    state.image = elements.image.value;
    loadProducts();
  });
  elements.previousPage.addEventListener('click', () => {
    if (state.pagination.page <= 1) return;
    state.page = state.pagination.page - 1;
    loadProducts();
  });
  elements.nextPage.addEventListener('click', () => {
    if (state.pagination.page >= state.pagination.totalPages) return;
    state.page = state.pagination.page + 1;
    loadProducts();
  });
}

async function initialize() {
  bindEvents();
  renderSkeletons();
  try {
    await Promise.all([loadSummary(), loadCategories(), loadProducts()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

initialize();

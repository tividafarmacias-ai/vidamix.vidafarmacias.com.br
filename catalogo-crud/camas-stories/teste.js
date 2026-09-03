(function() {
    console.log('🔍 Script de interceptação carregado');
    
    const dadosSalvos = sessionStorage.getItem('produtoDestaque');
    
    if (dadosSalvos) {
        console.log('✅ Dados encontrados no sessionStorage');
        console.log('📦 Dados brutos:', dadosSalvos);
        
        try {
            const dados = JSON.parse(dadosSalvos);
            console.log('📦 Dados parseados:', dados);
            
            window.dadosProdutoDestaque = dados;
            console.log('💾 Dados salvos em window.dadosProdutoDestaque');
            
        } catch (error) {
            console.error('❌ Erro ao parsear dados:', error);
        }
    } else {
        console.log('❌ Nenhum dado no sessionStorage');
    }
})();


let temas = [];
let temasOriginais = [];
let produtos = [];
let produtosSelecionados = [];
let temaSelecionado = null;
let cardAtualEdicao = null;
let tipoTemplateAtual = null;
let maxSelecionados = 1;
let produtoPreview = null;
let cardSendoEditado = null;
let modoEdicao = false;

let abrirEditorAutomaticamente = false;



// ===========================================
// VARIÁVEIS PARA EDIÇÃO SEQUENCIAL
// ===========================================

let filaEdicaoProdutos = [];
let indiceEdicaoAtual = 0;
let cardBannerAtual = null;
let produtosDobannerAtual = [];

let posicaoProdutoTroca = 0; // 0 = primeiro produto, 1 = segundo produto

// 🆕 VARIÁVEIS GLOBAIS DE BANDEIRA DO USUÁRIO
let usuarioBandeiraId = null;
let usuarioBandeiraNome = null;


let indiceCarregado = 0;       // Quantos produtos já foram carregados na lista principal
const LIMITE_INICIAL = 100;    // Carrega 100 na primeira vez
const LIMITE_MAIS = 100;       // Carrega mais 100 ao clicar no botão
 

// ===========================================
// FUNÇÕES DOS TEMAS
// ===========================================
function getTipoPaginaFromBody() {
    const bodyClasses = document.body.classList;
    return bodyClasses.length > 0 ? bodyClasses[0] : null;
}


function filtrarTemasPorTipo(todosOsTemas) {
    const tipoPagina = getTipoPaginaFromBody();
    
    if (!tipoPagina) {
        console.log('Nenhuma classe encontrada no body. Mostrando todos os temas.');
        // ✅ Filtra apenas temas ativos mesmo quando não há tipo de página
        return todosOsTemas.filter(tema => tema.ativo === true);
    }
    
    // ✅ Filtra por tipo_pagina E por ativo
    const temasFiltrados = todosOsTemas.filter(tema => 
        tema.tipo_pagina === tipoPagina && tema.ativo === true
    );
    
    console.log(`Filtrando por tipo_pagina: "${tipoPagina}" e ativo: true`);
    console.log(`Encontrados ${temasFiltrados.length} temas do tipo "${tipoPagina}" ativos`);
    
    return temasFiltrados;
}



async function buscarTemas() {
    try {
        const response = await fetch('/back-end/temas/api/get_temas.php');
        
        if (!response.ok) {
            throw new Error('Erro na requisição');
        }
        
        const data = await response.json();
        temasOriginais = filtrarTemasPorTipo(data);
        temas = [...temasOriginais];
        
    } catch (error) {
        console.error('Erro ao buscar temas:', error);
        
        // Dados de exemplo para demonstração
        const dadosExemplo = [
            {
                id: 105,
                categoria_id: 10,
                bandeira_id: 1,
                tipo_pagina: "feed",
                nome: "Tema stories - 13/08/2025",
                tags: "black",
                data_inicio: "2025-08-13",
                data_termino: "2025-08-31",
                destaque: true,
                imagem_url: "https://vidamix.app.br/back-end/temas/api/uploads/temas/1755112813_689ce56d1456d.png",
                ativo: true,
                categoria_nome: "Descontos de Verdade",
                bandeira_nome: "Desconto Fácil"
            },
            {
                id: 107,
                categoria_id: 12,
                bandeira_id: 3,
                tipo_pagina: "feed",
                nome: "Outro tema stories",
                tags: "promo",
                data_inicio: "2025-08-20",
                data_termino: "2025-09-20",
                destaque: true,
                imagem_url: "https://via.placeholder.com/400x300/e74c3c/ffffff?text=Tema+Vermelho",
                ativo: true,
                categoria_nome: "Ofertas Especiais",
                bandeira_nome: "Super Desconto"
            }
        ];
        
        temasOriginais = filtrarTemasPorTipo(dadosExemplo);
        temas = [...temasOriginais];
    }
    
    await popularFiltros();  // ✅ ADICIONE AWAIT AQUI
    renderizarTemas();
}


async function popularFiltros() {
    // ✅ Popular filtro de CATEGORIAS da API
    try {
        const resCategoria = await fetch("/back-end/Categorias/api/get_categorias.php");
        const categorias = await resCategoria.json();
        
        // ✅ FILTRAR apenas categorias ativas
        const categoriasAtivas = categorias.filter(cat => cat.ativo === true);
        
        const categoriaSelect = document.getElementById('categoriaFilter');
        categoriaSelect.innerHTML = '<option value="">Todas</option>';
        
        categoriasAtivas.sort((a, b) => a.nome.localeCompare(b.nome));
        
        categoriasAtivas.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria.nome;
            option.textContent = categoria.nome;
            categoriaSelect.appendChild(option);
        });
        
        console.log(`✅ ${categoriasAtivas.length} categorias ativas no filtro`);
    } catch (error) {
        console.error("❌ Erro ao carregar categorias para o filtro:", error);
    }

    // ✅ Popular filtro de BANDEIRAS da API
    try {
        const resBandeira = await fetch("/back-end/bandeiras/api/get_bandeiras.php");
        const bandeiras = await resBandeira.json();
        
        // ✅ FILTRAR apenas bandeiras ativas
        const bandeirasAtivas = bandeiras.filter(ban => ban.ativo === true);
        
        const bandeiraSelect = document.getElementById('bandeiraFilter');
        bandeiraSelect.innerHTML = '<option value="">Todas</option>';
        
        bandeirasAtivas.sort((a, b) => a.nome.localeCompare(b.nome));
        
        bandeirasAtivas.forEach(bandeira => {
            const option = document.createElement('option');
            option.value = bandeira.nome;
            option.textContent = bandeira.nome;
            bandeiraSelect.appendChild(option);
        });
        
        console.log(`✅ ${bandeirasAtivas.length} bandeiras ativas no filtro`);
    } catch (error) {
        console.error("❌ Erro ao carregar bandeiras para o filtro:", error);
    }
}

function filtrarTemas() {
    const categoria = document.getElementById('categoriaFilter').value;
    const bandeira = document.getElementById('bandeiraFilter').value;
    const busca = document.getElementById('searchFilter').value.toLowerCase();

    temas = temasOriginais.filter(tema => {
        const matchCategoria = !categoria || tema.categoria_nome === categoria;
        const matchBandeira = !bandeira || tema.bandeira_nome === bandeira;
        const matchBusca = !busca || 
            tema.nome.toLowerCase().includes(busca) ||
            tema.categoria_nome.toLowerCase().includes(busca) ||
            tema.bandeira_nome.toLowerCase().includes(busca) ||
            tema.tags.toLowerCase().includes(busca);

        return matchCategoria && matchBandeira && matchBusca;
    });

    renderizarTemas();
}

function renderizarTemas() {
    const container = document.getElementById('temas-container');
    const loading = document.getElementById('loading-temas');
    
    loading.style.display = 'none';
    container.style.display = 'grid';
    
    container.innerHTML = '';
    
    if (temas.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666; font-size: 14px;">
                <p>Nenhum tema encontrado</p>
                <small>Tente ajustar os filtros</small>
            </div>
        `;
        return;
    }
    
    temas.forEach(tema => {
        const temaElement = criarTemaElement(tema);
        container.appendChild(temaElement);
    });
}

function criarTemaElement(tema) {
    const div = document.createElement('div');
    div.className = tema.destaque ? 'lk-theme-card lk-theme-destaque' : 'lk-theme-card';
    div.setAttribute('data-tema-id', tema.id);
    
    div.innerHTML = `
        ${tema.destaque ? '<div class="wq-featured-badge">DESTAQUE</div>' : ''}
        <img 
            src="${tema.imagem_url}" 
            alt="${tema.nome}"
            class="gh-theme-preview"
            onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDIwMCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTUwIiBmaWxsPSIjRTlFQ0VGIi8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9Ijc1IiByPSIyMCIgZmlsbD0iI0Q5REREREQiLz4KPC9zdmc+'"
        >
        <div class="theme-actions">
            <button class="action-btn delete-btn" onclick="deletarTema(event, ${tema.id})" title="Deletar">
                <img src="assets/lixeira_vermelha.png" width="22px"></img>
            </button>
            
            <button class="action-btn edit-btn" onclick="editarTema(event, ${tema.id})" title="Editar">
                <img src="assets/editar_cinza.png" width="22px"></img>
            </button>

            <button class="action-btn favorite-btn ${tema.favorito ? 'active' : ''}" onclick="toggleFavorito(event, ${tema.id})" title="Favoritar">
                <img src="assets/estrela_amarela.png" width="22px"></img>
            </button>
            
        </div>
    `;
    
    div.addEventListener('click', (e) => {
        // Não seleciona o tema se clicar nos botões de ação
        if (!e.target.closest('.theme-actions')) {
            selecionarTema(tema, div);
        }
    });
    
    return div;
}

// Funções para os botões de ação
function toggleFavorito(event, temaId) {
    event.stopPropagation();
    // Adicione aqui a lógica para marcar/desmarcar favorito
    console.log('Toggle favorito:', temaId);
}

async function editarTema(event, temaId) {
event.stopPropagation();

// Busca os dados do tema
const tema = temas.find(t => t.id === temaId);
if (!tema) {
    alert('Tema não encontrado');
    return;
}

try {
    // Busca categorias e bandeiras
    const [categorias, bandeiras] = await Promise.all([
        fetch('/back-end/Categorias/api/get_categorias.php').then(r => r.json()),
        fetch('/back-end/bandeiras/api/get_bandeiras.php').then(r => r.json())
    ]);
    
    // Cria o popup
    const popup = document.createElement('div');
    popup.className = 'edit-popup-overlay';
    popup.innerHTML = `
        <div class="edit-popup">
            <button class="popup-close" onclick="fecharPopupEditar()">&times;</button>
            <h2>Editar Tema</h2>
            
            <form id="form-editar-tema" onsubmit="salvarEdicaoTema(event, ${temaId})">
                <div class="form-group">
                    <label for="edit-categoria">Categoria:</label>
                    <select id="edit-categoria" name="categoria_id" required>
                        <option value="">Selecione uma categoria</option>
                        ${categorias.map(cat => `
                            <option value="${cat.id}" ${tema.categoria_id == cat.id ? 'selected' : ''}>
                                ${cat.nome}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="edit-bandeira">Bandeira:</label>
                    <select id="edit-bandeira" name="bandeira_id" required>
                        <option value="">Selecione uma bandeira</option>
                        ${bandeiras.map(band => `
                            <option value="${band.id}" ${tema.bandeira_id == band.id ? 'selected' : ''}>
                                ${band.nome}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-data-inicio">Data Início:</label>
                        <input type="date" id="edit-data-inicio" name="data_inicio" value="${tema.data_inicio || ''}">
                    </div>

                    <div class="form-group">
                        <label for="edit-data-termino">Data Término:</label>
                        <input type="date" id="edit-data-termino" name="data_termino" value="${tema.data_termino || ''}">
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Tags:</label>
                    <div class="tags-input-wrapper">
                        <div class="tags-container" id="tags-container">
                            ${tema.tags ? tema.tags.split(',').map((tag, index) => `
                                <div class="tag-item">
                                    <span>${tag.trim()}</span>
                                    <button type="button" class="tag-remove" onclick="removerTag(${index})">&times;</button>
                                </div>
                            `).join('') : ''}
                        </div>
                        <input 
                            type="text" 
                            id="tag-input" 
                            class="tag-input" 
                            placeholder="Digite e pressione Enter para adicionar"
                            onkeypress="adicionarTagEnter(event)"
                        >
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="edit-ativo" name="ativo" ${!tema.ativo ? 'checked' : ''}>
                        <span>Inativar tema</span>
                    </label>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="edit-destaque" name="destaque" ${tema.destaque ? 'checked' : ''} onchange="toggleDestaqueEdit(this)">
                        <span>Tema Destaque</span>
                    </label>
                </div>

                <div class="form-row" id="destaque-edit-dates" style="display: ${tema.destaque ? 'flex' : 'none'};">
                    <div class="form-group">
                        <label for="edit-destaque-inicio">Data Início Destaque:</label>
                        <input type="date" id="edit-destaque-inicio" name="destaque_inicio" value="${tema.destaque_inicio || ''}" ${tema.destaque ? 'required' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="edit-destaque-termino">Data Término Destaque:</label>
                        <input type="date" id="edit-destaque-termino" name="destaque_termino" value="${tema.destaque_termino || ''}" ${tema.destaque ? 'required' : ''}>
                    </div>
                </div>

                <div class="popup-actions">
                    <button type="button" class="btn-secondary" onclick="fecharPopupEditar()">Fechar</button>
                    <button type="submit" class="btn-primary">Editar</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Armazena as tags globalmente para manipulação
    window.currentTags = tema.tags ? tema.tags.split(',').map(t => t.trim()) : [];
    
} catch (error) {
    console.error('Erro ao carregar dados:', error);
    alert('Erro ao carregar dados. Tente novamente.');
}
}

function adicionarTagEnter(event) {
if (event.key === 'Enter') {
    event.preventDefault();
    
    const input = document.getElementById('tag-input');
    const tagTexto = input.value.trim();
    
    if (tagTexto === '') {
        return;
    }
    
    // Verifica se a tag já existe
    if (window.currentTags.includes(tagTexto)) {
        alert('Esta tag já foi adicionada!');
        input.value = '';
        return;
    }
    
    // Adiciona a nova tag
    window.currentTags.push(tagTexto);
    atualizarTagsDisplay();
    
    // Limpa o input
    input.value = '';
    
    // Mantém o foco no input
    input.focus();
}
}

function removerTag(index) {
window.currentTags.splice(index, 1);
atualizarTagsDisplay();
}

function atualizarTagsDisplay() {
const container = document.getElementById('tags-container');
if (window.currentTags.length === 0) {
    container.innerHTML = '';
} else {
    container.innerHTML = window.currentTags.map((tag, index) => `
        <div class="tag-item">
            <span>${tag}</span>
            <button type="button" class="tag-remove" onclick="removerTag(${index})">&times;</button>
        </div>
    `).join('');
}
}

function toggleDestaqueEdit(checkbox) {
    const datesRow = document.getElementById('destaque-edit-dates');
    const inicio = document.getElementById('edit-destaque-inicio');
    const termino = document.getElementById('edit-destaque-termino');
    if (checkbox.checked) {
        datesRow.style.display = 'flex';
        inicio.required = true;
        termino.required = true;
    } else {
        datesRow.style.display = 'none';
        inicio.required = false;
        inicio.value = '';
        termino.required = false;
        termino.value = '';
    }
}

function fecharPopupEditar() {
const popup = document.querySelector('.edit-popup-overlay');
if (popup) {
    popup.remove();
}
window.currentTags = [];
}

async function salvarEdicaoTema(event, temaId) {
event.preventDefault();

const formData = new FormData(event.target);
const destaqueChecked = !!formData.get('destaque');
const dados = {
    id: temaId,
    categoria_id: formData.get('categoria_id'),
    bandeira_id: formData.get('bandeira_id'),
    data_inicio: formData.get('data_inicio'),
    data_termino: formData.get('data_termino'),
    tags: window.currentTags.join(','),
    ativo: !formData.get('ativo'), // Inverte porque o checkbox é para "inativar"
    destaque: destaqueChecked,
    destaque_inicio: destaqueChecked ? formData.get('destaque_inicio') : null,
    destaque_termino: destaqueChecked ? formData.get('destaque_termino') : null,
};

try {
    const response = await fetch('/back-end/temas/api/update_tema.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
    
    if (!response.ok) throw new Error('Erro ao editar tema');
    
    console.log('Dados para edição:', dados);
    alert('Tema editado com sucesso!');
    fecharPopupEditar();
    
    // Recarrega os temas
    // await carregarTemas();
    
} catch (error) {
    console.error('Erro ao editar tema:', error);
    alert('Erro ao editar tema. Tente novamente.');
}
}

async function deletarTema(event, temaId) {
event.stopPropagation();

const confirmar = confirm('Tem certeza que deseja deletar este tema?');
if (!confirmar) return;

try {
    const response = await fetch('/back-end/temas/api/delete_tema.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            id: temaId,
            force: false
        })
    });

    const resultado = await response.json();

    if (resultado.success) {
        mostrarToastDeletado();

        if (typeof buscarTemas === 'function') {
            await buscarTemas();
        } else {
            location.reload();
        }
    } else {
        alert('Erro: ' + (resultado.error || resultado.message));
    }

} catch (error) {
    console.error('Erro ao deletar tema:', error);
    alert('Erro de conexão. Tente novamente.');
}
}

// FUNÇÃO PRINCIPAL: Renderizar tema no canvas
function mostrarTemaNoCanvas(tema) {
    const themeContainer = document.getElementById('themePreviewContainer');
    const initialBtn = document.getElementById('initialAddBtn');
    const produtosCanvas = document.getElementById('produtosCanvas');
    const themeTitle = document.getElementById('themePreviewTitle');
    const themeSubtitle = document.getElementById('themePreviewSubtitle');
    
    if (tema) {
        // Aplicar tema como fundo do container
        themeContainer.style.backgroundImage = `url('${tema.imagem_url}')`;
        
        // Atualizar textos
        themeTitle.textContent = tema.nome;
        themeSubtitle.textContent = `${tema.categoria_nome || 'Categoria'} • ${tema.bandeira_nome || 'Bandeira'}`;
        
        // Gerenciar visibilidade dos elementos
        if (produtosCanvas.style.display === 'block') {
            // Se já tem produtos, não mostrar o preview do tema
            themeContainer.style.display = 'none';
        } else {
            // Mostrar preview do tema e esconder botão inicial
            themeContainer.style.display = 'flex';
            initialBtn.style.display = 'none';
        }
    } else {
        // Limpar tema
        themeContainer.style.display = 'none';
        
        // Se não tem produtos, mostrar botão inicial
        if (produtosCanvas.style.display !== 'block') {
            initialBtn.style.display = 'block';
        }
    }
}

// FUNÇÃO MODIFICADA: Seleção de tema
function selecionarTema(tema, elemento) {
    // Remover seleção anterior
    document.querySelectorAll('.lk-theme-card').forEach(card => {
        card.classList.remove('tj-selected');
    });
    
    // Adicionar seleção atual
    elemento.classList.add('tj-selected');
    
    // Salvar tema selecionado
    temaSelecionado = tema;
    
    // NOVO: Mostrar tema no canvas principal
    mostrarTemaNoCanvas(tema);
    
    // Aplicar tema aos produtos existentes (se houver)
    aplicarTemaAosProdutos(tema);
    
    // Aplicar tema ao preview se estiver visível
    aplicarTemaAoPreview(tema);
    
    mostrarNotificacaoTema();
    console.log('Tema selecionado:', tema);
}
function mostrarToastDeletado() {
    const existing = document.getElementById('notif-tema-adicionado');
    if (existing) existing.remove();
    const notif = document.createElement('div');
    notif.id = 'notif-tema-adicionado';
    notif.textContent = '🗑 Tema deletado';
    notif.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'background:#ef4444',
        'color:#fff',
        'font-size:12px',
        'font-weight:600',
        'padding:7px 14px',
        'border-radius:6px',
        'box-shadow:0 3px 10px rgba(0,0,0,.15)',
        'z-index:99999',
        'opacity:0',
        'transform:translateY(-6px)',
        'transition:opacity .18s ease,transform .18s ease',
        'pointer-events:none'
    ].join(';');
    document.body.appendChild(notif);
    requestAnimationFrame(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-6px)';
        setTimeout(() => notif.remove(), 200);
    }, 2200);
}

function mostrarNotificacaoTema() {
    const existing = document.getElementById('notif-tema-adicionado');
    if (existing) existing.remove();
    const notif = document.createElement('div');
    notif.id = 'notif-tema-adicionado';
    notif.textContent = '✓ Tema adicionado';
    notif.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'background:#22c55e',
        'color:#fff',
        'font-size:12px',
        'font-weight:600',
        'padding:7px 14px',
        'border-radius:6px',
        'box-shadow:0 3px 10px rgba(0,0,0,.15)',
        'z-index:99999',
        'opacity:0',
        'transform:translateY(-6px)',
        'transition:opacity .18s ease,transform .18s ease',
        'pointer-events:none'
    ].join(';');
    document.body.appendChild(notif);
    requestAnimationFrame(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-6px)';
        setTimeout(() => notif.remove(), 200);
    }, 2200);
}


// FUNÇÃO: Limpar seleção de tema
function limparSelecaoTema() {
    document.querySelectorAll('.lk-theme-card').forEach(card => {
        card.classList.remove('tj-selected');
    });
    
    temaSelecionado = null;
    mostrarTemaNoCanvas(null);
    
    // Remover tema dos produtos existentes
    const produtoCards = document.querySelectorAll('.mn-product-tile:not(.nh-preview-card)');
    produtoCards.forEach(card => {
        card.style.backgroundImage = 'none';
        card.classList.remove('with-theme');
    });
    
    // Remover tema do preview
    const previewCard = document.getElementById('preview-card');
    if (previewCard) {
        previewCard.style.backgroundImage = 'none';
        previewCard.classList.remove('with-theme');
    }
}

function aplicarTemaAosProdutos(tema) {
    const produtoCards = document.querySelectorAll('.mn-product-tile:not(.nh-preview-card)');
    
    produtoCards.forEach(card => {
        card.style.backgroundImage = `url('${tema.imagem_url}')`;
        card.classList.add('with-theme');
    });
}

function aplicarTemaAoPreview(tema) {
    const previewCard = document.getElementById('preview-card');
    if (previewCard && tema) {
        previewCard.style.backgroundImage = `url('${tema.imagem_url}')`;
        previewCard.classList.add('with-theme');
    }
}

// ===========================================
// FUNÇÕES DOS PRODUTOS
// ===========================================
function abrirPopupProduto() {
    // MARCA: Ativamos o modo de adição automática
    abrirEditorAutomaticamente = true;
    document.getElementById('popup-produto').style.display = 'flex';
}

// NOVA FUNÇÃO: Editar produto existente
function editarProduto(iconElement, event) {
    const card = iconElement.closest('.mn-product-tile');
    cardSendoEditado = card;
    modoEdicao = true;
    
    // 🎯 NOVO: Detectar qual produto foi clicado (para banner de 2 produtos)
    if (card.classList.contains('combined-banner')) {
        // Se o event não foi passado, usar posição 0 como padrão
        posicaoProdutoTroca = event ? detectarProdutoClicado(event, card) : 0;
        console.log(`🔄 Modo troca ativado para produto ${posicaoProdutoTroca + 1} do banner combinado`);
    } else {
        posicaoProdutoTroca = 0; // Sempre primeiro produto para outros tipos
    }
    
    // Destacar visualmente o card sendo editado
    card.style.border = '3px solid #ffc107';
    card.style.boxShadow = '0 0 15px rgba(255, 193, 7, 0.5)';
    
    // 🎯 NOVO: Destacar visualmente qual produto está sendo trocado
    if (card.classList.contains('combined-banner')) {
        const secoes = card.querySelectorAll('.combined-product-section');
        secoes.forEach((secao, index) => {
            if (index === posicaoProdutoTroca) {
                secao.style.outline = '2px dashed #ffc107';
                secao.style.outlineOffset = '4px';
            } else {
                secao.style.outline = 'none';
            }
        });
    }
    
    // Abrir popup de seleção diretamente
    document.getElementById('zk-products-modal').style.display = 'flex';
    
    // Configurar para seleção única
    maxSelecionados = 1;
    produtosSelecionados = [];
    
    // Atualizar título do popup
    const mensagemPosicao = card.classList.contains('combined-banner') 
        ? ` (Produto ${posicaoProdutoTroca + 1})` 
        : '';
    
    document.getElementById('titulo-produto').innerHTML = 
        `Trocar produto${mensagemPosicao}
        <small style="color: #666; font-size: 12px; display: block; font-weight: normal;">
            Selecione o novo produto para substituir
        </small>`;
    
    // Carregar produtos
    carregarProdutosParaSelecao();
}

function fecharPopup(popupId) {
    document.getElementById(popupId).style.display = 'none';
    
    // Reset das variáveis se necessário
    if (popupId === 'zk-products-modal') {
        // Limpar destaque visual se estava editando
        if (modoEdicao && cardSendoEditado) {
            cardSendoEditado.style.border = '';
            cardSendoEditado.style.boxShadow = '';
            
            // Limpar destaque das seções (banner de 2 produtos)
            if (cardSendoEditado.classList.contains('combined-banner')) {
                const secoes = cardSendoEditado.querySelectorAll('.combined-product-section');
                secoes.forEach(secao => {
                    secao.style.outline = 'none';
                    secao.style.background = 'transparent';
                });
            }
            
            // Limpar destaque dos cards (banner de 4 produtos)
            if (cardSendoEditado.classList.contains('four-products-banner')) {
                const cards = cardSendoEditado.querySelectorAll('.four-product-card');
                cards.forEach(card => {
                    card.style.outline = 'none';
                    card.style.background = 'transparent';
                    card.style.transform = 'scale(1)';
                });
            }
            
            // 🎯 NOVO: Limpar destaque dos items (banner de 8 produtos)
            if (cardSendoEditado.classList.contains('eight-products-banner')) {
                const items = cardSendoEditado.querySelectorAll('.eight-product-item');
                items.forEach(item => {
                    item.style.outline = 'none';
                    item.style.background = 'rgba(255, 255, 255, 0.9)';
                    item.style.transform = 'translateX(0) scale(1)';
                });
            }
        }
        
        tipoTemplateAtual = null;
        maxSelecionados = 1;
        produtosSelecionados = [];
        cardSendoEditado = null;
        modoEdicao = false;
        posicaoProdutoTroca = 0;
        
        abrirEditorAutomaticamente = false;
    }
}

// Event listeners para as opções de template
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.ei-template-choice').forEach(option => {
        option.addEventListener('click', function() {
            const tipo = this.getAttribute('data-tipo');
            selecionarTipoTemplate(tipo);
        });
    });
});

function selecionarTipoTemplate(tipo) {
    tipoTemplateAtual = tipo;
    
    // Definir quantos produtos podem ser selecionados
    switch(tipo) {
        case '1':
            maxSelecionados = 1;
            break;
        case '2':
            maxSelecionados = 2;
            break;
        case '4':
            maxSelecionados = 4;
            break;
        case 'texto':
            maxSelecionados = 8;     // ← ADICIONE ESTA LINHA
            break; 
        default:
            maxSelecionados = 1;
    }
    
    // Fechar primeiro popup e abrir segundo
    fecharPopup('popup-produto');
    
    // Atualizar título do segundo popup
    const mensagemAuto = maxSelecionados === 1 ? 
        ' (seleção automática)' : 
        ' (fechará automaticamente quando completo)';
    
    document.getElementById('titulo-produto').innerHTML = 
        `Selecione ${maxSelecionados} produto${maxSelecionados > 1 ? 's' : ''}
        <small style="color: #666; font-size: 12px; display: block; font-weight: normal;">
            ${mensagemAuto}
        </small>`;
    
    // Abrir segundo popup
    document.getElementById('zk-products-modal').style.display = 'flex';
    
    // Carregar produtos
    carregarProdutosParaSelecao();
}
let todosProdutosSemImagem = []; // 🗃️ Guarda todos os produtos sem imagem
let produtosCarregadosIds = new Set(); // 🔍 Controla quais já tiveram imagem carregada

async function carregarProdutosParaSelecao() {
    try {
        if (!usuarioBandeiraId) {
            await inicializarBandeiraUsuario();
        }
 
        const response = await fetch('/back-end/produtos/api/get_produtos.php');
 
        if (!response.ok) throw new Error('Erro ao carregar produtos');
 
        const data = await response.json();
 
        if (!data.success) throw new Error('Erro na resposta da API');
 
        // 🗃️ Salva TODOS os produtos (sem imagem) para uso na pesquisa
        todosProdutosSemImagem = data.data;
        indiceCarregado = 0; // Reseta ao reabrir
 
        // 🎯 Pega apenas os 100 primeiros para carregar inicialmente
        const primeiros = data.data.slice(0, LIMITE_INICIAL);
 
        console.log(`📦 Carregando apenas os ${LIMITE_INICIAL} primeiros de ${data.data.length} produtos...`);
 
        if (usuarioBandeiraId) {
            mostrarProgressoCarregamento(0, primeiros.length);
 
            const BATCH_SIZE = 10;
            const produtosComImagem = [];
 
            for (let i = 0; i < primeiros.length; i += BATCH_SIZE) {
                const batch = primeiros.slice(i, i + BATCH_SIZE);
 
                const batchResults = await Promise.all(
                    batch.map(async (produto) => {
                        try {
                            const imgResponse = await fetch(
                                `/back-end/produtos/api/get_produto_com_imagem.php?produto_id=${produto.id}&bandeira_id=${usuarioBandeiraId}`,
                                { signal: AbortSignal.timeout(5000) }
                            );
 
                            const imgData = await imgResponse.json();
 
                            if (imgData.success && imgData.imagem) {
                                produtosCarregadosIds.add(produto.id);
                                return { ...produto, imagem_url: imgData.imagem.url, tipo_imagem: imgData.imagem.tipo };
                            } else {
                                produtosCarregadosIds.add(produto.id);
                                return produto;
                            }
                        } catch (error) {
                            console.warn(`⚠️ Erro imagem produto ${produto.id}:`, error.message);
                            produtosCarregadosIds.add(produto.id);
                            return produto;
                        }
                    })
                );
 
                produtosComImagem.push(...batchResults);
                mostrarProgressoCarregamento(i + batch.length, primeiros.length);
            }
 
            produtos = produtosComImagem;
            indiceCarregado = produtos.length;
            ocultarProgressoCarregamento();
 
        } else {
            produtos = primeiros;
            indiceCarregado = produtos.length;
        }
 
        console.log(`✅ ${produtos.length} produtos carregados inicialmente`);
        renderizarTabelaProdutos(produtos);
        atualizarBotaoCarregarMais(); // 👈 Exibe o botão se houver mais produtos
 
    } catch (error) {
        console.error('❌ Erro ao carregar produtos:', error);
        ocultarProgressoCarregamento();
        produtos = [];
        renderizarTabelaProdutos(produtos);
    }
}


// ➕ Carrega mais 100 produtos ao clicar no botão
async function carregarMaisProdutos() {
    const btnCarregarMais = document.getElementById('btn-carregar-mais');
    if (btnCarregarMais) {
        btnCarregarMais.disabled = true;
        btnCarregarMais.textContent = '⏳ Carregando...';
    }
 
    const proximos = todosProdutosSemImagem.slice(indiceCarregado, indiceCarregado + LIMITE_MAIS);
 
    if (proximos.length === 0) {
        atualizarBotaoCarregarMais();
        return;
    }
 
    console.log(`📦 Carregando mais ${proximos.length} produtos (índice ${indiceCarregado})...`);
 
    if (usuarioBandeiraId) {
        const BATCH_SIZE = 10;
        const novosComImagem = [];
 
        for (let i = 0; i < proximos.length; i += BATCH_SIZE) {
            const batch = proximos.slice(i, i + BATCH_SIZE);
 
            const batchResults = await Promise.all(
                batch.map(async (produto) => {
                    try {
                        const imgResponse = await fetch(
                            `/back-end/produtos/api/get_produto_com_imagem.php?produto_id=${produto.id}&bandeira_id=${usuarioBandeiraId}`,
                            { signal: AbortSignal.timeout(5000) }
                        );
 
                        const imgData = await imgResponse.json();
                        produtosCarregadosIds.add(produto.id);
 
                        if (imgData.success && imgData.imagem) {
                            return { ...produto, imagem_url: imgData.imagem.url, tipo_imagem: imgData.imagem.tipo };
                        } else {
                            return produto;
                        }
                    } catch (error) {
                        produtosCarregadosIds.add(produto.id);
                        return produto;
                    }
                })
            );
 
            novosComImagem.push(...batchResults);
        }
 
        produtos.push(...novosComImagem);
        indiceCarregado += novosComImagem.length;
 
    } else {
        produtos.push(...proximos);
        indiceCarregado += proximos.length;
    }
 
    console.log(`✅ Total carregado: ${indiceCarregado} de ${todosProdutosSemImagem.length}`);
    renderizarTabelaProdutos(produtos);
    atualizarBotaoCarregarMais(); // 👈 Atualiza ou esconde o botão
}

// 🔘 Cria/atualiza o botão "Carregar mais 100" no final do popup
function atualizarBotaoCarregarMais(pesquisaAtiva = false) {
    let btn = document.getElementById('btn-carregar-mais');
 
    // Se estiver numa pesquisa ativa, esconde o botão
    if (pesquisaAtiva) {
        if (btn) btn.style.display = 'none';
        return;
    }
 
    const temMais = indiceCarregado < todosProdutosSemImagem.length;
 
    if (!temMais) {
        if (btn) btn.style.display = 'none';
        return;
    }
 
    if (!btn) {
        // Cria o botão se ainda não existir
        btn = document.createElement('button');
        btn.id = 'btn-carregar-mais';
        btn.style.cssText = `
            display: block;
            width: calc(100% - 32px);
            margin: 12px 16px 16px;
            padding: 10px;
            background-color: #f0f4ff;
            color: #3b5bdb;
            border: 1px solid #c5d0e8;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.backgroundColor = '#dce4f5';
        btn.onmouseout = () => btn.style.backgroundColor = '#f0f4ff';
        btn.onclick = carregarMaisProdutos;
 
        // Insere logo após a tabela de produtos
        const tabela = document.getElementById('tabela-produtos-body')?.closest('table');
        if (tabela) {
            tabela.insertAdjacentElement('afterend', btn);
        }
    }
 
    const restantes = todosProdutosSemImagem.length - indiceCarregado;
    btn.textContent = `⬇️ Carregar mais ${Math.min(LIMITE_MAIS, restantes)} produtos (${restantes} restantes)`;
    btn.disabled = false;
    btn.style.display = 'block';
}

// 🔍 Função de pesquisa com carregamento sob demanda
async function pesquisarProdutos(termoPesquisa) {
    if (!termoPesquisa || termoPesquisa.trim() === '') {
        // Se limpar a pesquisa, volta aos produtos já carregados
        renderizarTabelaProdutos(produtos);
        atualizarBotaoCarregarMais(false); // Reexibe o botão
        return;
    }
 
    atualizarBotaoCarregarMais(true); // Esconde o botão durante pesquisa
 
    const termo = termoPesquisa.toLowerCase();
 
    // 🔎 Filtra em TODOS os produtos (incluindo os não carregados)
    const resultadosFiltrados = todosProdutosSemImagem.filter(p =>
        p.nome?.toLowerCase().includes(termo) ||
        p.ean?.toLowerCase().includes(termo) ||
        p.principio_ativo?.toLowerCase().includes(termo) ||
        p.fabricante?.toLowerCase().includes(termo)
    );
 
    // 🆕 Descobre quais ainda não tiveram imagem carregada
    const semImagem = resultadosFiltrados.filter(p => !produtosCarregadosIds.has(p.id));
 
    if (semImagem.length > 0 && usuarioBandeiraId) {
        console.log(`🔄 Buscando imagens de ${semImagem.length} produtos novos...`);
 
        const BATCH_SIZE = 10;
        const novosComImagem = [];
 
        for (let i = 0; i < semImagem.length; i += BATCH_SIZE) {
            const batch = semImagem.slice(i, i + BATCH_SIZE);
 
            const batchResults = await Promise.all(
                batch.map(async (produto) => {
                    try {
                        const imgResponse = await fetch(
                            `/back-end/produtos/api/get_produto_com_imagem.php?produto_id=${produto.id}&bandeira_id=${usuarioBandeiraId}`,
                            { signal: AbortSignal.timeout(5000) }
                        );
 
                        const imgData = await imgResponse.json();
                        produtosCarregadosIds.add(produto.id);
 
                        if (imgData.success && imgData.imagem) {
                            return { ...produto, imagem_url: imgData.imagem.url, tipo_imagem: imgData.imagem.tipo };
                        } else {
                            return produto;
                        }
                    } catch (error) {
                        produtosCarregadosIds.add(produto.id);
                        return produto;
                    }
                })
            );
 
            novosComImagem.push(...batchResults);
        }
 
        // 💾 Adiciona novos produtos carregados ao array principal
        produtos.push(...novosComImagem);
    } else if (semImagem.length > 0) {
        // Sem bandeira: adiciona produtos basicos ao array principal para que
        // selecionarProduto() consiga encontra-los (evita push de undefined)
        semImagem.forEach(p => produtosCarregadosIds.add(p.id));
        produtos.push(...semImagem);
    }
 
    // 🎯 Monta resultado final com imagens já carregadas
    const resultadoFinal = resultadosFiltrados.map(p => {
        const comImagem = produtos.find(pc => pc.id === p.id);
        return comImagem || p;
    });
 
    renderizarTabelaProdutos(resultadoFinal);
}



// 📊 FUNÇÃO MODIFICADA: Mostrar spinner + barra de progresso
function mostrarProgressoCarregamento(atual, total) {
    let spinner = document.getElementById('products-loading-spinner');
    
    if (!spinner) {
        // 🎨 CRIAR OVERLAY ESCURO
        const overlay = document.createElement('div');
        overlay.id = 'products-loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 9998;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;
        
        // 🔄 CRIAR SPINNER CIRCULAR AMARELO
        spinner = document.createElement('div');
        spinner.id = 'products-loading-spinner';
        spinner.style.cssText = `
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
        `;
        
        spinner.innerHTML = `
            <!-- Círculo Amarelo Animado -->
            <div class="spinner-circle" style="
                width: 80px;
                height: 80px;
                border: 6px solid rgba(251, 191, 36, 0.2);
                border-top: 6px solid #fbbf24;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            
            <!-- Texto de Status -->
            <div id="spinner-status-text" style="
                color: white;
                font-size: 16px;
                font-weight: bold;
                text-align: center;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            ">
                Carregando produtos...
            </div>
            
            <!-- Contador -->
            <div id="spinner-counter" style="
                color: #fbbf24;
                font-size: 14px;
                font-weight: 600;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            ">
                0 / 0
            </div>
            
            <!-- Barra de Progresso -->
            <div style="
                width: 300px;
                height: 6px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            ">
                <div id="spinner-progress-fill" style="
                    height: 100%;
                    background: linear-gradient(90deg, #fbbf24, #f59e0b);
                    border-radius: 10px;
                    transition: width 0.3s ease;
                    width: 0%;
                    box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
                "></div>
            </div>
        `;
        
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
        
        // 🎨 ADICIONAR ANIMAÇÃO CSS
        if (!document.getElementById('spinner-animation-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-animation-style';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                
                .spinner-circle {
                    animation: spin 1s linear infinite;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // 📊 ATUALIZAR PROGRESSO
    const progressFill = document.getElementById('spinner-progress-fill');
    const counter = document.getElementById('spinner-counter');
    const statusText = document.getElementById('spinner-status-text');
    
    const percent = Math.round((atual / total) * 100);
    
    if (progressFill) {
        progressFill.style.width = `${percent}%`;
    }
    
    if (counter) {
        counter.textContent = `${atual} / ${total}`;
    }
    
    if (statusText) {
        if (percent === 100) {
            statusText.textContent = '✅ Produtos carregados!';
        } else {
            statusText.textContent = `Carregando produtos... ${percent}%`;
        }
    }
}

// 🧹 FUNÇÃO MODIFICADA: Ocultar spinner
function ocultarProgressoCarregamento() {
    setTimeout(() => {
        const overlay = document.getElementById('products-loading-overlay');
        const spinner = document.getElementById('products-loading-spinner');
        
        if (overlay) {
            // ✨ Animação de fade out
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.style.opacity = '0';
            
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
        
        if (spinner) spinner.remove();
    }, 500);
}

// ============================================
// 🆕 FUNÇÃO: INICIALIZAR BANDEIRA DO USUÁRIO
// ============================================
async function inicializarBandeiraUsuario() {
    try {
        console.log('👤 Buscando bandeira do usuário logado...');
        
        const token = localStorage.getItem('access_token');
        
        if (!token) {
            console.warn('⚠️ Usuário não autenticado');
            return false;
        }

        // Decodificar JWT
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userId = payload.user_id;
        
        console.log(`📋 User ID: ${userId}`);

        // Buscar dados do usuário
        const response = await fetch('/back-end/usuarios/api/get_usuarios.php');
        const data = await response.json();
        
        if (!data.success || !data.data || !data.data.usuarios) {
            throw new Error('Formato de resposta inválido');
        }

        const usuarioLogado = data.data.usuarios.find(u => u.id == userId);
        
        if (!usuarioLogado) {
            console.error(`❌ Usuário ${userId} não encontrado`);
            return false;
        }

        console.log('✅ Usuário:', usuarioLogado.nome);
        console.log('🏪 Bandeira:', usuarioLogado.bandeira);

        usuarioBandeiraId = parseInt(usuarioLogado.bandeira);
        
        if (!usuarioBandeiraId || isNaN(usuarioBandeiraId)) {
            console.error('❌ Bandeira inválida');
            return false;
        }

        // Buscar nome da bandeira
        const resBandeira = await fetch('/back-end/bandeiras/api/get_bandeiras.php');
        const bandeiras = await resBandeira.json();
        const bandeira = bandeiras.find(b => b.id == usuarioBandeiraId);
        
        if (bandeira) {
            usuarioBandeiraNome = bandeira.nome;
            console.log(`✅ Bandeira configurada: ${usuarioBandeiraNome} (ID: ${usuarioBandeiraId})`);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao carregar bandeira do usuário:', error);
        return false;
    }
}

// ===========================================
// FUNÇÕES DE RENDERIZAÇÃO E SELEÇÃO DE PRODUTOS
// ===========================================

function renderizarTabelaProdutos(produtosList) {
    const tbody = document.getElementById('tabela-produtos-body');
    tbody.innerHTML = '';
    
    produtosList.forEach(produto => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                ${produto.imagem_url ? 
                    `<img src="${produto.imagem_url}" alt="${produto.nome}" class="tr-small-image" 
                        onerror="this.style.display='none'">` :
                    '<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px; display: none; align-items: center; justify-content: center; font-size: 10px; color: #999;">Sem img</div>'
                }
            </td>
            <td>${produto.nome}</td>
            <td>${produto.subtitulo || 'N/A'}</td>
            <td>${produto.tarjado || 'Não'}</td>
            <td>${produto.principio_ativo || 'N/A'}</td>
            <td>${produto.fabricante || 'N/A'}</td>
            <td>${produto.ean || 'N/A'}</td>
            <td>${produto.quantidade_uso || 0}</td>
            <td>
                <input type="checkbox" 
                    data-produto-id="${produto.id}" 
                    onchange="selecionarProduto(${produto.id}, this.checked)"
                    ${produtosSelecionados.some(p => p.id === produto.id) ? 'checked' : ''}>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function selecionarProduto(produtoId, selecionado) {
    const produto = produtos.find(p => p.id === produtoId);
    
    if (selecionado) {
        // Verificar se já atingiu o máximo
        if (produtosSelecionados.length >= maxSelecionados) {
            alert(`Máximo de ${maxSelecionados} produto${maxSelecionados > 1 ? 's' : ''} permitido${maxSelecionados > 1 ? 's' : ''}`);
            const checkbox = document.querySelector(`input[data-produto-id="${produtoId}"]`);
            checkbox.checked = false;
            return;
        }
        
        // Adicionar produto selecionado
        produtosSelecionados.push(produto);
        
        // Verificar se atingiu o máximo e finalizar automaticamente
        if (produtosSelecionados.length === maxSelecionados) {
            // Dar um pequeno delay para mostrar a seleção visualmente
            setTimeout(() => {
                finalizarSelecaoAutomatica();
            }, 500);
        }
    } else {
        // Remover produto selecionado
        const index = produtosSelecionados.findIndex(p => p.id === produtoId);
        if (index > -1) {
            produtosSelecionados.splice(index, 1);
        }
    }
    
    atualizarContadorSelecao();
}

function atualizarContadorSelecao() {
    const contador = document.getElementById('contador-selecao');
    const statusContainer = document.getElementById('status-selecao');
    
    if (produtosSelecionados.length === maxSelecionados) {
        // Seleção completa
        contador.innerHTML = `
            <span style="color: #28a745; font-weight: bold;">
                ${produtosSelecionados.length}/${maxSelecionados} selecionados ✅ Completo!
            </span>
        `;
        statusContainer.style.background = '#d4edda';
        statusContainer.style.border = '1px solid #28a745';
    } else if (produtosSelecionados.length > 0) {
        // Seleção parcial
        contador.innerHTML = `
            <span style="color: #007bff; font-weight: bold;">
                ${produtosSelecionados.length}/${maxSelecionados} selecionados
            </span>
        `;
        statusContainer.style.background = '#cce7ff';
        statusContainer.style.border = '1px solid #007bff';
    } else {
        // Nenhum selecionado
        contador.textContent = `${produtosSelecionados.length}/${maxSelecionados} selecionados`;
        statusContainer.style.background = '#f8f9fa';
        statusContainer.style.border = '1px solid #dee2e6';
    }
}

function finalizarSelecao() {
    if (produtosSelecionados.length === 0) {
        alert('Selecione pelo menos um produto');
        return;
    }
    
    if (modoEdicao) {
        // Trocar produto
        trocarProdutoExistente(produtosSelecionados[0]);
    } else {
        // Adicionar produtos ao canvas
        adicionarProdutosAoCanvas(produtosSelecionados);
    }
    
    // Fechar popup
    fecharPopup('zk-products-modal');
    
    // Reset
    produtosSelecionados = [];
    tipoTemplateAtual = null;
}

// ===========================================
// NOVA FUNÇÃO: PREPARAR EDIÇÃO SEQUENCIAL
// ===========================================

function prepararEdicaoSequencial(produtos) {
    console.log(`🎯 Preparando edição sequencial para ${produtos.length} produtos`);
    
    // Configurar fila de edição
    filaEdicaoProdutos = [...produtos];
    indiceEdicaoAtual = 0;
    produtosDobannerAtual = [...produtos];
    
    // Não definir produtoRecemAdicionado para produto único
    produtoRecemAdicionado = null;
    
    console.log('📋 Fila de edição preparada:', filaEdicaoProdutos.map(p => p.nome));
}


function finalizarSelecaoAutomatica() {
    // Mostrar feedback visual
    const statusSelecao = document.getElementById('status-selecao');
    const contadorOriginal = statusSelecao.innerHTML;
    
    statusSelecao.classList.add('jx-complete');
    
    if (modoEdicao) {
        statusSelecao.innerHTML = `
            <span style="color: #28a745; font-weight: bold;">
                ✅ Produto selecionado! Fazendo a troca...
            </span>
        `;
        
        // Trocar produto
        trocarProdutoExistente(produtosSelecionados[0]);
    } else {
        statusSelecao.innerHTML = `
            <span style="color: #28a745; font-weight: bold;">
                ✅ Seleção completa! Adicionando produtos...
            </span>
        `;
        
        // CORREÇÃO: Preparar para edição sequencial ANTES de adicionar ao canvas
        if (abrirEditorAutomaticamente && produtosSelecionados.length > 1) {
            console.log(`🎯 Preparando edição sequencial para ${produtosSelecionados.length} produtos`);
            // Configurar fila de edição
            filaEdicaoProdutos = [...produtosSelecionados];
            indiceEdicaoAtual = 0;
            produtosDobannerAtual = [...produtosSelecionados];
            
            console.log('📋 Fila de edição preparada:', filaEdicaoProdutos.map(p => p.nome));
        } else if (abrirEditorAutomaticamente && produtosSelecionados.length === 1) {
            // Lógica original para produto único
            produtoRecemAdicionado = produtosSelecionados[0];
        }
        
        // Adicionar produtos ao canvas
        adicionarProdutosAoCanvas(produtosSelecionados);
    }
    
    // Fechar popup após delay
    setTimeout(() => {
        fecharPopup('zk-products-modal');
        
        // Reset
        produtosSelecionados = [];
        tipoTemplateAtual = null;
        
        // Restaurar contador
        statusSelecao.innerHTML = contadorOriginal;
        statusSelecao.classList.remove('jx-complete');
        statusSelecao.style.background = '#f8f9fa';
        statusSelecao.style.border = '1px solid #dee2e6';
    }, 800);
}
// ===========================================
// FUNÇÕES DE TROCA DE PRODUTOS
// ===========================================

// 🔧 FUNÇÃO MODIFICADA: Trocar produto existente
function trocarProdutoExistente(novoProduto) {
    if (!cardSendoEditado || !novoProduto) return;
    
    // Remover destaque visual
    cardSendoEditado.style.border = '';
    cardSendoEditado.style.boxShadow = '';
    
    // Atualizar o ID do produto no card
    cardSendoEditado.setAttribute('data-produto-id', novoProduto.id);
    
    // Verificar tipo de banner e atualizar adequadamente
    if (cardSendoEditado.classList.contains('combined-banner')) {
        // Banner de 2 produtos
        const secoes = cardSendoEditado.querySelectorAll('.combined-product-section');
        
        if (secoes[posicaoProdutoTroca]) {
            console.log(`✅ Atualizando produto ${posicaoProdutoTroca + 1} no banner combinado`);
            secoes[posicaoProdutoTroca].style.outline = 'none';
            secoes[posicaoProdutoTroca].style.background = 'transparent';
            atualizarSecaoProduto(secoes[posicaoProdutoTroca], novoProduto);
            
            secoes[posicaoProdutoTroca].style.transition = 'all 0.3s ease';
            secoes[posicaoProdutoTroca].style.transform = 'scale(1.05)';
            setTimeout(() => {
                secoes[posicaoProdutoTroca].style.transform = 'scale(1)';
            }, 300);
        }
        
    } else if (cardSendoEditado.classList.contains('four-products-banner')) {
        // Banner de 4 produtos
        const cards = cardSendoEditado.querySelectorAll('.four-product-card');
        
        if (cards[posicaoProdutoTroca]) {
            console.log(`✅ Atualizando produto ${posicaoProdutoTroca + 1} no banner de 4 produtos`);
            cards[posicaoProdutoTroca].style.outline = 'none';
            cards[posicaoProdutoTroca].style.background = 'transparent';
            cards[posicaoProdutoTroca].style.transform = 'scale(1)';
            atualizarCardQuatroProdutos(cards[posicaoProdutoTroca], novoProduto);
            
            cards[posicaoProdutoTroca].style.transition = 'all 0.3s ease';
            cards[posicaoProdutoTroca].style.transform = 'scale(1.08)';
            setTimeout(() => {
                cards[posicaoProdutoTroca].style.transform = 'scale(1)';
            }, 300);
        }
        
    } else if (cardSendoEditado.classList.contains('eight-products-banner')) {
        // 🎯 NOVO: Banner de 8 produtos
        const items = cardSendoEditado.querySelectorAll('.eight-product-item');
        
        if (items[posicaoProdutoTroca]) {
            console.log(`✅ Atualizando produto ${posicaoProdutoTroca + 1} no banner de 8 produtos`);
            
            // Remover destaque visual do item
            items[posicaoProdutoTroca].style.outline = 'none';
            items[posicaoProdutoTroca].style.background = 'rgba(255, 255, 255, 0.9)';
            items[posicaoProdutoTroca].style.transform = 'translateX(0) scale(1)';
            
            // Atualizar apenas o item selecionado
            atualizarItemOitoProdutos(items[posicaoProdutoTroca], novoProduto);
            
            // Adicionar animação de destaque
            items[posicaoProdutoTroca].style.transition = 'all 0.4s ease';
            items[posicaoProdutoTroca].style.transform = 'translateX(12px) scale(1.05)';
            items[posicaoProdutoTroca].style.background = 'rgba(251, 191, 36, 0.2)';
            
            setTimeout(() => {
                items[posicaoProdutoTroca].style.transform = 'translateX(0) scale(1)';
                items[posicaoProdutoTroca].style.background = 'rgba(255, 255, 255, 0.9)';
            }, 400);
        }
        
    } else {
        // Para banner individual
        const cardContent = cardSendoEditado.querySelector('.aw-card-content');
        cardContent.innerHTML = criarConteudoProdutoIndividual(novoProduto);
    }
    
    // Aplicar tema se houver um selecionado
    if (temaSelecionado) {
        cardSendoEditado.style.backgroundImage = `url('${temaSelecionado.imagem_url}')`;
        cardSendoEditado.classList.add('with-theme');
    }
    
    // Adicionar animação de destaque para indicar que foi trocado
    cardSendoEditado.classList.add('produto-recem-adicionado');
    
    console.log(`✅ Produto ${posicaoProdutoTroca + 1} trocado com sucesso:`, novoProduto.nome);
    
    // Resetar posição
    posicaoProdutoTroca = 0;
    
    // Abrir editor automaticamente após a troca
    setTimeout(() => {
        console.log('Abrindo editor automaticamente após troca do produto');
        abrirModalEdicaoAutomaticaAposaTroca(cardSendoEditado, novoProduto);
    }, 500);
}

function abrirModalEdicaoAutomaticaAposaTroca(card, produto) {
    // Configurar o card atual para edição
    cardAtualEdicao = card;
    
    // Preencher os campos com os dados do novo produto
    preencherCamposEditor(produto);
    
    // Mostrar modal
    document.getElementById('modal-precos').style.display = 'flex';
    
    // Focar no primeiro campo para facilitar a edição
    setTimeout(() => {
        document.getElementById('produto-titulo').focus();
    }, 100);
    
    console.log('Editor aberto automaticamente após troca para:', produto.nome);
}

// ===========================================
// FUNÇÃO PRINCIPAL: ADICIONAR PRODUTOS AO CANVAS
// ===========================================

function adicionarProdutosAoCanvas(produtosParaAdicionar) {
    // Esconder preview do tema e botão inicial
    document.getElementById('themePreviewContainer').style.display = 'none';
    document.getElementById('initialAddBtn').style.display = 'none';
    
    // Mostrar área de produtos
    document.getElementById('produtosCanvas').style.display = 'block';
    document.getElementById('canvasContainer').classList.add('mk-has-items');
    
    const grid = document.getElementById('produtos-grid');
    let primeiroCardAdicionado = null;
    
    // Lógica de criação baseada na quantidade de produtos
    if (produtosParaAdicionar.length === 2) {
        // Banner com 2 produtos (vertical)
        const bannerCombinado = criarBannerCombinado(produtosParaAdicionar);
        grid.appendChild(bannerCombinado);
        primeiroCardAdicionado = bannerCombinado;
    } else if (produtosParaAdicionar.length === 4) {
        // Banner com 4 produtos (2x2 grid)
        const bannerQuatroProdutos = criarBannerQuatroProdutos(produtosParaAdicionar);
        grid.appendChild(bannerQuatroProdutos);
        primeiroCardAdicionado = bannerQuatroProdutos;
    } else if (produtosParaAdicionar.length === 8) {
        // Banner com 8 produtos (lista vertical)
        const bannerOitoProdutos = criarBannerOitoProdutos(produtosParaAdicionar);
        grid.appendChild(bannerOitoProdutos);
        primeiroCardAdicionado = bannerOitoProdutos;
    } else {
        // Cards individuais para 1 ou outros números
        produtosParaAdicionar.forEach((produto, index) => {
            const produtoCard = criarCardProduto(produto);
            grid.appendChild(produtoCard);
            
            if (index === 0) {
                primeiroCardAdicionado = produtoCard;
            }
        });
    }
    
    // Aplicar tema se houver um selecionado
    if (temaSelecionado) {
        aplicarTemaAosProdutos(temaSelecionado);
    }
    
    // Atualizar contador
    const totalBanners = grid.children.length;
    const totalProdutos = produtosParaAdicionar.length;
    document.getElementById('contador').textContent = 
        `Exibindo ${totalBanners} banner${totalBanners > 1 ? 's' : ''} com ${totalProdutos} produto${totalProdutos > 1 ? 's' : ''}`;
    
    // CORREÇÃO: Gerenciar edição automática APÓS banner estar criado
    if (abrirEditorAutomaticamente && primeiroCardAdicionado) {
        // Destacar visualmente o banner recém-adicionado
        primeiroCardAdicionado.classList.add('produto-recem-adicionado');
        
        // Salvar referência ao banner atual SEMPRE
        cardBannerAtual = primeiroCardAdicionado;
        
        // Aguardar um momento para dar tempo do usuário ver o banner sendo adicionado
        setTimeout(() => {
            // CORREÇÃO: Verificar se há fila de edição (foi preparada antes)
            if (filaEdicaoProdutos.length > 1) {
                // MÚLTIPLOS PRODUTOS: Iniciar edição sequencial
                console.log(`🎯 Iniciando edição sequencial para ${filaEdicaoProdutos.length} produtos`);
                iniciarEdicaoSequencial();
            } else if (produtosParaAdicionar.length === 1) {
                // PRODUTO ÚNICO: Lógica original
                console.log('🎯 Abrindo editor para produto único');
                abrirModalEdicaoAutomaticaParaBanner(primeiroCardAdicionado, produtosParaAdicionar);
            }
            
            // CORREÇÃO: Resetar variável APENAS DEPOIS de usar
            abrirEditorAutomaticamente = false;
        }, 1000);
    }
}


// ===========================================
// NOVA FUNÇÃO: INICIAR EDIÇÃO SEQUENCIAL
// ===========================================

function iniciarEdicaoSequencial() {
    if (indiceEdicaoAtual >= filaEdicaoProdutos.length) {
        // Terminou a edição de todos os produtos
        finalizarEdicaoSequencial();
        return;
    }
    
    const produtoAtual = filaEdicaoProdutos[indiceEdicaoAtual];
    const numeroAtual = indiceEdicaoAtual + 1;
    const total = filaEdicaoProdutos.length;
    
    console.log(`📝 Editando produto ${numeroAtual}/${total}: ${produtoAtual.nome}`);
    
    // CORREÇÃO: Verificar se cardBannerAtual existe
    if (!cardBannerAtual) {
        console.error('❌ Erro: cardBannerAtual não está definido!');
        finalizarEdicaoSequencial();
        return;
    }
    
    // Configurar o card atual para edição
    cardAtualEdicao = cardBannerAtual;
    
    // Preencher campos com dados do produto atual
    preencherCamposParaProdutoSequencial(produtoAtual, numeroAtual, total);
    
    // Mostrar modal com título personalizado
    atualizarTituloModalSequencial(numeroAtual, total, produtoAtual.nome);
    document.getElementById('modal-precos').style.display = 'flex';
    
    // Focar no primeiro campo
    setTimeout(() => {
        document.getElementById('produto-titulo').focus();
    }, 100);
}

// ===========================================
// NOVA FUNÇÃO: ATUALIZAR TÍTULO DO MODAL
// ===========================================

function atualizarTituloModalSequencial(numeroAtual, total, nomeProduto) {
    const tituloModal = document.querySelector('.dt-modal-title');
    if (tituloModal) {
        tituloModal.innerHTML = `
            Editar Produto ${numeroAtual}/${total}
            <div style="font-size: 12px; color: #666; font-weight: normal; margin-top: 4px;">
                ${nomeProduto}
            </div>
        `;
    }
}

// ===========================================
// NOVA FUNÇÃO: PREENCHER CAMPOS SEQUENCIAL
// ===========================================

function preencherCamposParaProdutoSequencial(produto, numeroAtual, total) {
    // Preencher campos com dados do produto atual
    document.getElementById('produto-titulo').value = produto.nome || '';
    document.getElementById('produto-subtitulo').value = produto.subtitulo || 'Excelente produto especial';
    document.getElementById('preco-original').value = '00,00';
    document.getElementById('preco-promocional').value = '00,00';
    
    // Configurar cores padrão
    document.getElementById('cor-fundo').value = '#fbbf24';
    document.getElementById('cor-texto-preco').value = '#1f2937';
    document.getElementById('cor-titulo').value = '#1f2937';
    
    console.log(`📝 Campos preenchidos para produto ${numeroAtual}/${total}: ${produto.nome}`);
}
// ===========================================
// FUNÇÕES DE CRIAÇÃO DE BANNERS
// ===========================================

// BANNER DE 4 PRODUTOS (2x2 GRID) - CORRIGIDO
function criarBannerQuatroProdutos(produtos) {
    const banner = document.createElement('div');
    banner.className = 'mn-product-tile four-products-banner';
    
    // Configuração do Grid 2x2
    banner.style.cssText = `
        width: 400px;
        height: 500px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 12px;
        padding: 16px;
        position: relative;
        background-size: cover;
        background-position: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    `;
    
    // Definir IDs dos produtos no banner
    const produtoIds = produtos.map(p => p.id).join(',');
    banner.setAttribute('data-produto-ids', produtoIds);
    
    // Ícones de controle
    const iconsHtml = `
        <div class="multi-product-indicator" style="
            position: absolute; 
            top: 8px; 
            left: 8px; 
            background: rgba(0,0,0,0.8); 
            color: white; 
            padding: 4px 8px; 
            border-radius: 12px; 
            font-size: 10px; 
            font-weight: bold; 
            z-index: 10;
        ">
            ${produtos.length} PRODUTOS
        </div>


        <svg class="cp-remove-icon" onclick="removerProduto(this)" viewBox="0 0 20 20" 
            title="Remover produto" style="
            position: absolute; 
            right: 8px; 
            width: 24px; 
            height: 24px; 
            background: rgba(255,255,255,0.9); 
            border-radius: 8px; 
            padding: 4px; 
            cursor: pointer; 
            z-index: 10;
        ">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
    `;
    
    banner.innerHTML = iconsHtml;
    
    // 🎯 NOVO: Criar 4 cards individuais COM EVENT LISTENERS
    produtos.forEach((produto, index) => {
        const produtoCard = criarCardIndividualQuatroProdutos(produto, index);
        
        // 🎯 ADICIONAR EVENT LISTENER PARA DETECTAR CLIQUE
        produtoCard.addEventListener('click', function(e) {
            // Ignorar cliques nos ícones
            if (e.target.closest('.og-edit-icon, .jy-replace-icon, .fl-download-icon, .cp-remove-icon')) {
                return;
            }
            
            // Chamar função de troca com o índice do produto
            iniciarTrocaProdutoEspecificoQuatro(banner, index);
        });
        
        // Adicionar estilo de hover para feedback visual
        produtoCard.style.cursor = 'pointer';
        produtoCard.style.transition = 'all 0.2s ease';
        
        produtoCard.addEventListener('mouseenter', function() {
            this.style.background = 'rgba(255, 193, 7, 0.1)';
            this.style.transform = 'scale(1.02)';
        });
        
        produtoCard.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
            this.style.transform = 'scale(1)';
        });
        
        banner.appendChild(produtoCard);
    });
    
    return banner;
}

// 🎯 NOVA FUNÇÃO: Iniciar troca de produto específico no banner de 4 produtos
function iniciarTrocaProdutoEspecificoQuatro(banner, indice) {
    console.log(`🎯 Iniciando troca do produto ${indice + 1} de 4`);
    
    // Configurar variáveis globais
    cardSendoEditado = banner;
    modoEdicao = true;
    posicaoProdutoTroca = indice;
    
    // Destacar visualmente o banner
    banner.style.border = '3px solid #ffc107';
    banner.style.boxShadow = '0 0 15px rgba(255, 193, 7, 0.5)';
    
    // Destacar visualmente o card sendo trocado
    const cards = banner.querySelectorAll('.four-product-card');
    cards.forEach((card, idx) => {
        if (idx === indice) {
            card.style.outline = '3px solid #ffc107';
            card.style.outlineOffset = '4px';
            card.style.background = 'rgba(255, 193, 7, 0.2)';
            card.style.transform = 'scale(1.05)';
        } else {
            card.style.outline = 'none';
            card.style.background = 'transparent';
            card.style.transform = 'scale(1)';
        }
    });
    
    // Abrir popup de seleção
    document.getElementById('zk-products-modal').style.display = 'flex';
    
    // Configurar para seleção única
    maxSelecionados = 1;
    produtosSelecionados = [];
    
    // Nomes das posições para melhor UX
    const posicoesNomes = ['Superior Esquerdo', 'Superior Direito', 'Inferior Esquerdo', 'Inferior Direito'];
    
    // Atualizar título do popup
    document.getElementById('titulo-produto').innerHTML = 
        `Trocar Produto ${indice + 1} de 4
        <small style="color: #666; font-size: 12px; display: block; font-weight: normal;">
            Posição: ${posicoesNomes[indice]}
        </small>`;
    
    // Carregar produtos
    carregarProdutosParaSelecao();
}

// 🎯 NOVA FUNÇÃO: Abrir popup com menu de seleção para 4 produtos
function abrirPopupTrocaProdutoQuatro(iconElement, event) {
    event.stopPropagation();
    
    const card = iconElement.closest('.mn-product-tile');
    
    if (!card.classList.contains('four-products-banner')) {
        // Se não é banner de 4 produtos, usar função antiga
        editarProduto(iconElement, event);
        return;
    }
    
    // Criar popup de seleção em GRID 2x2
    const popup = document.createElement('div');
    popup.className = 'product-selection-popup-four';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 10000;
        min-width: 400px;
    `;
    
    popup.innerHTML = `
        <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1f2937; text-align: center;">
            Qual produto deseja trocar?
        </h3>
        
        <!-- Grid 2x2 de botões -->
        <div style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 12px;
            margin-bottom: 16px;
        ">
            <!-- Produto 1 - Superior Esquerdo -->
            <button onclick="selecionarProdutoParaTrocaQuatro(this, 0)" 
                    style="
                        padding: 20px;
                        background: linear-gradient(135deg, #fbbf24, #f59e0b);
                        color: #1f2937;
                        border: none;
                        border-radius: 8px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.2s;
                        font-size: 14px;
                    "
                    onmouseover="this.style.transform='scale(1.05)'"
                    onmouseout="this.style.transform='scale(1)'">
                <div style="font-size: 24px; margin-bottom: 4px;">↖️</div>
                Produto 1<br>
                <small style="font-size: 10px; opacity: 0.8;">Superior Esq.</small>
            </button>
            
            <!-- Produto 2 - Superior Direito -->
            <button onclick="selecionarProdutoParaTrocaQuatro(this, 1)" 
                    style="
                        padding: 20px;
                        background: linear-gradient(135deg, #fbbf24, #f59e0b);
                        color: #1f2937;
                        border: none;
                        border-radius: 8px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.2s;
                        font-size: 14px;
                    "
                    onmouseover="this.style.transform='scale(1.05)'"
                    onmouseout="this.style.transform='scale(1)'">
                <div style="font-size: 24px; margin-bottom: 4px;">↗️</div>
                Produto 2<br>
                <small style="font-size: 10px; opacity: 0.8;">Superior Dir.</small>
            </button>
            
            <!-- Produto 3 - Inferior Esquerdo -->
            <button onclick="selecionarProdutoParaTrocaQuatro(this, 2)" 
                    style="
                        padding: 20px;
                        background: linear-gradient(135deg, #fbbf24, #f59e0b);
                        color: #1f2937;
                        border: none;
                        border-radius: 8px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.2s;
                        font-size: 14px;
                    "
                    onmouseover="this.style.transform='scale(1.05)'"
                    onmouseout="this.style.transform='scale(1)'">
                <div style="font-size: 24px; margin-bottom: 4px;">↙️</div>
                Produto 3<br>
                <small style="font-size: 10px; opacity: 0.8;">Inferior Esq.</small>
            </button>
            
            <!-- Produto 4 - Inferior Direito -->
            <button onclick="selecionarProdutoParaTrocaQuatro(this, 3)" 
                    style="
                        padding: 20px;
                        background: linear-gradient(135deg, #fbbf24, #f59e0b);
                        color: #1f2937;
                        border: none;
                        border-radius: 8px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.2s;
                        font-size: 14px;
                    "
                    onmouseover="this.style.transform='scale(1.05)'"
                    onmouseout="this.style.transform='scale(1)'">
                <div style="font-size: 24px; margin-bottom: 4px;">↘️</div>
                Produto 4<br>
                <small style="font-size: 10px; opacity: 0.8;">Inferior Dir.</small>
            </button>
        </div>
        
        <button onclick="fecharPopupSelecaoQuatro()" 
                style="
                    width: 100%;
                    padding: 10px;
                    background: #e5e7eb;
                    color: #6b7280;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                "
                onmouseover="this.style.background='#d1d5db'"
                onmouseout="this.style.background='#e5e7eb'">
            Cancelar
        </button>
    `;
    
    // Adicionar overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay-four';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
    `;
    overlay.onclick = fecharPopupSelecaoQuatro;
    
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    
    // Salvar referência ao card
    window.cardParaTrocaQuatro = card;
}

// 🎯 FUNÇÃO: Selecionar produto para troca (4 produtos)
function selecionarProdutoParaTrocaQuatro(button, indice) {
    const card = window.cardParaTrocaQuatro;
    fecharPopupSelecaoQuatro();
    
    if (card) {
        iniciarTrocaProdutoEspecificoQuatro(card, indice);
    }
}

// 🎯 FUNÇÃO: Fechar popup de seleção (4 produtos)
function fecharPopupSelecaoQuatro() {
    const popup = document.querySelector('.product-selection-popup-four');
    const overlay = document.querySelector('.popup-overlay-four');
    
    if (popup) popup.remove();
    if (overlay) overlay.remove();
    
    window.cardParaTrocaQuatro = null;
}

function criarCardIndividualQuatroProdutos(produto, index) {
    const produtoCard = document.createElement('div');
    produtoCard.className = `four-product-card produto-posicao-${index}`;
    
    // Definir margin-top baseado no índice
    const marginTop = (index === 0 || index === 1) ? '130px' : 
                    (index === 2 || index === 3) ? '-60px' : '0px' ;

    // Flex-direction específico por índice
    let flexDirection;
    if (index === 0 || index === 3) {
        flexDirection = 'row';
    } else if (index === 1 || index === 2) {
        flexDirection = 'column';
    } else {
        flexDirection = 'column';
    }

    let textAlign;
    if(index === 0 || index === 3) {
        textAlign = 'left';
    } else if (index === 1 || index === 2) {
        textAlign = 'center';
    } else {
        textAlign = 'left';
    }

    let marginLeft;
    if (index === 0 || index === 3) {
        marginLeft = '0px';
    } else {
        marginLeft = '0px';
    }
    
    // CORREÇÃO: CSS completo com todas as propriedades necessárias + position relative
    produtoCard.style.cssText = `
        display: flex;
        flex-direction: ${flexDirection};
        margin-left: ${marginLeft};
        align-items: center;
        justify-content: left;
        text-align: ${textAlign};
        padding: 12px 8px;
        position: relative;
        min-height: 180px;
        margin-top: ${marginTop};
        width: 180px;
    `;
    
    // Conteúdo do produto
    produtoCard.innerHTML = criarConteudoQuatroProdutos(produto, index);
    
    return produtoCard;
}

// 🎯 NOVA FUNÇÃO: Editar produto individual no banner de 4 produtos
function editarProdutoIndividualQuatro(event, indice) {
    event.stopPropagation();
    
    // Encontrar o banner pai
    const banner = event.target.closest('.four-products-banner');
    if (!banner) return;
    
    console.log(`✏️ Editando produto ${indice + 1} do banner de 4 produtos`);
    
    // Configurar variáveis globais
    cardAtualEdicao = banner;
    posicaoProdutoTroca = indice;
    
    // Destacar visualmente o card sendo editado
    const cards = banner.querySelectorAll('.four-product-card');
    cards.forEach((card, idx) => {
        if (idx === indice) {
            card.style.outline = '3px solid #3b82f6';
            card.style.outlineOffset = '4px';
            card.style.background = 'rgba(59, 130, 246, 0.1)';
            card.style.transform = 'scale(1.05)';
        } else {
            card.style.outline = 'none';
            card.style.background = 'transparent';
            card.style.transform = 'scale(1)';
        }
    });
    
    // Obter dados do card específico
    const cardEscolhido = cards[indice];
    const titulo = cardEscolhido.querySelector('.rw-product-title').textContent;
    const subtitulo = cardEscolhido.querySelector('.ds-product-subtitle').textContent;
    const precoOriginal = cardEscolhido.querySelector('.preco-original-valor').textContent;
    const precoPromocional = cardEscolhido.querySelector('.preco-promocional-valor').textContent;
    
    // Preencher campos do formulário
    document.getElementById('produto-titulo').value = titulo;
    document.getElementById('produto-subtitulo').value = subtitulo;
    document.getElementById('preco-original').value = precoOriginal;
    document.getElementById('preco-promocional').value = precoPromocional;
    
    // Obter cores atuais
    const precoPromoElement = cardEscolhido.querySelector('.wp-promo-price');
    const tituloElement = cardEscolhido.querySelector('.rw-product-title');
    
    const corFundo = getComputedStyle(precoPromoElement).backgroundColor;
    const corTextoPreco = getComputedStyle(precoPromoElement).color;
    const corTitulo = getComputedStyle(tituloElement).color;
    
    document.getElementById('cor-fundo').value = rgbToHex(corFundo) || '#fbbf24';
    document.getElementById('cor-texto-preco').value = rgbToHex(corTextoPreco) || '#1f2937';
    document.getElementById('cor-titulo').value = rgbToHex(corTitulo) || '#1f2937';
    
    // Nomes das posições para melhor UX
    const posicoesNomes = ['Superior Esquerdo', 'Superior Direito', 'Inferior Esquerdo', 'Inferior Direito'];
    
    // Atualizar título do modal
    const tituloModal = document.querySelector('.dt-modal-title');
    if (tituloModal) {
        tituloModal.innerHTML = `
            Editar Produto ${indice + 1} de 4
            <div style="font-size: 12px; color: #666; font-weight: normal; margin-top: 4px;">
                ${posicoesNomes[indice]} - ${titulo}
            </div>
        `;
    }
    
    // Mostrar modal
    document.getElementById('modal-precos').style.display = 'flex';
    document.getElementById('preco-original').focus();
}

// 🎯 NOVA FUNÇÃO: Trocar produto individual no banner de 4 produtos
function trocarProdutoIndividualQuatro(event, indice) {
    event.stopPropagation();
    
    // Encontrar o banner pai
    const banner = event.target.closest('.four-products-banner');
    if (!banner) return;
    
    console.log(`🔄 Trocando produto ${indice + 1} do banner de 4 produtos`);
    
    // Usar a função existente
    iniciarTrocaProdutoEspecificoQuatro(banner, indice);
}

function criarConteudoQuatroProdutos(produto, index) {
    // CORREÇÃO: Declarar corretamente o elemento banner
    const banner = document.createElement('div');
    banner.className = 'mn-product-tile four-products-banner';
    
    // Definir margin-top baseado no índice
    const marginTop = (index === 0 || index === 1) ? '130px' : 
                    (index === 2 || index === 3) ? '-60px' : '0px' ;

    // Flex-direction específico por índice
    let flexDirection;
    if (index === 0 || index === 3) {
        flexDirection = 'row';        // Cards 0 e 3: vertical
    } else if (index === 1 || index === 2) {
        flexDirection = 'column';     // Cards 1 e 2: horizontal  
    } else {
        flexDirection = 'column';     // Fallback
    }

    let textAlign;
    if(index === 0 || index === 3) {
        textAlign = 'left';           // Cards 0 e 3: vertical
    } else if (index === 1 || index === 2) {
        textAlign = 'center';         // Cards 1 e 2: horizontal  
    } else {
        textAlign = 'left';           // Fallback
    }

    let marginLeft;
    if (index === 0 || index === 3) {
        marginLeft = '0px';
    } else {
        marginLeft = '0px';
    }
    
    // Layout diferente para cards 1 e 2 (lado a lado) vs 0 e 3 (empilhado)
    const isHorizontalLayout = (index === 1 || index === 2);
    
    return `
        <!-- 🎯 NOVOS ÍCONES INDIVIDUAIS POR PRODUTO -->
        <div class="product-individual-controls-four" style="
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            gap: 4px;
            z-index: 5;
        ">
            <!-- Ícone de Editar -->
            <button class="action-btn edit-btn" onclick="editarProdutoIndividualQuatro(event, ${index})" title="Editar">
                <img src="assets/editar_cinza.png" width="22px">
            </button>

            <!-- Ícone de Trocar -->
            <button onclick="trocarProdutoIndividualQuatro(event, ${index})" 
                    class="product-replace-btn-four"
                    title="Trocar produto ${index + 1}"
                    style="
                        width: 24px;
                        height: 24px;
                        background: rgba(251, 191, 36, 0.95);
                        border: none;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    "
                    onmouseover="this.style.background='rgba(245, 158, 11, 1)'; this.style.transform='scale(1.15)'"
                    onmouseout="this.style.background='rgba(251, 191, 36, 0.95)'; this.style.transform='scale(1)'">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="#1f2937">
                    <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
                </svg>
            </button>
        </div>

        <div class="hr-image-area" style="
            width: 70px; 
            height: 120px; 
            margin-bottom: 8px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            ${produto.imagem_url ? `
                <img src="${produto.imagem_url}"
                    alt="${produto.nome}"
                    class="nf-product-image"
                    style="
                        object-fit: cover; 
                        border-radius: 6px;
                    "
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="yt-no-image" style="
                    display: none;
                    width: 100%;
                    height: 100%;
                    background: #e9ecef;
                    align-items: center;
                    justify-content: center;
                    color: #6c757d;
                    font-size: 10px;
                ">Sem img</div>
            ` : `
                <div class="yt-no-image" style="
                    width: 100%;
                    height: 100%;
                    background: #e9ecef;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6c757d;
                    font-size: 10px;
                ">Sem img</div>
            `}
        </div>

        <div class="qm-info-area" style="
            flex: 1; 
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        ">
            <!-- Container para título e preço lado a lado (apenas cards 1 e 2) -->
            <div style="
                display: flex;
                ${isHorizontalLayout ? 'flex-direction: row; justify-content: space-between; align-items: flex-start;' : 'flex-direction: column;'}
                margin-left: 20px;
                margin-top: -30px;
            ">
                <div style="flex: 1;">
                    <h3 class="rw-product-title" style="
                        font-family: 'Montserrat', sans-serif !important;
                        font-size: 9px; 
                        margin-bottom: 4px; 
                        line-height: 0.8; 
                        font-weight: 700 !important;
                        color: #1f2937;
                        text-overflow: ellipsis;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        text-align: left;
                    ">
                        ${produto.nome}
                    </h3>
                                        
                    <p class="ds-product-subtitle" style="
                        font-size: 8px; 
                        margin-bottom: 8px; 
                        color: #6b7280; 
                        line-height: 0.8;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        text-align: left;
                        height: 20px;
                    ">${produto.subtitulo || 'Excelente produto especial'}</p>
                </div>

                <!-- Preço (ao lado direito para cards 1 e 2) -->
                <div class="kb-price-container" style="${isHorizontalLayout ? 'margin-left: 10px;' : 'margin-top: auto;'}">
                    <div class="lm-original-price" style="
                        font-size: 8px; 
                        color: #1f2937; 
                        margin-bottom: 3px;
                        text-align: ${isHorizontalLayout ? 'right' : 'left'} !important;
                        margin-top: -8px;
                    ">
                        <span style="font-size: 7px; font-weight: normal;">de:</span>
                        <span class="preco-original-valor">00,00</span>
                    </div>
                    
                    <div class="wp-promo-price" style="
                        background: #fbbf24; 
                        color: #1f2937; 
                        font-family: 'Posterama2001'; 
                        display: flex; 
                        align-items: flex-start;
                        gap: 4px;
                        padding: 3px 8px; 
                        border-radius: 6px;
                        width: fit-content;
                        ${isHorizontalLayout ? 'margin-left: auto;' : ''}
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    ">
                        <!-- Coluna Esquerda: "por" e "R$" -->
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 1px;">
                            <span style="font-size: 7px; font-weight: normal;">por</span>
                            <span style="font-size: 8px; font-weight: bold;">R$</span>
                        </div>
                        
                        <!-- Coluna Direita: Preço -->
                        <div style="display: flex; align-items: flex-start; gap: 1px;">
                            <span class="preco-promocional-valor preco-reais" style="font-size: 16px; font-weight: bold; line-height: 1;">00</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
function converter() {
    // Verificar se há produtos no canvas
    const grid = document.getElementById('produtos-grid');
    if (!grid || grid.children.length === 0) {
        alert('Nenhum produto para converter. Adicione produtos primeiro.');
        return;
    }
    
    // Array para armazenar os produtos a serem enviados
    const produtosParaEnviar = [];
    
    // Iterar sobre todos os banners no grid
    Array.from(grid.children).forEach(banner => {
        if (banner.classList.contains('combined-banner')) {
            // Banner de 2 produtos
            const secoes = banner.querySelectorAll('.combined-product-section');
            secoes.forEach(secao => {
                const produto = extrairDadosSecao(secao);
                if (produto) produtosParaEnviar.push(produto);
            });
            
        } else if (banner.classList.contains('four-products-banner')) {
            // Banner de 4 produtos
            const cards = banner.querySelectorAll('.four-product-card');
            cards.forEach(card => {
                const produto = extrairDadosCardQuatro(card);
                if (produto) produtosParaEnviar.push(produto);
            });
            
        } else if (banner.classList.contains('eight-products-banner')) {
            // Banner de 8 produtos
            const items = banner.querySelectorAll('.eight-product-item');
            items.forEach(item => {
                const produto = extrairDadosItemOito(item);
                if (produto) produtosParaEnviar.push(produto);
            });
            
        } else {
            // Banner individual (1 produto)
            const produto = extrairDadosBannerIndividual(banner);
            if (produto) produtosParaEnviar.push(produto);
        }
    });
    
    // Verificar se encontrou produtos
    if (produtosParaEnviar.length === 0) {
        alert('Nenhum produto válido encontrado para converter.');
        return;
    }
    
    // Limitar a 24 produtos (tamanho máximo dos slots)
    if (produtosParaEnviar.length > 24) {
        if (!confirm(`Você tem ${produtosParaEnviar.length} produtos, mas apenas os primeiros 24 serão enviados. Deseja continuar?`)) {
            return;
        }
        produtosParaEnviar.splice(24); // Manter apenas os primeiros 24
    }
    
    console.log(`✅ Convertendo ${produtosParaEnviar.length} produtos para precificadores`);
    
    // Criar URL com os dados
    const url = construirURLPrecificadores(produtosParaEnviar);
    
    // Redirecionar para a página de precificadores
    window.location.href = url;
}

// ========== FUNÇÕES AUXILIARES PARA EXTRAIR DADOS ==========
function extrairDadosSecao(secao) {
    try {
        const titulo = secao.querySelector('.rw-product-title')?.textContent.trim() || '';
        const subtitulo = secao.querySelector('.ds-product-subtitle')?.textContent.trim() || ''; // ✅ CORRIGIDO
        const preco = secao.querySelector('.preco-promocional-valor')?.textContent.trim() || '0,00';
        
        if (!titulo) return null;
        
        console.log('📦 Extraindo seção:', { titulo, subtitulo, preco }); // ✅ LOG DE DEBUG
        
        return {
            titulo: titulo,
            subtitulo: subtitulo,
            preco: preco
        };
    } catch (error) {
        console.error('Erro ao extrair dados da seção:', error);
        return null;
    }
}

function extrairDadosCardQuatro(card) {
    try {
        const titulo = card.querySelector('.rw-product-title')?.textContent.trim() || '';
        const subtitulo = card.querySelector('.ds-product-subtitle')?.textContent.trim() || ''; // ✅ CORRIGIDO
        const preco = card.querySelector('.preco-promocional-valor')?.textContent.trim() || '0,00';
        
        if (!titulo) return null;
        
        console.log('📦 Extraindo card 4:', { titulo, subtitulo, preco }); // ✅ LOG DE DEBUG
        
        return {
            titulo: titulo,
            subtitulo: subtitulo,
            preco: preco
        };
    } catch (error) {
        console.error('Erro ao extrair dados do card de 4:', error);
        return null;
    }
}

function extrairDadosItemOito(item) {
    try {
        const titulo = item.querySelector('.rw-product-title')?.textContent.trim() || '';
        const subtitulo = item.querySelector('.ds-product-subtitle')?.textContent.trim() || ''; // ✅ CORRIGIDO
        const preco = item.querySelector('.preco-promocional-valor')?.textContent.trim() || '0,00';
        
        if (!titulo) return null;
        
        console.log('📦 Extraindo item 8:', { titulo, subtitulo, preco }); // ✅ LOG DE DEBUG
        
        return {
            titulo: titulo,
            subtitulo: subtitulo,
            preco: preco
        };
    } catch (error) {
        console.error('Erro ao extrair dados do item de 8:', error);
        return null;
    }
}

function extrairDadosBannerIndividual(banner) {
    try {
        const titulo = banner.querySelector('.rw-product-title')?.textContent.trim() || '';
        const subtitulo = banner.querySelector('.ds-product-subtitle')?.textContent.trim() || ''; // ✅ CORRIGIDO
        const preco = banner.querySelector('.preco-promocional-valor')?.textContent.trim() || '0,00';
        
        if (!titulo) return null;
        
        console.log('📦 Extraindo banner individual:', { titulo, subtitulo, preco }); // ✅ LOG DE DEBUG
        
        return {
            titulo: titulo,
            subtitulo: subtitulo,
            preco: preco
        };
    } catch (error) {
        console.error('Erro ao extrair dados do banner individual:', error);
        return null;
    }
}

function construirURLPrecificadores(produtos) {
    const params = new URLSearchParams();
    
    produtos.forEach((produto, index) => {
        params.append(`produto_${index}_titulo`, produto.titulo);
        params.append(`produto_${index}_subtitulo`, produto.subtitulo || ''); // ✅ JÁ ESTAVA CORRETO
        params.append(`produto_${index}_preco`, produto.preco);
    });
    
    params.append('total_produtos', produtos.length);
    
    console.log('📤 URL gerada:', `precificadores_P-01.html?${params.toString()}`); // ✅ LOG DE DEBUG
    
    return `precificadores_P-01.html?${params.toString()}`;
}



// BANNER COMBINADO (2 PRODUTOS VERTICAIS)
function criarBannerCombinado(produtos) {
    const banner = document.createElement('div');
    banner.className = 'mn-product-tile combined-banner';
    
    // Estilos para layout vertical
    banner.style.flexDirection = 'column';
    banner.style.height = '500px';
    banner.style.width = '400px';
    
    // Definir IDs dos produtos no banner
    const produtoIds = produtos.map(p => p.id).join(',');
    banner.setAttribute('data-produto-ids', produtoIds);
    
    // Ícones de controle
    const iconsHtml = `
        <div class="multi-product-indicator">
            ${produtos.length} PRODUTOS
        </div>

        <svg class="jy-replace-icon" onclick="abrirPopupTrocaProduto(this, event)" viewBox="0 0 20 20" title="Trocar produto">
            <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
        </svg>

        <svg class="fl-download-icon" onclick="downloadCard(this)" viewBox="0 0 20 20" title="Baixar para Instagram">
            <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
        </svg>

        <svg class="cp-remove-icon" onclick="removerProduto(this)" viewBox="0 0 20 20" title="Remover produto">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
    `;
    
    banner.innerHTML = iconsHtml;
    
    // Criar seções para cada produto COM EVENT LISTENERS
    produtos.forEach((produto, index) => {
        const secaoProduto = document.createElement('div');
        secaoProduto.className = 'combined-product-section';
        secaoProduto.innerHTML = criarConteudoProdutoCombinado(produto, index);
        
        // 🎯 ADICIONAR EVENT LISTENER PARA DETECTAR CLIQUE
        secaoProduto.addEventListener('click', function(e) {
            // Ignorar cliques nos ícones
            if (e.target.closest('.og-edit-icon, .jy-replace-icon, .fl-download-icon, .cp-remove-icon')) {
                return;
            }
            
            // Chamar função de troca com o índice do produto
            iniciarTrocaProdutoEspecifico(banner, index);
        });
        
        // Adicionar estilo de hover para feedback visual
        secaoProduto.style.cursor = 'pointer';
        secaoProduto.style.transition = 'background 0.2s ease';
        
        secaoProduto.addEventListener('mouseenter', function() {
            this.style.background = 'rgba(255, 193, 7, 0.1)';
        });
        
        secaoProduto.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
        });
        
        banner.appendChild(secaoProduto);
    });
    
    return banner;
}

function iniciarTrocaProdutoEspecifico(banner, indice) {
    console.log(`🎯 Iniciando troca do produto ${indice + 1}`);
    
    // Configurar variáveis globais
    cardSendoEditado = banner;
    modoEdicao = true;
    posicaoProdutoTroca = indice;
    
    // Destacar visualmente o banner
    banner.style.border = '3px solid #ffc107';
    banner.style.boxShadow = '0 0 15px rgba(255, 193, 7, 0.5)';
    
    // Destacar visualmente a seção sendo trocada
    const secoes = banner.querySelectorAll('.combined-product-section');
    secoes.forEach((secao, idx) => {
        if (idx === indice) {
            secao.style.outline = '3px solid #ffc107';
            secao.style.outlineOffset = '4px';
            secao.style.background = 'rgba(255, 193, 7, 0.2)';
        } else {
            secao.style.outline = 'none';
            secao.style.background = 'transparent';
        }
    });
    
    // Abrir popup de seleção
    document.getElementById('zk-products-modal').style.display = 'flex';
    
    // Configurar para seleção única
    maxSelecionados = 1;
    produtosSelecionados = [];
    
    // Atualizar título do popup
    document.getElementById('titulo-produto').innerHTML = 
        `Trocar Produto ${indice + 1} de 2
        <small style="color: #666; font-size: 12px; display: block; font-weight: normal;">
            Selecione o novo produto para substituir
        </small>`;
    
    // Carregar produtos
    carregarProdutosParaSelecao();
}

function criarConteudoProdutoCombinado(produto, index) {
    const marginTop = index === 0 ? '75px' : '-35px';
    const layoutClass = index === 1 ? 'layout-invertido' : '';

    return `
        <div class="aw-card-content ${layoutClass}" 
             data-product-index="${index}"
             style="width: 340px; height: 180px; margin-top: ${marginTop}; position: relative;">
            
            <!-- 🎯 NOVOS ÍCONES INDIVIDUAIS POR PRODUTO -->
            <div class="product-individual-controls" style="
                position: absolute;
                top: 8px;
                right: 8px;
                display: flex;
                gap: 6px;
                z-index: 5;
            ">
                <!-- Ícone de Editar -->
                <button class="action-btn edit-btn" onclick="editarProdutoIndividualDois(event, ${index})" title="Editar">
                    <img src="assets/editar_cinza.png" width="22px">
                </button>

                <!-- Ícone de Trocar -->
                <button onclick="trocarProdutoIndividualDois(event, ${index})" 
                        class="product-replace-btn"
                        title="Trocar produto"
                        style="
                            width: 28px;
                            height: 28px;
                            background: rgba(251, 191, 36, 0.95);
                            border: none;
                            border-radius: 50%;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: all 0.2s ease;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        "
                        onmouseover="this.style.background='rgba(245, 158, 11, 1)'; this.style.transform='scale(1.1)'"
                        onmouseout="this.style.background='rgba(251, 191, 36, 0.95)'; this.style.transform='scale(1)'">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="#1f2937">
                        <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
                    </svg>
                </button>
            </div>

            <div class="hr-image-area" style="width: 120px; height: 120px; position: relative; z-index: 2;">
                ${produto.imagem_url ?
                    `<img src="${produto.imagem_url}"
                        alt="${produto.nome}"
                        class="nf-product-image"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="yt-no-image" style="display: none;">Sem imagem disponível</div>` :
                    `<div class="yt-no-image">Sem imagem disponível</div>`
                }
            </div>

            <div class="qm-info-area" style="position: relative; z-index: 2;">
                <h3 class="rw-product-title" style=" font-family: 'Montserrat'!important, font-weight: 700 !important,font-size: 14px; margin-bottom: 8px;">${produto.nome}</h3>
                <p class="ds-product-subtitle" style="font-size: 13px; margin-bottom: 1spx; text-align: left;">${produto.subtitulo || 'Excelente produto especial'}</p>

                <div class="kb-price-container">
                    <div class="lm-original-price" style="font-size: 11px; color: #1f2937; margin-bottom: 4px;">
                        <span style="font-size: 10px; font-weight: normal;">de:</span>
                        <span class="preco-original-valor">00,00</span>
                    </div>
                    
                    <div class="wp-promo-price" style="
                        background: #fbbf24; 
                        color: #1f2937; 
                        font-family: 'Posterama2001'; 
                        display: flex; 
                        align-items: flex-start;
                        gap: 8px;
                        padding: 4px 10px; 
                        border-radius: 8px;
                        width: fit-content;
                    ">
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
                            <span style="font-size: 10px; font-weight: normal;">por</span>
                            <span style="font-size: 12px; font-weight: bold;">R$</span>
                        </div>
                        
                        <div style="display: flex; align-items: flex-start; gap: 2px;">
                            <span class="preco-promocional-valor preco-reais" style="font-size: 26px; font-weight: bold; line-height: 1;">00</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 🎯 NOVA FUNÇÃO: Trocar produto individual no banner de 2 produtos
function trocarProdutoIndividualDois(event, indice) {
    event.stopPropagation();
    
    // Encontrar o banner pai
    const banner = event.target.closest('.combined-banner');
    if (!banner) return;
    
    console.log(`🔄 Trocando produto ${indice + 1} do banner de 2 produtos`);
    
    // Usar a função existente
    iniciarTrocaProdutoEspecifico(banner, indice);
}

// 🎯 NOVA FUNÇÃO: Editar produto individual no banner de 2 produtos
function editarProdutoIndividualDois(event, indice) {
    event.stopPropagation();
    
    // Encontrar o banner pai
    const banner = event.target.closest('.combined-banner');
    if (!banner) return;
    
    console.log(`✏️ Editando produto ${indice + 1} do banner de 2 produtos`);
    
    // Configurar variáveis globais
    cardAtualEdicao = banner;
    posicaoProdutoTroca = indice;
    
    // Destacar visualmente a seção sendo editada
    const secoes = banner.querySelectorAll('.combined-product-section');
    secoes.forEach((secao, idx) => {
        if (idx === indice) {
            secao.style.outline = '3px solid #3b82f6';
            secao.style.outlineOffset = '4px';
            secao.style.background = 'rgba(59, 130, 246, 0.1)';
        } else {
            secao.style.outline = 'none';
            secao.style.background = 'transparent';
        }
    });
    
    // Obter dados da seção específica
    const secaoEscolhida = secoes[indice];
    const titulo = secaoEscolhida.querySelector('.rw-product-title').textContent;
    const subtitulo = secaoEscolhida.querySelector('.ds-product-subtitle').textContent;
    const precoOriginal = secaoEscolhida.querySelector('.preco-original-valor').textContent;
    const precoPromocional = secaoEscolhida.querySelector('.preco-promocional-valor').textContent;
    
    // Preencher campos do formulário
    document.getElementById('produto-titulo').value = titulo;
    document.getElementById('produto-subtitulo').value = subtitulo;
    document.getElementById('preco-original').value = precoOriginal;
    document.getElementById('preco-promocional').value = precoPromocional;
    
    // Obter cores atuais
    const precoPromoElement = secaoEscolhida.querySelector('.wp-promo-price');
    const tituloElement = secaoEscolhida.querySelector('.rw-product-title');
    
    const corFundo = getComputedStyle(precoPromoElement).backgroundColor;
    const corTextoPreco = getComputedStyle(precoPromoElement).color;
    const corTitulo = getComputedStyle(tituloElement).color;
    
    document.getElementById('cor-fundo').value = rgbToHex(corFundo) || '#fbbf24';
    document.getElementById('cor-texto-preco').value = rgbToHex(corTextoPreco) || '#1f2937';
    document.getElementById('cor-titulo').value = rgbToHex(corTitulo) || '#1f2937';
    
    // Atualizar título do modal
    const tituloModal = document.querySelector('.dt-modal-title');
    if (tituloModal) {
        tituloModal.innerHTML = `
            Editar Produto ${indice + 1} de 2
            <div style="font-size: 12px; color: #666; font-weight: normal; margin-top: 4px;">
                ${titulo}
            </div>
        `;
    }
    
    // Mostrar modal
    document.getElementById('modal-precos').style.display = 'flex';
    document.getElementById('preco-original').focus();
}

// 🎯 NOVA FUNÇÃO: Detectar qual produto foi clicado no banner de 2 produtos
function detectarProdutoClicado(event, bannerElement) {
    // Verificar se é um banner combinado
    if (!bannerElement.classList.contains('combined-banner')) {
        return 0; // Produto único ou outro tipo
    }
    
    // Obter todas as áreas clicáveis
    const clickAreas = bannerElement.querySelectorAll('.product-click-area');
    
    // Verificar qual área foi clicada
    for (let i = 0; i < clickAreas.length; i++) {
        if (clickAreas[i].contains(event.target) || clickAreas[i] === event.target) {
            console.log(`🎯 Produto ${i + 1} detectado pelo clique`);
            return i;
        }
    }
    
    // Fallback: detectar pela posição Y do clique
    const rect = bannerElement.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    const metadeAltura = rect.height / 2;
    
    const posicao = clickY < metadeAltura ? 0 : 1;
    console.log(`🎯 Produto ${posicao + 1} detectado pela posição Y`);
    return posicao;
}

// BANNER INDIVIDUAL (1 PRODUTO)
function criarCardProduto(produto) {
    const card = document.createElement('div');
    card.className = 'mn-product-tile';
    card.setAttribute('data-produto-id', produto.id);
    
    card.innerHTML = `
        <svg class="og-edit-icon" onclick="abrirModalPrecos(this)" viewBox="0 0 20 20" title="Editar preços e cores">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
        </svg>

        <svg class="jy-replace-icon" onclick="editarProduto(this)" viewBox="0 0 20 20" title="Trocar produto">
            <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
        </svg>

        <svg class="cp-remove-icon" onclick="removerProduto(this)" viewBox="0 0 20 20" title="Remover produto">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>

        <div class="aw-card-content">
            ${criarConteudoProdutoIndividual(produto)}
        </div>
    `;
    
    return card;
}


function criarConteudoProdutoIndividual(produto) {
    // 🎯 DETECTAR SE É PRODUTO DESTAQUE
    const ehProdutoDestaque = produto.temporario === true || produto.origem === 'destaque';
    
    console.log('🔍 Criando conteúdo para produto:', produto.nome);
    console.log('   temporario:', produto.temporario);
    console.log('   origem:', produto.origem);
    console.log('   ehProdutoDestaque:', ehProdutoDestaque);
    
    // 🎯 BADGE DE DESTAQUE (só aparece se for produto destaque)
    const badgeDestaque = ehProdutoDestaque ? `
        <div class="badge-destaque" style="
            position: absolute;
            top: 12px;
            left: 12px;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            color: #1f2937;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(251, 191, 36, 0.4);
            z-index: 10;
            animation: pulse 2s infinite;
        ">
            <span style="font-size: 14px;"></span> DESTAQUE
        </div>
    ` : '';
    
    // 🎯 AVISO PARA EDITAR (só aparece se for produto destaque)
    const avisoEditar = ehProdutoDestaque ? `
        <div class="aviso-editar" style="
            position: absolute;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(59, 130, 246, 0.95);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            z-index: 10;
            white-space: nowrap;
        ">
            <span style="font-size: 14px;">💡</span>
            Clique no ícone de edição para adicionar preço
        </div>
    ` : '';
    
    return `
        ${badgeDestaque}
        ${avisoEditar}
        
        <div class="hr-image-area" style="width: 140px; height: 140px;">
            ${produto.imagem_url ?
                `<img src="${produto.imagem_url}"
                    alt="${produto.nome}"
                    class="nf-product-image"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="yt-no-image" style="display: none;">Sem imagem disponível</div>` :
                `<div class="yt-no-image">Sem imagem disponível</div>`
            }
        </div>

        <div class="qm-info-area">
            <h3 class="rw-product-title">${produto.nome}</h3>
            <p class="ds-product-subtitle">${produto.subtitulo || 'Excelente produto especial'}</p>

            <div class="kb-price-container">
                <div class="lm-original-price" style="font-size: 11px; color: #1f2937; margin-bottom: 4px;">
                    <span style="font-size: 10px; font-weight: normal;">de:</span>
                    <span class="preco-original-valor">00,00</span>
                </div>
                
                <div class="wp-promo-price" style="
                    background: #fbbf24; 
                    color: #1f2937; 
                    font-family: 'Posterama2001'; 
                    display: flex; 
                    align-items: flex-start;
                    gap: 8px;
                    padding: 4px 10px; 
                    border-radius: 8px;
                    width: fit-content;
                ">
                    <!-- Coluna Esquerda: "por" e "R$" -->
                    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
                        <span style="font-size: 10px; font-weight: normal;">por</span>
                        <span style="font-size: 12px; font-weight: bold;">R$</span>
                    </div>
                    
                    <!-- Coluna Direita: Preço -->
                    <div style="display: flex; align-items: flex-start; gap: 2px;">
                        <span class="preco-promocional-valor preco-reais" style="font-size: 26px; font-weight: bold; line-height: 1;">00,00</span>
                    </div>
                </div>
            </div>
            
        </div>
    `;
}


// ========== RECEBER PRODUTO DESTAQUE E RENDERIZAR NO CANVAS ==========

function receberProdutoDestaque() {
    console.log('🚀 receberProdutoDestaque() INICIADA');
    console.log('📍 URL:', window.location.href);
    
    // 1️⃣ PRIORIDADE: Verificar window.dadosProdutoDestaque
    if (window.dadosProdutoDestaque) {
        console.log('✅ Dados encontrados em window.dadosProdutoDestaque');
        console.log('📦 Dados:', window.dadosProdutoDestaque);
        
        processarProdutoDestaque(window.dadosProdutoDestaque);
        
        // Limpar dados
        delete window.dadosProdutoDestaque;
        sessionStorage.removeItem('produtoDestaque');
        
        return;
    }
    
    // 2️⃣ FALLBACK: Verificar sessionStorage diretamente
    const dadosSalvos = sessionStorage.getItem('produtoDestaque');
    
    if (dadosSalvos) {
        console.log('✅ Dados encontrados no sessionStorage (fallback)');
        
        try {
            const dados = JSON.parse(dadosSalvos);
            console.log('📦 Dados recuperados:', dados);
            
            processarProdutoDestaque(dados);
            
            // Limpar sessionStorage
            sessionStorage.removeItem('produtoDestaque');
            
        } catch (error) {
            console.error('❌ Erro ao parsear sessionStorage:', error);
        }
        
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);

    // ✅ ?img= (tema destaque via banner da home) — mesmo contrato do app do
    // usuário: tema-destaque.js navega para cá passando a imagem do tema.
    const imgParam = urlParams.get('img');
    if (imgParam) {
        console.log('✅ Tema destaque encontrado na URL via ?img=');
        console.log('🖼️ Imagem:', imgParam);
        processarProdutoDestaque({ produto_imagem: imgParam, origem: 'tema_destaque' });
        return;
    }

    // 3️⃣ FALLBACK: Verificar URL (método antigo)
    const origem = urlParams.get('origem');

    if (origem === 'destaque') {
        console.log('✅ Produto na URL (método legado)');
        
        const dados = {
            produto_id: urlParams.get('produto_id'),
            produto_nome: urlParams.get('produto_nome'),
            produto_subtitulo: urlParams.get('produto_subtitulo'),
            produto_imagem: urlParams.get('produto_imagem'),
            produto_ean: urlParams.get('produto_ean'),
            produto_fabricante: urlParams.get('produto_fabricante'),
            produto_principio_ativo: urlParams.get('produto_principio_ativo'),
            origem: 'destaque'
        };
        
        processarProdutoDestaque(dados);
        return;
    }
    
    console.log('❌ Nenhum produto destaque encontrado');
}

function processarProdutoDestaque(dados) {
    console.log('🔧 Processando produto destaque...');
    console.log('📦 Dados recebidos:', dados);

    // ✅ Fluxo para tema destaque (só imagem de fundo, sem produto).
    // Precisa vir ANTES da validação de produto_nome abaixo: aqui não há
    // produto nenhum, só o template que o usuário clicou na home.
    if (dados.origem === 'tema_destaque') {
        console.log('🎨 Origem: tema_destaque — aplicando imagem de fundo');

        if (!dados.produto_imagem) {
            console.error('❌ Imagem do tema não encontrada');
            return;
        }

        const aplicarTema = () => {
            const themeContainer = document.getElementById('themePreviewContainer');
            const initialBtn     = document.getElementById('initialAddBtn');
            const themeTitle     = document.getElementById('themePreviewTitle');
            const themeSubtitle  = document.getElementById('themePreviewSubtitle');

            // o canvas é montado por outro script; se ainda não existe, espera
            if (!themeContainer) {
                console.warn('⏳ themePreviewContainer ainda não existe, aguardando...');
                setTimeout(aplicarTema, 300);
                return;
            }

            themeContainer.style.backgroundImage    = `url('${dados.produto_imagem}')`;
            themeContainer.style.backgroundSize     = 'cover';
            themeContainer.style.backgroundPosition = 'center';
            themeContainer.style.display            = 'flex';

            // vindo do banner não há nome/categoria para mostrar
            if (themeTitle)    themeTitle.style.display    = 'none';
            if (themeSubtitle) themeSubtitle.style.display = 'none';
            if (initialBtn)    initialBtn.style.display    = 'none';

            temaSelecionado = {
                imagem_url:     dados.produto_imagem,
                nome:           '',
                categoria_nome: '',
                bandeira_nome:  ''
            };

            console.log('✅ Tema de fundo aplicado com sucesso!');
        };

        setTimeout(aplicarTema, 500);
        return;
    }

    if (!dados.produto_nome) {
        console.error('❌ Nome do produto não encontrado');
        return;
    }
    
    console.log('✅ Processando produto:', dados.produto_nome);
    
    // 🎯 Criar objeto produto com flags de destaque
    const produtoDestaque = {
        id: dados.produto_id || Date.now(),
        nome: dados.produto_nome,
        subtitulo: dados.produto_subtitulo || 'Produto em destaque',
        imagem_url: dados.produto_imagem || '',
        ean: dados.produto_ean || '',
        fabricante: dados.produto_fabricante || '',
        principio_ativo: dados.produto_principio_ativo || '',
        preco: '0,00',
        preenchido: false,
        temporario: true,      // 🎯 FLAG CRÍTICA
        origem: 'destaque'      // 🎯 FLAG CRÍTICA
    };
    
    console.log('📦 Objeto produto criado:', produtoDestaque);
    console.log('   ✓ temporario:', produtoDestaque.temporario);
    console.log('   ✓ origem:', produtoDestaque.origem);
    
    // 🎯 Adicionar ao canvas
    console.log('➕ Adicionando ao canvas...');
    adicionarProdutosAoCanvas([produtoDestaque]);
    console.log('✅ Produto adicionado ao canvas');
    
    // 🎯 Abrir editor automaticamente após 1.5s
    setTimeout(() => {
        console.log('🔍 Procurando card adicionado...');
        const ultimoCard = document.querySelector('.mn-product-tile:last-child');
        
        if (ultimoCard) {
            console.log('✅ Card encontrado!');
            
            // Remover badge e aviso
            const badge = ultimoCard.querySelector('.badge-destaque');
            const aviso = ultimoCard.querySelector('.aviso-editar');
            
            console.log('   🧹 Badge encontrada:', !!badge);
            console.log('   🧹 Aviso encontrado:', !!aviso);
            
            if (badge) {
                badge.remove();
                console.log('   ✅ Badge removida');
            }
            if (aviso) {
                aviso.remove();
                console.log('   ✅ Aviso removido');
            }
            
            // Abrir modal de preços
            console.log('🚀 Abrindo modal de edição...');
            abrirModalPrecos({ closest: () => ultimoCard });
            
        } else {
            console.error('❌ Card não encontrado no DOM');
            console.log('   Total de cards:', document.querySelectorAll('.mn-product-tile').length);
        }
    }, 1500);
    
    // 🎯 Mostrar notificação de sucesso
    setTimeout(() => {
        mostrarNotificacaoSucesso(dados.produto_nome);
    }, 500);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOMContentLoaded disparado!');
    
    document.querySelectorAll('.ei-template-choice').forEach(option => {
        option.addEventListener('click', function() {
            const tipo = this.getAttribute('data-tipo');
            selecionarTipoTemplate(tipo);
        });
    });
    
    // 🎯 CHAMAR FUNÇÃO DE PRODUTO DESTAQUE
    receberProdutoDestaque();
    
    console.log('✅ Sistema inicializado');
});



// ===========================================
// 4. NOVA FUNÇÃO: CRIAR BANNER DE 8 PRODUTOS
// ===========================================

function criarBannerOitoProdutos(produtos) {
    const banner = document.createElement('div');
    banner.className = 'mn-product-tile eight-products-banner';
    
    // Configuração do layout vertical para 8 produtos
    banner.style.cssText = `
        width: 400px;
        height: 500px;
        display: flex;
        flex-direction: column;
        padding: 16px;
        position: relative;
        background-size: cover;
        background-position: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        overflow-y: auto;
    `;
    
    // Definir IDs dos produtos no banner
    const produtoIds = produtos.map(p => p.id).join(',');
    banner.setAttribute('data-produto-ids', produtoIds);
    
    // Ícones de controle
    const iconsHtml = `
        <div class="multi-product-indicator" style="
            position: absolute; 
            top: 8px; 
            left: 8px; 
            background: rgba(0,0,0,0.8); 
            color: white; 
            padding: 4px 8px; 
            border-radius: 12px; 
            font-size: 10px; 
            font-weight: bold; 
            z-index: 10;
        ">
            ${produtos.length} PRODUTOS
        </div>

        <!-- 👁️ ÍCONE DE TOGGLE CONTROLES (PEQUENO) -->
        <svg class="toggle-controls-icon" 
            id="toggle-controls-icon" 
            onclick="toggleControlesProdutos()" 
            viewBox="0 0 20 20" 
            title="Mostrar/Ocultar controles de edição" 
            style="
                position: absolute; 
                top: 8px; 
                right: 35px; 
                width: 24px; 
                height: 24px; 
                background: rgba(251, 191, 36, 0.95); 
                border-radius: 8px; 
                padding: 4px; 
                cursor: pointer; 
                z-index: 10;
                transition: all 0.2s ease;
            "
            onmouseover="this.style.background='rgba(248, 181, 12, 0.95)'; this.style.transform='scale(1.1)'"
            onmouseout="this.style.background='rgba(251, 191, 36, 0.95)'; this.style.transform='scale(1)'">
            <path fill="white" d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
            <path fill="white" fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
        </svg>

        <svg class="cp-remove-icon" onclick="removerProduto(this)" viewBox="0 0 20 20" 
            title="Remover produto" style="
            position: absolute; 
            top: 8px; 
            right: 6px; 
            width: 25px; 
            height: 25px; 
            background: rgba(255,255,255,0.9); 
            border-radius: 8px; 
            padding: 4px; 
            cursor: pointer; 
            z-index: 10;
        ">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
    `;
    
    banner.innerHTML = iconsHtml;
    
    // Container para a lista de produtos
    const listaContainer = document.createElement('div');
    listaContainer.className = 'eight-products-list';
    listaContainer.style.cssText = `
        margin-top: 150px;
        width: 100%;
        height: auto;
        overflow-y: hidden;
        overflow-x: hidden;
    `;
    
    // 🎯 NOVO: Criar items da lista COM EVENT LISTENERS
    produtos.forEach((produto, index) => {
        const itemProduto = criarItemListaOitoProdutos(produto, index);
        
        // 🎯 ADICIONAR EVENT LISTENER PARA DETECTAR CLIQUE
        itemProduto.addEventListener('click', function(e) {
            // Ignorar cliques nos ícones
            if (e.target.closest('.og-edit-icon, .jy-replace-icon, .fl-download-icon, .cp-remove-icon')) {
                return;
            }
            
            // Chamar função de troca com o índice do produto
            iniciarTrocaProdutoEspecificoOito(banner, index);
        });
        
        // Adicionar estilo de hover para feedback visual
        itemProduto.style.cursor = 'pointer';
        itemProduto.style.transition = 'all 0.2s ease';
        
        itemProduto.addEventListener('mouseenter', function() {
            this.style.background = 'rgba(255, 193, 7, 0.2)';
            this.style.transform = 'translateX(4px)';
            this.style.boxShadow = '0 2px 8px rgba(251, 191, 36, 0.3)';
        });
        
        itemProduto.addEventListener('mouseleave', function() {
            this.style.background = 'rgba(255, 255, 255, 0.9)';
            this.style.transform = 'translateX(0)';
            this.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        });
        
        listaContainer.appendChild(itemProduto);
    });
    
    banner.appendChild(listaContainer);
    
    return banner;
}
let controlesVisiveis = true;

// 👁️ FUNÇÃO: Alternar visibilidade dos controles de edição
function toggleControlesProdutos() {
    controlesVisiveis = !controlesVisiveis;
    
    const canvasContainer = document.getElementById('canvasContainer');
    const btnToggle = document.getElementById('btn-toggle-controles');
    const iconEye = document.getElementById('icon-eye');
    const textToggle = document.getElementById('text-toggle-controles');
    
    if (controlesVisiveis) {
        // MOSTRAR controles
        canvasContainer.classList.remove('controls-hidden');
        
        // Atualizar ícone para "olho aberto"
        iconEye.innerHTML = `
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
            <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
        `;
        
        // Atualizar texto e cor
        textToggle.textContent = 'Ocultar Controles';
        btnToggle.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
        btnToggle.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)';
        
        console.log('✅ Controles de edição VISÍVEIS');
        
    } else {
        // OCULTAR controles
        canvasContainer.classList.add('controls-hidden');
        
        // Atualizar ícone para "olho fechado/cortado"
        iconEye.innerHTML = `
            <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/>
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
        `;
        
        // Atualizar texto e cor
        textToggle.textContent = 'Mostrar Controles';
        btnToggle.style.background = 'linear-gradient(135deg, #64748b, #475569)';
        btnToggle.style.boxShadow = '0 2px 8px rgba(100, 116, 139, 0.3)';
        
        console.log('👁️ Controles de edição OCULTOS');
    }
}

// 👁️ ATALHO DE TECLADO: Pressione "H" (Hide) para alternar
document.addEventListener('keydown', function(e) {
    // Verificar se não está digitando em um input
    if (e.key === 'h' && !e.target.matches('input, textarea')) {
        toggleControlesProdutos();
    }
});

// 🎯 NOVA FUNÇÃO: Iniciar troca de produto específico no banner de 8 produtos
function iniciarTrocaProdutoEspecificoOito(banner, indice) {
    console.log(`🎯 Iniciando troca do produto ${indice + 1} de 8`);
    
    // Configurar variáveis globais
    cardSendoEditado = banner;
    modoEdicao = true;
    posicaoProdutoTroca = indice;
    
    // Destacar visualmente o banner
    banner.style.border = '3px solid #ffc107';
    banner.style.boxShadow = '0 0 15px rgba(255, 193, 7, 0.5)';
    
    // Destacar visualmente o item sendo trocado
    const items = banner.querySelectorAll('.eight-product-item');
    items.forEach((item, idx) => {
        if (idx === indice) {
            item.style.outline = '3px solid #ffc107';
            item.style.outlineOffset = '2px';
            item.style.background = 'rgba(255, 193, 7, 0.3)';
            item.style.transform = 'translateX(8px) scale(1.02)';
        } else {
            item.style.outline = 'none';
            item.style.background = 'rgba(255, 255, 255, 0.9)';
            item.style.transform = 'translateX(0) scale(1)';
        }
    });
    
    // Scroll suave para o item selecionado (se necessário)
    if (items[indice]) {
        items[indice].scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }
    
    // Abrir popup de seleção
    document.getElementById('zk-products-modal').style.display = 'flex';
    
    // Configurar para seleção única
    maxSelecionados = 1;
    produtosSelecionados = [];
    
    // Atualizar título do popup
    document.getElementById('titulo-produto').innerHTML = 
        `Trocar Produto ${indice + 1} de 8
        <small style="color: #666; font-size: 12px; display: block; font-weight: normal;">
            Item da lista na posição ${indice + 1}
        </small>`;
    
    // Carregar produtos
    carregarProdutosParaSelecao();
}

// 🎯 NOVA FUNÇÃO: Abrir popup com menu de seleção para 8 produtos
function abrirPopupTrocaProdutoOito(iconElement, event) {
    event.stopPropagation();
    
    const card = iconElement.closest('.mn-product-tile');
    
    if (!card.classList.contains('eight-products-banner')) {
        // Se não é banner de 8 produtos, usar função antiga
        editarProduto(iconElement, event);
        return;
    }
    
    // Criar popup de seleção em LISTA VERTICAL com scroll
    const popup = document.createElement('div');
    popup.className = 'product-selection-popup-eight';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 10000;
        width: 350px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
    `;
    
    popup.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937; text-align: center;">
            Qual produto deseja trocar?
        </h3>
        
        <!-- Lista de 8 botões com scroll -->
        <div style="
            max-height: 60vh;
            overflow-y: auto;
            margin-bottom: 16px;
            padding-right: 8px;
        ">
            ${[1,2,3,4,5,6,7,8].map(num => `
                <button onclick="selecionarProdutoParaTrocaOito(this, ${num - 1})" 
                        style="
                            width: 100%;
                            padding: 14px;
                            margin-bottom: 8px;
                            background: linear-gradient(90deg, #fbbf24, #f59e0b);
                            color: #1f2937;
                            border: none;
                            border-radius: 8px;
                            font-weight: bold;
                            cursor: pointer;
                            transition: all 0.2s;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                        "
                        onmouseover="this.style.transform='translateX(4px)'; this.style.boxShadow='0 4px 12px rgba(251, 191, 36, 0.4)'"
                        onmouseout="this.style.transform='translateX(0)'; this.style.boxShadow='none'">
                    <span style="display: flex; align-items: center; gap: 12px;">
                        <span style="
                            background: rgba(31, 41, 55, 0.1);
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 16px;
                        ">${num}</span>
                        Produto ${num}
                    </span>
                    <span style="font-size: 18px;">→</span>
                </button>
            `).join('')}
        </div>
        
        <button onclick="fecharPopupSelecaoOito()" 
                style="
                    width: 100%;
                    padding: 10px;
                    background: #e5e7eb;
                    color: #6b7280;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                "
                onmouseover="this.style.background='#d1d5db'"
                onmouseout="this.style.background='#e5e7eb'">
            Cancelar
        </button>
    `;
    
    // Adicionar overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay-eight';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
    `;
    overlay.onclick = fecharPopupSelecaoOito;
    
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    
    // Salvar referência ao card
    window.cardParaTrocaOito = card;
}

// 🎯 FUNÇÃO: Selecionar produto para troca (8 produtos)
function selecionarProdutoParaTrocaOito(button, indice) {
    const card = window.cardParaTrocaOito;
    fecharPopupSelecaoOito();
    
    if (card) {
        iniciarTrocaProdutoEspecificoOito(card, indice);
    }
}

// 🎯 FUNÇÃO: Fechar popup de seleção (8 produtos)
function fecharPopupSelecaoOito() {
    const popup = document.querySelector('.product-selection-popup-eight');
    const overlay = document.querySelector('.popup-overlay-eight');
    
    if (popup) popup.remove();
    if (overlay) overlay.remove();
    
    window.cardParaTrocaOito = null;
}


// ===========================================
// 5. NOVA FUNÇÃO: CRIAR ITEM DA LISTA
// ===========================================

function criarItemListaOitoProdutos(produto, index) {
    const item = document.createElement('div');
    item.className = `eight-product-item produto-posicao-${index}`;
    
    // 🎯 ADICIONAR data-index para identificar o produto
    item.setAttribute('data-product-index', index);
    
    item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px 4px 8px;
        margin-bottom: 6px;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        min-height: 30px;
        position: relative;
    `;
    
    item.innerHTML = criarConteudoItemOitoProdutos(produto);
    
    return item;
}

// 🎯 NOVA FUNÇÃO: Editar produto individual no banner de 8 produtos
function editarProdutoIndividualOito(event) {
    event.stopPropagation();
    
    // Encontrar o item da lista
    const item = event.target.closest('.eight-product-item');
    if (!item) return;
    
    // Encontrar o banner pai
    const banner = event.target.closest('.eight-products-banner');
    if (!banner) return;
    
    // Obter o índice do produto
    const indice = parseInt(item.getAttribute('data-product-index'));
    
    console.log(`✏️ Editando produto ${indice + 1} do banner de 8 produtos`);
    
    // Configurar variáveis globais
    cardAtualEdicao = banner;
    posicaoProdutoTroca = indice;
    
    // Destacar visualmente o item sendo editado
    const items = banner.querySelectorAll('.eight-product-item');
    items.forEach((it, idx) => {
        if (idx === indice) {
            it.style.outline = '3px solid #3b82f6';
            it.style.outlineOffset = '2px';
            it.style.background = 'rgba(59, 130, 246, 0.15)';
            it.style.transform = 'translateX(8px) scale(1.03)';
        } else {
            it.style.outline = 'none';
            it.style.background = 'rgba(255, 255, 255, 0.9)';
            it.style.transform = 'translateX(0) scale(1)';
        }
    });
    
    // Scroll suave para o item selecionado
    item.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
    });
    
    // Obter dados do item específico
    const titulo = item.querySelector('.rw-product-title').textContent;
    const subtitulo = item.querySelector('.ds-product-subtitle').textContent;
    const precoOriginal = item.querySelector('.preco-original-valor').textContent;
    const precoPromocional = item.querySelector('.preco-promocional-valor').textContent;
    
    // Preencher campos do formulário
    document.getElementById('produto-titulo').value = titulo;
    document.getElementById('produto-subtitulo').value = subtitulo;
    document.getElementById('preco-original').value = precoOriginal;
    document.getElementById('preco-promocional').value = precoPromocional;
    
    // Obter cores atuais
    const precoPromoElement = item.querySelector('.wp-promo-price');
    const tituloElement = item.querySelector('.rw-product-title');
    
    const corFundo = getComputedStyle(precoPromoElement).backgroundColor;
    const corTextoPreco = getComputedStyle(precoPromoElement).color;
    const corTitulo = getComputedStyle(tituloElement).color;
    
    document.getElementById('cor-fundo').value = rgbToHex(corFundo) || '#fbbf24';
    document.getElementById('cor-texto-preco').value = rgbToHex(corTextoPreco) || '#1f2937';
    document.getElementById('cor-titulo').value = rgbToHex(corTitulo) || '#1f2937';
    
    // Atualizar título do modal
    const tituloModal = document.querySelector('.dt-modal-title');
    if (tituloModal) {
        tituloModal.innerHTML = `
            Editar Produto ${indice + 1} de 8
            <div style="font-size: 12px; color: #666; font-weight: normal; margin-top: 4px;">
                ${titulo}
            </div>
        `;
    }
    
    // Mostrar modal
    document.getElementById('modal-precos').style.display = 'flex';
    document.getElementById('preco-original').focus();
}

// 🎯 NOVA FUNÇÃO: Trocar produto individual no banner de 8 produtos
function trocarProdutoIndividualOito(event) {
    event.stopPropagation();
    
    // Encontrar o item da lista
    const item = event.target.closest('.eight-product-item');
    if (!item) return;
    
    // Encontrar o banner pai
    const banner = event.target.closest('.eight-products-banner');
    if (!banner) return;
    
    // Obter o índice do produto
    const indice = parseInt(item.getAttribute('data-product-index'));
    
    console.log(`🔄 Trocando produto ${indice + 1} do banner de 8 produtos`);
    
    // Usar a função existente
    iniciarTrocaProdutoEspecificoOito(banner, indice);
}
/***********************************************/
// criar comteudo criarConteudoItemOitoProduto /
/***********************************************/


function criarConteudoItemOitoProdutos(produto) {
    return `
        <!-- 🎯 NOVOS ÍCONES INDIVIDUAIS POR PRODUTO -->
        <div class="product-individual-controls-eight" style="
            position: absolute;
            top: 4px;
            right: 4px;
            display: flex;
            gap: 4px;
            z-index: 5;
        ">
            <!-- Ícone de Editar -->
            <button class="action-btn edit-btn" onclick="editarProdutoIndividualOito(event)"  title="Editar">
                <img src="assets/editar_cinza.png" width="22px">
            </button>

            <!-- Ícone de Trocar -->
            <button onclick="trocarProdutoIndividualOito(event)" 
                    class="product-replace-btn-eight"
                    title="Trocar produto"
                    style="
                        width: 22px;
                        height: 22px;
                        background: rgba(251, 191, 36, 0.95);
                        border: none;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    "
                    onmouseover="this.style.background='rgba(245, 158, 11, 1)'; this.style.transform='scale(1.15)'"
                    onmouseout="this.style.background='rgba(251, 191, 36, 0.95)'; this.style.transform='scale(1)'">
                <svg width="11" height="11" viewBox="0 0 20 20" fill="#1f2937">
                    <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
                </svg>
            </button>
        </div>

        <div class="eight-product-info" style="
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding-right: 50px;
        ">
            <h4 class="rw-product-title" style="
                font-family: Montserrat !important;
                font-weight: 700 !important;
                font-size: 6px;
                font-weight: bold;
                color: #1f2937;
                margin: 0 0 2px 0;
                line-height: 1.2;
            ">${produto.nome}</h4>
            
            <p class="ds-product-subtitle" style="
                font-size: 7px;
                color: #6b7280;
                margin: 0;
                line-height: 1.1;
            ">${produto.subtitulo || 'Excelente produto especial'}</p>
        </div>

        <div class="eight-product-prices" style="
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin-left: 12px;
        ">
            <div class="lm-original-price" style="
                font-size: 6px;
                color: #1f2937;
                margin-bottom: 3px;
                white-space: nowrap;
                margin-top: -8px;
            ">
                <span style="font-size: 5px; font-weight: normal;">de:</span>
                <span class="preco-original-valor">00,00</span>
            </div>
            
            <div class="wp-promo-price" style="
                background: #fbbf24;
                color: #1f2937;
                font-family: 'Posterama2001';
                display: flex;
                align-items: flex-start;
                gap: 4px;
                padding: 3px 8px;
                border-radius: 6px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                white-space: nowrap;
            ">
                <!-- Coluna Esquerda: "por" e "R$" -->
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 1px;">
                    <span style="font-size: 6px; font-weight: normal;">por</span>
                    <span style="font-size: 5px; font-weight: bold;">R$</span>
                </div>
                
                <!-- Coluna Direita: Preço -->
                <div style="display: flex; align-items: flex-start; gap: 1px;">
                    <span class="preco-promocional-valor preco-reais" style="font-size: 12px; font-weight: bold; line-height: 1;">00</span>
                </div>
            </div>
        </div>
    `;
}

// ===========================================
// FUNÇÕES DE ATUALIZAÇÃO DE PRODUTOS
// ===========================================

function atualizarCardQuatroProdutos(card, produto) {
    const titulo = card.querySelector('.rw-product-title');
    const subtitulo = card.querySelector('.ds-product-subtitle');
    const imagem = card.querySelector('.nf-product-image');
    
    if (titulo) {
        titulo.textContent = produto.nome;
    }
    
    if (subtitulo) {
        subtitulo.textContent = produto.subtitulo || 'Excelente produto especial';
    }
    
    if (imagem && produto.imagem_url) {
        imagem.src = produto.imagem_url;
        imagem.style.display = 'block';
        const noImageDiv = imagem.nextElementSibling;
        if (noImageDiv) noImageDiv.style.display = 'none';
    }
}

function atualizarSecaoProduto(secao, produto) {
    const titulo = secao.querySelector('.rw-product-title');
    const subtitulo = secao.querySelector('.ds-product-subtitle');
    const imagem = secao.querySelector('.nf-product-image');
    
    if (titulo) titulo.textContent = produto.nome;
    if (subtitulo) subtitulo.textContent = produto.subtitulo || 'Excelente produto especial';
    if (imagem && produto.imagem_url) imagem.src = produto.imagem_url;
}

// ===========================================
// 11. NOVA FUNÇÃO: ATUALIZAR ITEM 8 PRODUTOS
// ===========================================

function atualizarItemOitoProdutos(item, produto) {
    const titulo = item.querySelector('.rw-product-title');
    const subtitulo = item.querySelector('.ds-product-subtitle');
    
    if (titulo) {
        titulo.textContent = produto.nome;
    }
    
    if (subtitulo) {
        subtitulo.textContent = produto.subtitulo || 'Excelente produto especial';
    }
}

// ===========================================
// FUNÇÕES DE GERENCIAMENTO DE PRODUTOS
// ===========================================

function removerProduto(iconElement) {
    const card = iconElement.closest('.mn-product-tile');
    const grid = document.getElementById('produtos-grid');
    
    // Remover o card
    card.remove();
    
    // Verificar se ainda há produtos
    if (grid.children.length === 0) {
        document.getElementById('produtosCanvas').style.display = 'none';
        document.getElementById('canvasContainer').classList.remove('mk-has-items');
        
        // Se tem tema selecionado, mostrar preview do tema, senão mostrar botão inicial
        if (temaSelecionado) {
            mostrarTemaNoCanvas(temaSelecionado);
        } else {
            document.getElementById('initialAddBtn').style.display = 'block';
        }
    } else {
        // Atualizar contador baseado no total de produtos em todos os banners
        atualizarContador();
    }
}

function atualizarContador() {
    const grid = document.getElementById('produtos-grid');
    const banners = grid.children;
    let totalProdutos = 0;
    
    // Contar produtos em cada banner
    Array.from(banners).forEach(banner => {
        if (banner.classList.contains('combined-banner')) {
            // Banner combinado: contar seções de produtos
            totalProdutos += banner.querySelectorAll('.combined-product-section').length;
        } else if (banner.classList.contains('four-products-banner')) {
            // Banner de 4 produtos: contar cards de produtos
            totalProdutos += banner.querySelectorAll('.four-product-card').length;
        }else if (banner.classList.contains('eight-products-banner')) {
            // Banner de 8 produtos: contar items de produtos
            totalProdutos += banner.querySelectorAll('.eight-product-item').length;
        } else {
            // Banner individual: 1 produto
            totalProdutos += 1;
        }
    });
    
    document.getElementById('contador').textContent = 
        `Exibindo ${banners.length} banner${banners.length > 1 ? 's' : ''} com ${totalProdutos} produto${totalProdutos > 1 ? 's' : ''}`;
}

function limparTodosProdutos() {
    if (confirm('Tem certeza que deseja remover todos os produtos?')) {
        document.getElementById('produtos-grid').innerHTML = '';
        document.getElementById('produtosCanvas').style.display = 'none';
        document.getElementById('canvasContainer').classList.remove('mk-has-items');
        
        // Se tem tema selecionado, mostrar preview do tema, senão mostrar botão inicial
        if (temaSelecionado) {
            mostrarTemaNoCanvas(temaSelecionado);
        } else {
            document.getElementById('initialAddBtn').style.display = 'block';
        }
    }
}

// ===========================================
// FUNÇÕES DE BUSCA
// ===========================================

document.addEventListener('DOMContentLoaded', function() {
    const campoBusca = document.getElementById('busca');
    if (campoBusca) {
        let debounceTimer = null;

        campoBusca.addEventListener('input', function() {
            const termo = this.value;

            // Debounce: aguarda 300ms após o usuário parar de digitar
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                pesquisarProdutos(termo);
            }, 300);
        });
    }
});
// ===========================================
// FUNÇÕES DE PREVIEW
// ===========================================

function mostrarPreview(produto) {
    document.getElementById('previewArea').style.display = 'flex';
    
    produtoPreview = produto;
    const previewCard = document.getElementById('preview-card');
    
    // Atualizar conteúdo do preview
    const imagemSection = previewCard.querySelector('.hr-image-area');
    const titulo = previewCard.querySelector('.rw-product-title');
    const subtitulo = previewCard.querySelector('.ds-product-subtitle');
    
    // Atualizar imagem
    imagemSection.innerHTML = produto.imagem_url ? 
        `<img src="${produto.imagem_url}" 
            alt="${produto.nome}" 
            class="nf-product-image"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="yt-no-image" style="display: none;">Sem imagem disponível</div>` :
        `<div class="yt-no-image">Sem imagem disponível</div>`;
    
    // Atualizar textos
    titulo.textContent = produto.nome;
    subtitulo.textContent = produto.subtitulo || 'Excelente produto especial';
    
    // Aplicar tema se houver um selecionado
    if (temaSelecionado) {
        aplicarTemaAoPreview(temaSelecionado);
    }
}

function editarPreviewPrecos() {
    if (!produtoPreview) {
        alert('Selecione um produto primeiro');
        return;
    }
    
    const previewCard = document.getElementById('preview-card');
    cardAtualEdicao = previewCard;
    
    const precoOriginal = previewCard.querySelector('.preco-original-valor').textContent;
    const precoPromocional = previewCard.querySelector('.preco-promocional-valor').textContent;
    
    document.getElementById('preco-original').value = precoOriginal;
    document.getElementById('preco-promocional').value = precoPromocional;
    
    const precoPromoElement = previewCard.querySelector('.wp-promo-price');
    const tituloElement = previewCard.querySelector('.rw-product-title');
    
    const corFundo = getComputedStyle(precoPromoElement).backgroundColor;
    const corTextoPreco = getComputedStyle(precoPromoElement).color;
    const corTitulo = getComputedStyle(tituloElement).color;
    
    document.getElementById('cor-fundo').value = rgbToHex(corFundo) || '#fbbf24';
    document.getElementById('cor-texto-preco').value = rgbToHex(corTextoPreco) || '#1f2937';
    document.getElementById('cor-titulo').value = rgbToHex(corTitulo) || '#1f2937';
    
    document.getElementById('modal-precos').style.display = 'flex';
    document.getElementById('preco-original').focus();
}

function downloadPreview() {
    if (!produtoPreview) {
        alert('Selecione um produto primeiro');
        return;
    }
    
    const previewCard = document.getElementById('preview-card');
    downloadCard({ closest: () => previewCard });
}

// ===========================================
// FUNÇÕES DE DOWNLOAD
// ===========================================

function downloadAllProducts() {
    const produtoCards = document.querySelectorAll('.mn-product-tile:not(.nh-preview-card)');
    
    if (produtoCards.length === 0) {
        alert('Adicione produtos primeiro');
        return;
    }
    
    // Download do primeiro banner como exemplo
    downloadCard({ closest: () => produtoCards[0] });
}

async function preloadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn(`Erro ao carregar imagem: ${url}`);
            resolve(null);
        };
        img.src = url;
    });
}

async function convertImageToDataURL(url) {
    try {
        const img = await preloadImage(url);
        if (!img) return null;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    } catch (error) {
        console.warn(`Erro ao converter imagem para DataURL: ${url}`, error);
        return null;
    }
}

async function downloadCard(iconElement) {
    const card = iconElement.closest('.mn-product-tile');
    
    let titulo = 'banner';
    
    // Determinar título baseado no tipo de banner
    if (card.classList.contains('combined-banner')) {
        const produtoIds = card.getAttribute('data-produto-ids');
        titulo = `banner_combinado_${produtoIds.replace(/,/g, '_')}`;
    } else if (card.classList.contains('four-products-banner')) {
        const produtoIds = card.getAttribute('data-produto-ids');
        titulo = `banner_4produtos_${produtoIds.replace(/,/g, '_')}`;
    } else if (card.classList.contains('eight-products-banner')) {
        const produtoIds = card.getAttribute('data-produto-ids');
        titulo = `banner_8produtos_${produtoIds.replace(/,/g, '_')}`;
    } else {
        const tituloElement = card.querySelector('.rw-product-title');
        titulo = tituloElement ? tituloElement.textContent : 'produto';
    }
    
    // Mostrar overlay de carregamento
    const downloadOverlay = document.getElementById('download-overlay');
    downloadOverlay.style.display = 'flex';
    
    try {
        // ✅ DIMENSÕES FINAIS INSTAGRAM STORIES
        const INSTAGRAM_WIDTH = 1080;
        const INSTAGRAM_HEIGHT = 1350;
        
        // ✅ CRIAR CANVAS FINAL
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = INSTAGRAM_WIDTH;
        finalCanvas.height = INSTAGRAM_HEIGHT;
        
        const ctx = finalCanvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: false
        });
        
        // ✅ CONFIGURAR QUALIDADE MÁXIMA
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // ✅ PASSO 1: DESENHAR IMAGEM DO TEMA EM ALTA RESOLUÇÃO
        const backgroundImage = getComputedStyle(card).backgroundImage;
        
        if (backgroundImage && backgroundImage !== 'none') {
            const bgUrlMatch = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
            
            if (bgUrlMatch) {
                const temaUrl = bgUrlMatch[1];
                console.log('🎨 Carregando tema em alta resolução:', temaUrl);
                
                // Carregar imagem do tema em resolução ORIGINAL
                const temaImg = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Erro ao carregar tema'));
                    img.src = temaUrl;
                });
                
                console.log(`✅ Tema carregado: ${temaImg.width}x${temaImg.height}px (resolução original)`);
                
                // Desenhar tema ocupando todo o canvas (cover)
                const imgAspectRatio = temaImg.width / temaImg.height;
                const canvasAspectRatio = INSTAGRAM_WIDTH / INSTAGRAM_HEIGHT;
                
                let drawWidth, drawHeight, offsetX, offsetY;
                
                if (imgAspectRatio > canvasAspectRatio) {
                    drawHeight = INSTAGRAM_HEIGHT;
                    drawWidth = drawHeight * imgAspectRatio;
                    offsetX = (INSTAGRAM_WIDTH - drawWidth) / 2;
                    offsetY = 0;
                } else {
                    drawWidth = INSTAGRAM_WIDTH;
                    drawHeight = drawWidth / imgAspectRatio;
                    offsetX = 0;
                    offsetY = (INSTAGRAM_HEIGHT - drawHeight) / 2;
                }
                
                ctx.drawImage(temaImg, offsetX, offsetY, drawWidth, drawHeight);
                console.log('✅ Tema desenhado em alta qualidade');
                
            } else {
                // Sem tema - fundo branco
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, INSTAGRAM_WIDTH, INSTAGRAM_HEIGHT);
            }
        } else {
            // Sem tema - fundo branco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, INSTAGRAM_WIDTH, INSTAGRAM_HEIGHT);
        }
        
        // ✅ PASSO 2: OCULTAR ELEMENTOS INDESEJADOS
        const elementosParaOcultar = [];
        
        const iconesPrincipais = card.querySelectorAll('.og-edit-icon, .jy-replace-icon, .fl-download-icon, .cp-remove-icon, .multi-product-indicator, .toggle-controls-icon');
        iconesPrincipais.forEach(icone => {
            elementosParaOcultar.push({
                elemento: icone,
                displayOriginal: icone.style.display,
                visibilityOriginal: icone.style.visibility
            });
            icone.style.display = 'none';
            icone.style.visibility = 'hidden';
        });
        
        const controlesIndividuais = card.querySelectorAll('.product-individual-controls, .product-individual-controls-four, .product-individual-controls-eight');
        controlesIndividuais.forEach(controle => {
            elementosParaOcultar.push({
                elemento: controle,
                displayOriginal: controle.style.display,
                visibilityOriginal: controle.style.visibility
            });
            controle.style.display = 'none';
            controle.style.visibility = 'hidden';
        });
        
        const botoes = card.querySelectorAll('.action-btn, .edit-btn, .product-replace-btn, .product-replace-btn-four, .product-replace-btn-eight, button');
        botoes.forEach(btn => {
            if (!elementosParaOcultar.some(item => item.elemento === btn)) {
                elementosParaOcultar.push({
                    elemento: btn,
                    displayOriginal: btn.style.display,
                    visibilityOriginal: btn.style.visibility
                });
                btn.style.display = 'none';
                btn.style.visibility = 'hidden';
            }
        });
        
        const svgs = card.querySelectorAll('svg');
        svgs.forEach(svg => {
            if (!elementosParaOcultar.some(item => item.elemento === svg)) {
                elementosParaOcultar.push({
                    elemento: svg,
                    displayOriginal: svg.style.display,
                    visibilityOriginal: svg.style.visibility
                });
                svg.style.display = 'none';
                svg.style.visibility = 'hidden';
            }
        });
        
        console.log(`🔒 ${elementosParaOcultar.length} elementos ocultados`);
        
        // ✅ PASSO 3: REMOVER BACKGROUND DO CARD TEMPORARIAMENTE
        const cardBackgroundOriginal = card.style.backgroundImage;
        card.style.backgroundImage = 'none';
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // ✅ PASSO 4: CAPTURAR PRODUTOS EM ALTA QUALIDADE
        const cardWidth = card.offsetWidth;
        const cardHeight = card.offsetHeight;
        
        console.log(`📐 Dimensões do card: ${cardWidth}x${cardHeight}px`);
        
        // Scale alto para produtos em alta qualidade
        const PRODUCT_SCALE = 4.0;
        
        const produtosCanvas = await html2canvas(card, {
            backgroundColor: null, // ✅ TRANSPARENTE
            scale: PRODUCT_SCALE,
            useCORS: false,
            allowTaint: true,
            width: cardWidth,
            height: cardHeight,
            logging: false,
            imageTimeout: 30000,
            letterRendering: true,
            onclone: (clonedDoc) => {
                    const clonedCard = clonedDoc.querySelector('.mn-product-tile');
                    if (clonedCard) {
                        // Remover elementos indesejados
                        clonedCard.querySelectorAll('svg').forEach(svg => svg.remove());
                        clonedCard.querySelectorAll('.product-individual-controls').forEach(c => c.remove());
                        clonedCard.querySelectorAll('.product-individual-controls-four').forEach(c => c.remove());
                        clonedCard.querySelectorAll('.product-individual-controls-eight').forEach(c => c.remove());
                        clonedCard.querySelectorAll('button').forEach(btn => btn.remove());
                        clonedCard.querySelectorAll('.action-btn, .edit-btn, .product-replace-btn').forEach(btn => btn.remove());
                        clonedCard.querySelectorAll('.toggle-controls-icon').forEach(icon => icon.remove());
                        
                        // ✅ GARANTIR QUE NÃO TEM BACKGROUND
                        clonedCard.style.backgroundImage = 'none';
                        clonedCard.style.backgroundColor = 'transparent';
                
                        // ✅ FIX COMBINED BANNER (2 produtos) — html2canvas não renderiza margin negativa corretamente
                        if (clonedCard.classList.contains('combined-banner')) {
                            clonedCard.style.position = 'relative';
                            clonedCard.style.display = 'flex';
                            clonedCard.style.flexDirection = 'column';
                
                            const sections = clonedCard.querySelectorAll('.combined-product-section');
                            sections.forEach((section, idx) => {
                                section.style.height = '250px';
                                section.style.position = 'relative';
                                section.style.overflow = 'visible';
                                section.style.flex = 'none';
                
                                const content = section.querySelector('.aw-card-content');
                                if (content) {
                                    const marginTopOriginal = parseInt(content.style.marginTop) || 0;
                
                                    // Troca margin negativa por position absolute com top calculado
                                    content.style.position = 'absolute';
                                    content.style.marginTop = '0px';
                
                                    if (idx === 0) {
                                        content.style.top = '130px';
                                    }else {
                                        // Segundo produto: centraliza dentro da seção, sem subir
                                        content.style.top = '50px';
                                    }
                                }
                            });
                        }
                    }
                }
        });
        
        console.log(`📸 Produtos capturados: ${produtosCanvas.width}x${produtosCanvas.height}px`);
        
        // ✅ PASSO 5: SOBREPOR PRODUTOS NO CANVAS FINAL
        // Calcular dimensões para manter proporção do card
        const cardAspectRatio = cardWidth / cardHeight;
        const targetAspectRatio = INSTAGRAM_WIDTH / INSTAGRAM_HEIGHT;
        
        let productDrawWidth, productDrawHeight, productOffsetX, productOffsetY;
        
        if (cardAspectRatio > targetAspectRatio) {
            productDrawHeight = INSTAGRAM_HEIGHT;
            productDrawWidth = productDrawHeight * cardAspectRatio;
            productOffsetX = (INSTAGRAM_WIDTH - productDrawWidth) / 2;
            productOffsetY = 0;
        } else {
            productDrawWidth = INSTAGRAM_WIDTH;
            productDrawHeight = productDrawWidth / cardAspectRatio;
            productOffsetX = 0;
            productOffsetY = (INSTAGRAM_HEIGHT - productDrawHeight) / 2;
        }
        
        console.log(`🎨 Sobrepondo produtos: ${productDrawWidth.toFixed(0)}x${productDrawHeight.toFixed(0)}px`);
        
        ctx.drawImage(
            produtosCanvas,
            0, 0, produtosCanvas.width, produtosCanvas.height,
            productOffsetX, productOffsetY, productDrawWidth, productDrawHeight
        );
        
        console.log('✅ Produtos sobrepostos com sucesso');
        
        // ✅ PASSO 6: RESTAURAR CARD
        card.style.backgroundImage = cardBackgroundOriginal;
        
        elementosParaOcultar.forEach(item => {
            item.elemento.style.display = item.displayOriginal;
            item.elemento.style.visibility = item.visibilityOriginal;
        });
        
        console.log('✅ Card restaurado');
        
        // ✅ PASSO 7: DOWNLOAD COM QUALIDADE MÁXIMA
        const link = document.createElement('a');
        const nomeArquivo = temaSelecionado ? 
            `${titulo.replace(/[^a-zA-Z0-9]/g, '_')}_tema_${temaSelecionado.id}_1080x1350_HQ.png` :
            `${titulo.replace(/[^a-zA-Z0-9]/g, '_')}_1080x1350_HQ.png`;
        
        link.download = nomeArquivo;
        link.href = finalCanvas.toDataURL('image/png', 1.0);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Feedback visual
        card.style.transition = 'border 0.3s ease';
        card.style.border = '3px solid #10b981';
        setTimeout(() => {
            card.style.border = '';
        }, 1000);
        
        console.log(`✅ Download concluído: ${nomeArquivo}`);
        console.log('📊 Composição em camadas:');
        console.log('   1️⃣ Tema original em alta resolução');
        console.log('   2️⃣ Produtos em scale 4.0x');
        console.log('   3️⃣ Exportação PNG 100%');
        console.log(`   🎯 Resultado: ${INSTAGRAM_WIDTH}x${INSTAGRAM_HEIGHT}px`);
        
    } catch (error) {
        console.error('❌ Erro ao gerar imagem:', error);
        alert('Erro ao gerar imagem. Tente novamente.');
        
        // Restaurar em caso de erro
        const iconesPrincipais = card.querySelectorAll('.og-edit-icon, .jy-replace-icon, .fl-download-icon, .cp-remove-icon, .multi-product-indicator, .toggle-controls-icon');
        iconesPrincipais.forEach(icone => {
            icone.style.display = 'block';
            icone.style.visibility = 'visible';
        });
        
        const controlesIndividuais = card.querySelectorAll('.product-individual-controls, .product-individual-controls-four, .product-individual-controls-eight');
        controlesIndividuais.forEach(controle => {
            controle.style.display = 'flex';
            controle.style.visibility = 'visible';
        });
        
        const botoes = card.querySelectorAll('.action-btn, .edit-btn, .product-replace-btn, .product-replace-btn-four, .product-replace-btn-eight, button');
        botoes.forEach(btn => {
            btn.style.display = 'flex';
            btn.style.visibility = 'visible';
        });
        
        const svgs = card.querySelectorAll('svg');
        svgs.forEach(svg => {
            svg.style.display = 'block';
            svg.style.visibility = 'visible';
        });
        
    } finally {
        downloadOverlay.style.display = 'none';
    }
}

// ===========================================
// MODAL DE EDIÇÃO DE PREÇOS
// ===========================================

function abrirModalPrecos(iconElement) {
    const card = iconElement.closest('.mn-product-tile');
    cardAtualEdicao = card;
    
    let titulo, subtitulo, precoOriginal, precoPromocional;
    
    // Verificar tipo de banner e obter dados adequadamente
    if (card.classList.contains('combined-banner')) {
        const primeiraSecao = card.querySelector('.combined-product-section');
        titulo = primeiraSecao.querySelector('.rw-product-title').textContent;
        subtitulo = primeiraSecao.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = primeiraSecao.querySelector('.preco-original-valor').textContent;
        precoPromocional = primeiraSecao.querySelector('.preco-promocional-valor').textContent;
    } else if (card.classList.contains('four-products-banner')) {
        const primeiroCard = card.querySelector('.four-product-card');
        titulo = primeiroCard.querySelector('.rw-product-title').textContent;
        subtitulo = primeiroCard.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = primeiroCard.querySelector('.preco-original-valor').textContent;
        precoPromocional = primeiroCard.querySelector('.preco-promocional-valor').textContent;
    } else if (card.classList.contains('eight-products-banner')) {
        const primeiroItem = card.querySelector('.eight-product-item');
        titulo = primeiroItem.querySelector('.rw-product-title').textContent;
        subtitulo = primeiroItem.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = primeiroItem.querySelector('.preco-original-valor').textContent;
        precoPromocional = primeiroItem.querySelector('.preco-promocional-valor').textContent;
    } else {
        titulo = card.querySelector('.rw-product-title').textContent;
        subtitulo = card.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = card.querySelector('.preco-original-valor').textContent;
        precoPromocional = card.querySelector('.preco-promocional-valor').textContent;
    }
    
    // Preencher campos do formulário
    document.getElementById('produto-titulo').value = titulo;
    document.getElementById('produto-subtitulo').value = subtitulo;
    document.getElementById('preco-original').value = precoOriginal;
    document.getElementById('preco-promocional').value = precoPromocional;
    
    // Obter cores atuais
    let precoPromoElement, tituloElement;
    
    if (card.classList.contains('combined-banner')) {
        const primeiraSecao = card.querySelector('.combined-product-section');
        precoPromoElement = primeiraSecao.querySelector('.wp-promo-price');
        tituloElement = primeiraSecao.querySelector('.rw-product-title');
    } else if (card.classList.contains('four-products-banner')) {
        const primeiroCard = card.querySelector('.four-product-card');
        precoPromoElement = primeiroCard.querySelector('.wp-promo-price');
        tituloElement = primeiroCard.querySelector('.rw-product-title');
    }else if (card.classList.contains('eight-products-banner')) {
        const primeiroItem = card.querySelector('.eight-product-item');
        precoPromoElement = primeiroItem.querySelector('.wp-promo-price');
        tituloElement = primeiroItem.querySelector('.rw-product-title');
    } else {
        precoPromoElement = card.querySelector('.wp-promo-price');
        tituloElement = card.querySelector('.rw-product-title');
    }
    
    const corFundo = getComputedStyle(precoPromoElement).backgroundColor;
    const corTextoPreco = getComputedStyle(precoPromoElement).color;
    const corTitulo = getComputedStyle(tituloElement).color;
    
    document.getElementById('cor-fundo').value = rgbToHex(corFundo) || '#fbbf24';
    document.getElementById('cor-texto-preco').value = rgbToHex(corTextoPreco) || '#1f2937';
    document.getElementById('cor-titulo').value = rgbToHex(corTitulo) || '#1f2937';
    
    // Mostrar modal
    document.getElementById('modal-precos').style.display = 'flex';
    document.getElementById('preco-original').focus();
}

// ===========================================
// FUNÇÃO MODIFICADA: FECHAR MODAL
// ===========================================
function fecharModal() {
    const emModoSequencial = filaEdicaoProdutos.length > 1 && indiceEdicaoAtual < filaEdicaoProdutos.length;
    
    if (emModoSequencial) {
        const resposta = confirm(`Cancelar edição sequencial?\n\nVocê está editando ${filaEdicaoProdutos.length} produtos (produto ${indiceEdicaoAtual + 1}/${filaEdicaoProdutos.length}).\nOs produtos já editados permanecerão salvos.`);
        
        if (resposta) {
            finalizarEdicaoSequencial();
            document.getElementById('modal-precos').style.display = 'none';
            cardAtualEdicao = null;
        }
        return;
    }
    
    // Modo normal: fechar normalmente
    document.getElementById('modal-precos').style.display = 'none';
    
    // Limpar destaques de edição individual (banner de 2 produtos)
    if (cardAtualEdicao && cardAtualEdicao.classList.contains('combined-banner')) {
        const secoes = cardAtualEdicao.querySelectorAll('.combined-product-section');
        secoes.forEach(secao => {
            secao.style.outline = 'none';
            secao.style.background = 'transparent';
        });
    }
    
    // Limpar destaques de edição individual (banner de 4 produtos)
    if (cardAtualEdicao && cardAtualEdicao.classList.contains('four-products-banner')) {
        const cards = cardAtualEdicao.querySelectorAll('.four-product-card');
        cards.forEach(card => {
            card.style.outline = 'none';
            card.style.background = 'transparent';
            card.style.transform = 'scale(1)';
        });
    }
    
    // 🎯 NOVO: Limpar destaques de edição individual (banner de 8 produtos)
    if (cardAtualEdicao && cardAtualEdicao.classList.contains('eight-products-banner')) {
        const items = cardAtualEdicao.querySelectorAll('.eight-product-item');
        items.forEach(item => {
            item.style.outline = 'none';
            item.style.background = 'rgba(255, 255, 255, 0.9)';
            item.style.transform = 'translateX(0) scale(1)';
        });
    }
    
    cardAtualEdicao = null;
    
    // Resetar título do modal
    const tituloModal = document.querySelector('.dt-modal-title');
    if (tituloModal) {
        tituloModal.textContent = 'Editar Produto';
    }
    
    // Resetar posição
    posicaoProdutoTroca = -1;
}

function debugEdicaoSequencial() {
    console.log('=== DEBUG EDIÇÃO SEQUENCIAL ===');
    console.log('filaEdicaoProdutos:', filaEdicaoProdutos.map(p => p.nome));
    console.log('indiceEdicaoAtual:', indiceEdicaoAtual);
    console.log('cardBannerAtual:', cardBannerAtual ? 'Definido' : 'Não definido');
    console.log('cardAtualEdicao:', cardAtualEdicao ? 'Definido' : 'Não definido');
    console.log('abrirEditorAutomaticamente:', abrirEditorAutomaticamente);
    console.log('==============================');
}

// Expor função de debug
window.debugEdicaoSequencial = debugEdicaoSequencial;

function formatarPreco(valor) {
    // Remove tudo que não é número ou vírgula
    let preco = valor.replace(/[^\d,]/g, '');
    
    // Se não tem vírgula, adiciona ,00
    if (!preco.includes(',')) {
        preco = preco + ',00';
    }
    
    // Garante que tem pelo menos 2 dígitos após a vírgula
    const partes = preco.split(',');
    if (partes[1] && partes[1].length === 1) {
        preco = partes[0] + ',' + partes[1] + '0';
    }
    
    return preco;
}

function rgbToHex(rgb) {
    if (!rgb || rgb === 'rgba(0, 0, 0, 0)') return null;
    
    const result = rgb.match(/\d+/g);
    if (!result || result.length < 3) return null;
    
    const r = parseInt(result[0]);
    const g = parseInt(result[1]);
    const b = parseInt(result[2]);
    
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function preencherCamposEditor(produto) {
    document.getElementById('produto-titulo').value = produto.nome || '';
    document.getElementById('produto-subtitulo').value = produto.subtitulo || 'Excelente produto especial';
    document.getElementById('preco-original').value = '00,00';
    document.getElementById('preco-promocional').value = '00,00';
    
    // Configurar cores padrão
    document.getElementById('cor-fundo').value = '#fbbf24';
    document.getElementById('cor-texto-preco').value = '#1f2937';
    document.getElementById('cor-titulo').value = '#1f2937';
}

function salvarPrecos(event) {
    event.preventDefault();
    
    if (!cardAtualEdicao) return;
    
    // Obter valores dos campos
    const novoTitulo = document.getElementById('produto-titulo').value.trim();
    const novoSubtitulo = document.getElementById('produto-subtitulo').value.trim();
    const precoOriginal = formatarPreco(document.getElementById('preco-original').value);
    const precoPromocional = formatarPreco(document.getElementById('preco-promocional').value);

    // Validação: De nunca menor que Por
    const precoOriginalNum = parseFloat(precoOriginal.replace(',', '.'));
    const precoPromocionalNum = parseFloat(precoPromocional.replace(',', '.'));

    const erroAnterior = document.getElementById('erro-preco-original');
    if (erroAnterior) erroAnterior.remove();

    if (precoOriginalNum < precoPromocionalNum) {
        const erro = document.createElement('div');
        erro.id = 'erro-preco-original';
        erro.style.cssText = `
            color: #dc2626;
            font-size: 12px;
            font-weight: 600;
            margin-top: 4px;
            padding: 6px 10px;
            background: #fef2f2;
            border: 1px solid #fca5a5;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
        `;
        erro.innerHTML = '⚠️ O preço "De:" não pode ser menor que o preço "Por:"';

        const inputPrecoOriginal = document.getElementById('preco-original');
        inputPrecoOriginal.style.borderColor = '#dc2626';
        inputPrecoOriginal.parentNode.appendChild(erro);
        inputPrecoOriginal.focus();
        return;
    }

    document.getElementById('preco-original').style.borderColor = '';

    // Obter cores
    const corFundo = document.getElementById('cor-fundo').value;
    const corTextoPreco = document.getElementById('cor-texto-preco').value;
    const corTitulo = document.getElementById('cor-titulo').value;
    
    // Verificar se está em modo sequencial
    const emModoSequencial = filaEdicaoProdutos.length > 1 && indiceEdicaoAtual < filaEdicaoProdutos.length;
    
    if (emModoSequencial) {
        console.log(`💾 Salvando produto ${indiceEdicaoAtual + 1}/${filaEdicaoProdutos.length} em modo sequencial`);
        
        atualizarProdutoEspecificoNoBanner(
            cardAtualEdicao, 
            indiceEdicaoAtual, 
            novoTitulo, 
            novoSubtitulo, 
            precoOriginal, 
            precoPromocional, 
            corFundo, 
            corTextoPreco, 
            corTitulo
        );
        
        mostrarFeedbackEdicaoSequencial(indiceEdicaoAtual + 1, filaEdicaoProdutos.length);
        indiceEdicaoAtual++;
        document.getElementById('modal-precos').style.display = 'none';
        
        setTimeout(() => {
            iniciarEdicaoSequencial();
        }, 800);
        
    } else {
        console.log('💾 Salvando em modo normal (produto único ou edição individual)');
        
        // EDIÇÃO INDIVIDUAL DE BANNER DE 2 PRODUTOS
        if (cardAtualEdicao.classList.contains('combined-banner') && typeof posicaoProdutoTroca !== 'undefined' && posicaoProdutoTroca >= 0) {
            const secoes = cardAtualEdicao.querySelectorAll('.combined-product-section');
            if (secoes[posicaoProdutoTroca]) {
                console.log(`✅ Atualizando produto ${posicaoProdutoTroca + 1} individualmente (banner 2)`);
                atualizarDadosSecao(secoes[posicaoProdutoTroca], novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
                
                secoes[posicaoProdutoTroca].style.outline = 'none';
                secoes[posicaoProdutoTroca].style.background = 'transparent';
                
                secoes[posicaoProdutoTroca].style.transition = 'all 0.3s ease';
                secoes[posicaoProdutoTroca].style.transform = 'scale(1.05)';
                setTimeout(() => {
                    secoes[posicaoProdutoTroca].style.transform = 'scale(1)';
                }, 300);
            }
        }
        // EDIÇÃO INDIVIDUAL DE BANNER DE 4 PRODUTOS
        else if (cardAtualEdicao.classList.contains('four-products-banner') && typeof posicaoProdutoTroca !== 'undefined' && posicaoProdutoTroca >= 0) {
            const cards = cardAtualEdicao.querySelectorAll('.four-product-card');
            if (cards[posicaoProdutoTroca]) {
                console.log(`✅ Atualizando produto ${posicaoProdutoTroca + 1} individualmente (banner 4)`);
                atualizarDadosCardQuatroProdutos(cards[posicaoProdutoTroca], novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
                
                cards[posicaoProdutoTroca].style.outline = 'none';
                cards[posicaoProdutoTroca].style.background = 'transparent';
                cards[posicaoProdutoTroca].style.transform = 'scale(1)';
                
                cards[posicaoProdutoTroca].style.transition = 'all 0.3s ease';
                cards[posicaoProdutoTroca].style.transform = 'scale(1.08)';
                setTimeout(() => {
                    cards[posicaoProdutoTroca].style.transform = 'scale(1)';
                }, 300);
            }
        }
        // 🎯 NOVO: EDIÇÃO INDIVIDUAL DE BANNER DE 8 PRODUTOS
        else if (cardAtualEdicao.classList.contains('eight-products-banner') && typeof posicaoProdutoTroca !== 'undefined' && posicaoProdutoTroca >= 0) {
            const items = cardAtualEdicao.querySelectorAll('.eight-product-item');
            if (items[posicaoProdutoTroca]) {
                console.log(`✅ Atualizando produto ${posicaoProdutoTroca + 1} individualmente (banner 8)`);
                atualizarDadosItemOitoProdutos(items[posicaoProdutoTroca], novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
                
                items[posicaoProdutoTroca].style.outline = 'none';
                items[posicaoProdutoTroca].style.background = 'rgba(255, 255, 255, 0.9)';
                items[posicaoProdutoTroca].style.transform = 'translateX(0) scale(1)';
                
                items[posicaoProdutoTroca].style.transition = 'all 0.4s ease';
                items[posicaoProdutoTroca].style.transform = 'translateX(12px) scale(1.05)';
                items[posicaoProdutoTroca].style.background = 'rgba(251, 191, 36, 0.2)';
                
                setTimeout(() => {
                    items[posicaoProdutoTroca].style.transform = 'translateX(0) scale(1)';
                    items[posicaoProdutoTroca].style.background = 'rgba(255, 255, 255, 0.9)';
                }, 400);
            }
        }
        // EDIÇÃO GLOBAL (primeira seção/card/item)
        else if (cardAtualEdicao.classList.contains('combined-banner')) {
            const primeiraSecao = cardAtualEdicao.querySelector('.combined-product-section');
            atualizarDadosSecao(primeiraSecao, novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
        } else if (cardAtualEdicao.classList.contains('four-products-banner')) {
            const primeiroCard = cardAtualEdicao.querySelector('.four-product-card');
            atualizarDadosCardQuatroProdutos(primeiroCard, novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
        } else if (cardAtualEdicao.classList.contains('eight-products-banner')) {
            atualizarDadosBannerOitoProdutos(cardAtualEdicao, novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
        } else {
            atualizarDadosBanner(cardAtualEdicao, novoTitulo, novoSubtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
        }
        
        // Feedback visual normal
        const card = cardAtualEdicao;
        card.style.transition = 'all 0.3s ease';
        card.style.transform = 'scale(1.02)';
        card.style.boxShadow = '0 8px 25px rgba(40, 167, 69, 0.4)';
        
        setTimeout(() => {
            card.style.transform = 'scale(1)';
            card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        }, 300);
        
        fecharModal();
        posicaoProdutoTroca = -1;
    }
}

    // ===========================================
// NOVA FUNÇÃO: ATUALIZAR PRODUTO ESPECÍFICO
// ===========================================

function atualizarProdutoEspecificoNoBanner(banner, indice, titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo) {
console.log(`🔧 Atualizando produto ${indice + 1} no banner`);

if (banner.classList.contains('combined-banner')) {
    // Banner de 2 produtos - atualizar seção específica
    const secoes = banner.querySelectorAll('.combined-product-section');
    if (secoes[indice]) {
        atualizarDadosSecao(secoes[indice], titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
    }
} else if (banner.classList.contains('four-products-banner')) {
    // Banner de 4 produtos - atualizar card específico
    const cards = banner.querySelectorAll('.four-product-card');
    if (cards[indice]) {
        atualizarDadosCardQuatroProdutos(cards[indice], titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
    }
} else if (banner.classList.contains('eight-products-banner')) {
    // Banner de 8 produtos - atualizar item específico
    const items = banner.querySelectorAll('.eight-product-item');
    if (items[indice]) {
        atualizarDadosItemOitoProdutos(items[indice], titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo);
    }
}
}

// ===========================================
// NOVA FUNÇÃO: FEEDBACK EDIÇÃO SEQUENCIAL
// ===========================================

function mostrarFeedbackEdicaoSequencial(produtoAtual, total) {
// Criar notificação temporária
const notification = document.createElement('div');
notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: bold;
    z-index: 2000;
    box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
    transform: translateX(100%);
    transition: transform 0.3s ease;
`;

notification.textContent = `✅ Produto ${produtoAtual}/${total} salvo!`;

document.body.appendChild(notification);

// Animar entrada
setTimeout(() => {
    notification.style.transform = 'translateX(0)';
}, 100);

// Remover após delay
setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 300);
}, 2000);
}

// ===========================================
// NOVA FUNÇÃO: FINALIZAR EDIÇÃO SEQUENCIAL
// ===========================================

function finalizarEdicaoSequencial() {
    console.log('🎉 Edição sequencial finalizada!');
    
    // Resetar variáveis
    filaEdicaoProdutos = [];
    indiceEdicaoAtual = 0;
    cardBannerAtual = null;
    produtosDobannerAtual = [];
    
    // Restaurar título do modal
    const tituloModal = document.querySelector('.dt-modal-title');
    if (tituloModal) {
        tituloModal.textContent = 'Editar Produto';
    }
    
    // Feedback final
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: bold;
        z-index: 2000;
        box-shadow: 0 8px 25px rgba(40, 167, 69, 0.4);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        font-size: 14px;
    `;
    
    notification.innerHTML = `
        🎉 Todos os produtos foram editados!<br>
        <small style="font-weight: normal; opacity: 0.9;">Banner pronto para download</small>
    `;
    
    document.body.appendChild(notification);
    
    // Animar entrada
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remover após delay maior
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 4000);
}

// ===========================================
// NOVA FUNÇÃO: ATUALIZAR DADOS ITEM 8 PRODUTOS
// ===========================================

function atualizarDadosItemOitoProdutos(item, titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo) {
    // Atualizar textos
    if (titulo) {
        item.querySelector('.rw-product-title').textContent = titulo;
    }
    if (subtitulo) {
        item.querySelector('.ds-product-subtitle').textContent = subtitulo;
    }
    
    // Atualizar preços
    item.querySelector('.preco-original-valor').textContent = precoOriginal;
    item.querySelector('.preco-promocional-valor').textContent = precoPromocional;
    
    // Aplicar cores
    const precoPromoElement = item.querySelector('.wp-promo-price');
    const tituloElement = item.querySelector('.rw-product-title');
    const subtituloElement = item.querySelector('.ds-product-subtitle');
    const precoDeElement = item.querySelector('.lm-original-price');

    precoPromoElement.style.backgroundColor = corFundo;
    precoPromoElement.style.color = corTextoPreco;
    tituloElement.style.color = corTitulo;
    if (subtituloElement) subtituloElement.style.color = corTitulo;
    if (precoDeElement) precoDeElement.style.color = corTitulo;
}

// ===========================================
// FUNÇÃO PARA CANCELAR EDIÇÃO SEQUENCIAL
// ===========================================

function cancelarEdicaoSequencial() {
    if (filaEdicaoProdutos.length > 1) {
        const resposta = confirm(`Cancelar edição sequencial?\n\nVocê está editando ${filaEdicaoProdutos.length} produtos.\nOs produtos já editados permanecerão salvos.`);
        
        if (resposta) {
            finalizarEdicaoSequencial();
            fecharModal();
        }
        
        return resposta;
    }
    
    return true; // Permite cancelar normalmente se não está em modo sequencial
}


function atualizarDadosSecao(secao, titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo) {
    // Atualizar textos
    if (titulo) {
        secao.querySelector('.rw-product-title').textContent = titulo;
    }
    if (subtitulo) {
        secao.querySelector('.ds-product-subtitle').textContent = subtitulo;
    }
    
    // Atualizar preços
    secao.querySelector('.preco-original-valor').textContent = precoOriginal;
    secao.querySelector('.preco-promocional-valor').textContent = precoPromocional;
    
    // Aplicar cores
    const precoPromoElement = secao.querySelector('.wp-promo-price');
    const tituloElement = secao.querySelector('.rw-product-title');
    const subtituloElement = secao.querySelector('.ds-product-subtitle');
    const precoDeElement = secao.querySelector('.lm-original-price');

    precoPromoElement.style.backgroundColor = corFundo;
    precoPromoElement.style.color = corTextoPreco;
    tituloElement.style.color = corTitulo;
    if (subtituloElement) subtituloElement.style.color = corTitulo;
    if (precoDeElement) precoDeElement.style.color = corTitulo;
}

function atualizarDadosCardQuatroProdutos(card, titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo) {
    // Atualizar textos
    if (titulo) {
        card.querySelector('.rw-product-title').textContent = titulo;
    }
    if (subtitulo) {
        card.querySelector('.ds-product-subtitle').textContent = subtitulo;
    }
    
    // Atualizar preços
    card.querySelector('.preco-original-valor').textContent = precoOriginal;
    card.querySelector('.preco-promocional-valor').textContent = precoPromocional;
    
    // Aplicar cores
    const precoPromoElement = card.querySelector('.wp-promo-price');
    const tituloElement = card.querySelector('.rw-product-title');
    const subtituloElement = card.querySelector('.ds-product-subtitle');
    const precoDeElement = card.querySelector('.lm-original-price');

    precoPromoElement.style.backgroundColor = corFundo;
    precoPromoElement.style.color = corTextoPreco;
    tituloElement.style.color = corTitulo;
    if (subtituloElement) subtituloElement.style.color = corTitulo;
    if (precoDeElement) precoDeElement.style.color = corTitulo;
}

function atualizarDadosBannerOitoProdutos(card, titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo) {
    // Atualizar apenas o primeiro item como referência
    const primeiroItem = card.querySelector('.eight-product-item');
    
    if (titulo) {
        primeiroItem.querySelector('.rw-product-title').textContent = titulo;
    }
    if (subtitulo) {
        primeiroItem.querySelector('.ds-product-subtitle').textContent = subtitulo;
    }
    
    // Atualizar preços
    primeiroItem.querySelector('.preco-original-valor').textContent = precoOriginal;
    primeiroItem.querySelector('.preco-promocional-valor').textContent = precoPromocional;
    
    // Aplicar cores
    const precoPromoElement = primeiroItem.querySelector('.wp-promo-price');
    const tituloElement = primeiroItem.querySelector('.rw-product-title');
    const subtituloElement = primeiroItem.querySelector('.ds-product-subtitle');
    const precoDeElement = primeiroItem.querySelector('.lm-original-price');

    precoPromoElement.style.backgroundColor = corFundo;
    precoPromoElement.style.color = corTextoPreco;
    tituloElement.style.color = corTitulo;
    if (subtituloElement) subtituloElement.style.color = corTitulo;
    if (precoDeElement) precoDeElement.style.color = corTitulo;
}


function atualizarDadosBanner(card, titulo, subtitulo, precoOriginal, precoPromocional, corFundo, corTextoPreco, corTitulo) {
    // Atualizar textos no card
    if (titulo) {
        card.querySelector('.rw-product-title').textContent = titulo;
    }
    if (subtitulo) {
        card.querySelector('.ds-product-subtitle').textContent = subtitulo;
    }
    
    // Atualizar preços
    card.querySelector('.preco-original-valor').textContent = precoOriginal;
    card.querySelector('.preco-promocional-valor').textContent = precoPromocional;
    
    // Aplicar cores
    const precoPromoElement = card.querySelector('.wp-promo-price');
    const tituloElement = card.querySelector('.rw-product-title');
    const subtituloElement = card.querySelector('.ds-product-subtitle');
    const precoDeElement = card.querySelector('.lm-original-price');

    precoPromoElement.style.backgroundColor = corFundo;
    precoPromoElement.style.color = corTextoPreco;
    tituloElement.style.color = corTitulo;
    if (subtituloElement) subtituloElement.style.color = corTitulo;
    if (precoDeElement) precoDeElement.style.color = corTitulo;
}

// ===========================================
// FUNÇÕES DE MODAL AUTOMÁTICO
// ===========================================

function abrirModalEdicaoAutomaticaParaBanner(card, produtos) {
    // Configurar o card atual para edição
    cardAtualEdicao = card;
    
    // Determinar qual produto usar para preencher os campos
    let produtoParaEdicao;
    
    if (card.classList.contains('combined-banner')) {
        produtoParaEdicao = produtos[0];
        console.log('📝 Abrindo editor para banner combinado - editando primeiro produto:', produtoParaEdicao.nome);
    } else if (card.classList.contains('four-products-banner')) {
        produtoParaEdicao = produtos[0];
        console.log('📝 Abrindo editor para banner de 4 produtos - editando primeiro produto:', produtoParaEdicao.nome);
    } else {
        produtoParaEdicao = produtos[0];
        console.log('📝 Abrindo editor para banner individual:', produtoParaEdicao.nome);
    }
    
    // Preencher os campos com os dados do produto
    preencherCamposEditorParaBanner(card, produtoParaEdicao);
    
    // Mostrar modal
    document.getElementById('modal-precos').style.display = 'flex';
    
    // Focar no primeiro campo para facilitar a edição
    setTimeout(() => {
        document.getElementById('produto-titulo').focus();
    }, 100);
    
    console.log('✅ Editor aberto automaticamente para banner com', produtos.length, 'produtos');
}

function preencherCamposEditorParaBanner(card, produto) {
    let titulo, subtitulo, precoOriginal, precoPromocional;
    
    // Obter dados atuais do card
    if (card.classList.contains('combined-banner')) {
        const primeiraSecao = card.querySelector('.combined-product-section');
        titulo = primeiraSecao.querySelector('.rw-product-title').textContent;
        subtitulo = primeiraSecao.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = primeiraSecao.querySelector('.preco-original-valor').textContent;
        precoPromocional = primeiraSecao.querySelector('.preco-promocional-valor').textContent;
    } else if (card.classList.contains('four-products-banner')) {
        const primeiroCard = card.querySelector('.four-product-card');
        titulo = primeiroCard.querySelector('.rw-product-title').textContent;
        subtitulo = primeiroCard.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = primeiroCard.querySelector('.preco-original-valor').textContent;
        precoPromocional = primeiroCard.querySelector('.preco-promocional-valor').textContent;
    } else if (card.classList.contains('eight-products-banner')) {
        const primeiroItem = card.querySelector('.eight-product-item');
        titulo = primeiroItem.querySelector('.rw-product-title').textContent;
        subtitulo = primeiroItem.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = primeiroItem.querySelector('.preco-original-valor').textContent;
        precoPromocional = primeiroItem.querySelector('.preco-promocional-valor').textContent;
     } else {
        titulo = card.querySelector('.rw-product-title').textContent;
        subtitulo = card.querySelector('.ds-product-subtitle').textContent;
        precoOriginal = card.querySelector('.preco-original-valor').textContent;
        precoPromocional = card.querySelector('.preco-promocional-valor').textContent;
    }
    
    // Preencher campos do formulário
    document.getElementById('produto-titulo').value = titulo || produto.nome || '';
    document.getElementById('produto-subtitulo').value = subtitulo || produto.subtitulo || 'Excelente produto especial';
    document.getElementById('preco-original').value = precoOriginal || '00,00';
    document.getElementById('preco-promocional').value = precoPromocional || '00,00';
    
    // Configurar cores padrão
    document.getElementById('cor-fundo').value = '#fbbf24';
    document.getElementById('cor-texto-preco').value = '#1f2937';
    document.getElementById('cor-titulo').value = '#1f2937';
    
    console.log('📝 Campos preenchidos para banner:', {
        titulo: titulo || produto.nome,
        tipo: card.classList.contains('combined-banner') ? 'combinado' : 
            card.classList.contains('four-products-banner') ? '4 produtos' : 
            card.classList.contains('eight-products-banner') ? '8 produtos' : 'individual'
    });
}

// ===========================================
// INICIALIZAÇÃO E EVENT LISTENERS
// ===========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema iniciado - Suporte completo para 1, 2 e 4 produtos');
    
    // Event listeners do modal de preços
    const modalPrecos = document.getElementById('modal-precos');
    if (modalPrecos) {
        modalPrecos.addEventListener('click', function(e) {
            if (e.target === this) {
                fecharModal();
            }
        });
    }
    
    // Event listeners de teclado
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Fechar modais abertos
            if (document.getElementById('modal-precos') && document.getElementById('modal-precos').style.display === 'flex') {
                fecharModal();
            }
            if (document.getElementById('popup-produto') && document.getElementById('popup-produto').style.display === 'flex') {
                fecharPopup('popup-produto');
            }
            if (document.getElementById('zk-products-modal') && document.getElementById('zk-products-modal').style.display === 'flex') {
                fecharPopup('zk-products-modal');
            }
        }
    });
    
    // Event listener do formulário de preços
    const formPrecos = document.getElementById('form-precos');
    if (formPrecos) {
        formPrecos.addEventListener('submit', salvarPrecos);
    }
    
    // Event listeners para campos de preço (formatação automática)
    const precoOriginal = document.getElementById('preco-original');
    const precoPromocional = document.getElementById('preco-promocional');
    
    if (precoOriginal) {
        precoOriginal.addEventListener('blur', function() {
            this.value = formatarPreco(this.value);
        });

        precoOriginal.addEventListener('input', function() {
            const erroAnterior = document.getElementById('erro-preco-original');
            if (erroAnterior) erroAnterior.remove();
            this.style.borderColor = '';

            const deNum = parseFloat(formatarPreco(this.value).replace(',', '.'));
            const porNum = parseFloat(formatarPreco(document.getElementById('preco-promocional').value).replace(',', '.'));

            if (deNum < porNum) {
                const erro = document.createElement('div');
                erro.id = 'erro-preco-original';
                erro.style.cssText = `
                    color: #dc2626;
                    font-size: 12px;
                    font-weight: 600;
                    margin-top: 4px;
                    padding: 6px 10px;
                    background: #fef2f2;
                    border: 1px solid #fca5a5;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                `;
                erro.innerHTML = '⚠️ O preço "De:" não pode ser menor que o preço "Por:"';
                this.style.borderColor = '#dc2626';
                this.parentNode.appendChild(erro);
            }
        });
    }

    if (precoPromocional) {
        precoPromocional.addEventListener('blur', function() {
            this.value = formatarPreco(this.value);
        });

        precoPromocional.addEventListener('input', function() {
            document.getElementById('preco-original').dispatchEvent(new Event('input'));
        });
    }
    
    // Carregar dados iniciais (se função existir)
    if (typeof buscarTemas === 'function') {
        buscarTemas();
    }
    
    console.log('✅ Event listeners configurados');
    console.log('📋 Fluxo: 1 produto = banner individual | 2 produtos = banner vertical | 4 produtos = banner grid 2x2');
});

// ===========================================
// FUNÇÕES DE DEBUG E UTILITÁRIOS
// ===========================================

function debugEstado() {
    console.log('=== ESTADO ATUAL ===');
    console.log('Tema selecionado:', temaSelecionado?.nome || 'Nenhum');
    
    const banners = document.querySelectorAll('.mn-product-tile:not(.nh-preview-card)');
    const bannersIndividuais = document.querySelectorAll('.mn-product-tile:not(.nh-preview-card):not(.combined-banner):not(.four-products-banner)').length;
    const bannersCombinados = document.querySelectorAll('.mn-product-tile.combined-banner').length;
    const bannersQuatroProdutos = document.querySelectorAll('.mn-product-tile.four-products-banner').length;
    
    console.log('Total de banners:', banners.length);
    console.log('Banners individuais (1 produto):', bannersIndividuais);
    console.log('Banners verticais combinados (2 produtos):', bannersCombinados);
    console.log('Banners grid 2x2 (4 produtos):', bannersQuatroProdutos);
    
    console.log('Modo edição:', typeof modoEdicao !== 'undefined' ? modoEdicao : 'undefined');
    console.log('Abrir editor automaticamente:', typeof abrirEditorAutomaticamente !== 'undefined' ? abrirEditorAutomaticamente : 'undefined');
    console.log('===================');
}

function resetarSistema() {
    // Limpar variáveis globais (verificar se existem)
    if (typeof produtosSelecionados !== 'undefined') produtosSelecionados = [];
    if (typeof tipoTemplateAtual !== 'undefined') tipoTemplateAtual = null;
    if (typeof cardAtualEdicao !== 'undefined') cardAtualEdicao = null;
    if (typeof cardSendoEditado !== 'undefined') cardSendoEditado = null;
    if (typeof modoEdicao !== 'undefined') modoEdicao = false;
    if (typeof abrirEditorAutomaticamente !== 'undefined') abrirEditorAutomaticamente = false;
    if (typeof produtoRecemAdicionado !== 'undefined') produtoRecemAdicionado = null;
    
    // Fechar todos os popups (verificar se existem)
    const popupProduto = document.getElementById('popup-produto');
    const zkProductsModal = document.getElementById('zk-products-modal');
    const modalPrecos = document.getElementById('modal-precos');
    
    if (popupProduto) popupProduto.style.display = 'none';
    if (zkProductsModal) zkProductsModal.style.display = 'none';
    if (modalPrecos) modalPrecos.style.display = 'none';
    
    console.log('🔄 Sistema resetado');
}

// Disponibilizar funções para debug no console
window.debugSistema = {
    estado: debugEstado,
    resetar: resetarSistema,
    abrirEditor: () => {
        const primeiroCard = document.querySelector('.mn-product-tile:not(.nh-preview-card)');
        if (primeiroCard) {
            abrirModalPrecos({ closest: () => primeiroCard });
        } else {
            console.warn('Nenhum produto encontrado para editar');
        }
    },
    simularBannerVertical: () => {
        if (typeof produtos !== 'undefined' && produtos.length >= 2) {
            adicionarProdutosAoCanvas([produtos[0], produtos[1]]);
            console.log('✅ Banner vertical criado para teste');
        } else {
            console.warn('Produtos insuficientes para teste');
        }
    },
    simularBannerQuatroProdutos: () => {
        if (typeof produtos !== 'undefined' && produtos.length >= 4) {
            adicionarProdutosAoCanvas([produtos[0], produtos[1], produtos[2], produtos[3]]);
            console.log('✅ Banner de 4 produtos criado para teste');
        } else {
            console.warn('Produtos insuficientes para teste (necessário 4)');
        }
    }
};

console.log("=== DEBUG BANDEIRAS ===");

// Aguarda um pouco para garantir que tudo carregou
setTimeout(() => {
  // Verifica TODOS os selects de bandeira na página
  const bandeiraFilter = document.getElementById("bandeiraFilter");
  const bandeiraSelect = document.getElementById("bandeira-select");
  
  //console.log("1️⃣ bandeiraFilter (filtro):", bandeiraFilter);
  if (bandeiraFilter) {
    console.log("   → Options:", bandeiraFilter.options.length);
    for (let opt of bandeiraFilter.options) {
      console.log(`      ${opt.value}: ${opt.textContent}`);
    }
  }
  
  //console.log("2️⃣ bandeira-select (formulário):", bandeiraSelect);
  if (bandeiraSelect) {
    console.log("   → Options:", bandeiraSelect.options.length);
    for (let opt of bandeiraSelect.options) {
      //console.log(`      ${opt.value}: ${opt.textContent}`);
    }
  }
  
  // Verifica se há duplicatas
  const allSelects = document.querySelectorAll('select[id*="bandeira"]');
  console.log("3️⃣ Total de selects de bandeira:", allSelects.length);
  allSelects.forEach((sel, i) => {
    console.log(`   Select ${i + 1}: id="${sel.id}", options=${sel.options.length}`);
  });
  
}, 2000); // Aguarda 2 segundos
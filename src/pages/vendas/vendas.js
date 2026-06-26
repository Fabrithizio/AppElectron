const { ipcRenderer } = require('electron');

const itens = [];
const form = document.getElementById('vendaForm');
const autocompleteList = document.getElementById('autocomplete-list');
const productList = document.getElementById('produto-list');
const quickProducts = document.getElementById('produtosRapidos');
const itensTableBody = document.getElementById('itensTabela').tBodies[0];
let allProducts = [];
let productCatalogEnabled = false;
let stockControlEnabled = false;
let selectedProduct = null;

function showModal(message) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-text').textContent = message;
  modal.style.display = 'block';
}

function hideModal() {
  document.getElementById('modal').style.display = 'none';
}

function getTodayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function updateItemsSummary() {
  const descricao = itens
    .map((item) => `Item: ${item.nome} / Quant: ${item.quantidade} / Valor: R$ ${formatMoney(item.valor)}`)
    .join('\n');
  document.getElementById('descricao').value = descricao;
}

function updateTotalValue() {
  const total = itens.reduce((sum, item) => sum + item.quantidade * item.valor, 0);
  document.getElementById('preco').value = formatMoney(total);
  document.getElementById('totalVendaTexto').textContent = formatCurrency(total);
}

function availableStockForProduct(produto) {
  const alreadyInCart = itens
    .filter((item) => item.produto_id === produto.id)
    .reduce((total, item) => total + Number(item.quantidade || 0), 0);
  return Number(produto.quantidade || 0) - alreadyInCart;
}

function addItem({ nome, quantidade, valor, produto = null }) {
  if (!nome || !Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(valor) || valor <= 0) {
    showModal('Preencha item, quantidade e valor corretamente.');
    return false;
  }

  if (produto && produto.controlar_estoque && availableStockForProduct(produto) < quantidade) {
    showModal(`Estoque insuficiente para ${produto.nome}. Disponivel: ${availableStockForProduct(produto)}.`);
    return false;
  }

  itens.push({
    nome,
    quantidade,
    valor,
    produto_id: produto ? produto.id : null,
    controlar_estoque: produto ? Boolean(produto.controlar_estoque) : false,
  });
  updateItemsSummary();
  renderItemsTable();
  updateTotalValue();
  return true;
}

function renderItemsTable() {
  itensTableBody.innerHTML = '';
  itens.forEach((item) => {
    const row = itensTableBody.insertRow();
    row.insertCell().textContent = item.nome;
    row.insertCell().textContent = item.quantidade;
    row.insertCell().textContent = formatCurrency(item.valor);
    row.insertCell().textContent = formatCurrency(item.quantidade * item.valor);
  });
}

function clearItemFields() {
  document.querySelector('.item-nome').value = '';
  document.querySelector('.item-quantidade').value = '';
  document.querySelector('.item-quantidade').removeAttribute('max');
  document.querySelector('.item-valor').value = '';
  productList.innerHTML = '';
  selectedProduct = null;
}

function clearSaleForm() {
  itens.splice(0, itens.length);
  document.getElementById('cliente').value = '';
  document.getElementById('descricao').value = '';
  document.getElementById('preco').value = '';
  document.getElementById('metodo_pagamento').value = 'Fiado';
  clearItemFields();
  renderItemsTable();
  updateTotalValue();
}

function productMeta(produto) {
  const pieces = [];
  if (produto.codigo) {
    pieces.push(produto.codigo);
  }
  if (produto.categoria) {
    pieces.push(produto.categoria);
  }
  if (produto.controlar_estoque) {
    pieces.push(`Estoque ${Number(produto.quantidade || 0)} ${produto.unidade || 'un'}`);
  }
  return pieces.join(' | ');
}

function renderQuickProducts(produtos) {
  quickProducts.innerHTML = '';
  if (!productCatalogEnabled) {
    quickProducts.innerHTML = '<p>Catalogo desativado nas configuracoes.</p>';
    return;
  }

  produtos.slice(0, 24).forEach((produto) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-product';
    button.innerHTML = `
      <strong>${produto.nome}</strong>
      <span>${formatCurrency(produto.preco_venda)}</span>
      <small>${productMeta(produto) || 'Produto cadastrado'}</small>
    `;
    button.addEventListener('click', () => {
      addItem({
        nome: produto.nome,
        quantidade: 1,
        valor: Number(produto.preco_venda || 0),
        produto,
      });
      document.getElementById('codigoBarras').focus();
    });
    quickProducts.appendChild(button);
  });
}

function filterQuickProducts(term) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    renderQuickProducts(allProducts);
    return;
  }

  renderQuickProducts(allProducts.filter((produto) => (
    String(produto.nome || '').toLowerCase().includes(normalized) ||
    String(produto.codigo || '').toLowerCase().includes(normalized) ||
    String(produto.categoria || '').toLowerCase().includes(normalized)
  )));
}

async function loadQuickProducts() {
  allProducts = await ipcRenderer.invoke('produtos:list');
  renderQuickProducts(allProducts);
}

document.querySelector('.adicionarItem').addEventListener('click', () => {
  const nome = document.querySelector('.item-nome').value.trim();
  const quantidade = Number(document.querySelector('.item-quantidade').value);
  const valor = Number(document.querySelector('.item-valor').value);

  if (addItem({ nome, quantidade, valor, produto: selectedProduct })) {
    clearItemFields();
  }
});

document.getElementById('produtoBuscaRapida').addEventListener('input', (event) => {
  filterQuickProducts(event.target.value);
});

document.querySelector('.removerItem').addEventListener('click', () => {
  itens.pop();
  updateItemsSummary();
  renderItemsTable();
  updateTotalValue();
});

document.querySelector('.item-nome').addEventListener('input', async (event) => {
  productList.innerHTML = '';
  selectedProduct = null;
  if (!productCatalogEnabled) {
    return;
  }

  const term = event.target.value.trim();
  if (!term) {
    return;
  }

  const produtos = await ipcRenderer.invoke('produtos:search', term, 6);
  produtos.forEach((produto) => {
    const item = document.createElement('div');
    item.textContent = `${produto.nome} - R$ ${Number(produto.preco_venda || 0).toFixed(2)}`;
    item.addEventListener('click', () => {
      selectedProduct = produto;
      document.querySelector('.item-nome').value = produto.nome;
      document.querySelector('.item-valor').value = Number(produto.preco_venda || 0).toFixed(2);
      document.querySelector('.item-quantidade').value = document.querySelector('.item-quantidade').value || '1';
      if (produto.controlar_estoque && stockControlEnabled) {
        document.querySelector('.item-quantidade').max = String(produto.quantidade || 0);
      }
      productList.innerHTML = '';
    });
    productList.appendChild(item);
  });
});

async function addByBarcode() {
  const input = document.getElementById('codigoBarras');
  const codigo = input.value.trim();
  if (!codigo) {
    input.focus();
    return;
  }

  const produto = await ipcRenderer.invoke('produtos:get-by-code', codigo);
  if (!produto) {
    showModal('Produto nao encontrado para este codigo.');
    input.select();
    return;
  }

  const added = addItem({
    nome: produto.nome,
    quantidade: 1,
    valor: Number(produto.preco_venda || 0),
    produto,
  });

  if (added) {
    input.value = '';
    input.focus();
  }
}

document.getElementById('buscarCodigo').addEventListener('click', () => {
  addByBarcode().catch((err) => {
    console.error(err);
    showModal('Nao foi possivel adicionar por codigo.');
  });
});

document.getElementById('codigoBarras').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addByBarcode().catch((err) => {
      console.error(err);
      showModal('Nao foi possivel adicionar por codigo.');
    });
  }
});

document.getElementById('cliente').addEventListener('input', async (event) => {
  const clientName = event.target.value.trim();
  autocompleteList.innerHTML = '';

  if (!clientName) {
    return;
  }

  const rows = await ipcRenderer.invoke('clientes:autocomplete', clientName, 5);
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = row.nome;
    item.addEventListener('click', () => {
      document.getElementById('cliente').value = row.nome;
      autocompleteList.innerHTML = '';
    });
    autocompleteList.appendChild(item);
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const venda = {
    cliente: document.getElementById('cliente').value.trim(),
    metodoPagamento: document.getElementById('metodo_pagamento').value,
    descricao: document.getElementById('descricao').value,
    preco: Number(document.getElementById('preco').value),
    dataVenda: getTodayIsoDate(),
    itens,
  };

  if (!venda.cliente || itens.length === 0 || !Number.isFinite(venda.preco) || venda.preco <= 0) {
    showModal('Preencha cliente e pelo menos um item.');
    return;
  }

  const result = await ipcRenderer.invoke('vendas:create', venda);
  if (result && result.cancelled) {
    showModal('Venda cancelada antes de registrar.');
    return;
  }

  clearSaleForm();
  showModal('Venda realizada.');
});

document.querySelector('.close-button').addEventListener('click', hideModal);
window.addEventListener('click', (event) => {
  if (event.target === document.getElementById('modal')) {
    hideModal();
  }
});

ipcRenderer.invoke('app:config')
  .then((config) => {
    productCatalogEnabled = Boolean(config.modules.simpleProducts);
    stockControlEnabled = Boolean(config.modules.stockControl);
    document.getElementById('codigoBarras').disabled = !productCatalogEnabled;
    document.getElementById('buscarCodigo').disabled = !productCatalogEnabled;
    if (productCatalogEnabled) {
      document.getElementById('codigoBarras').focus();
      return loadQuickProducts();
    }
    renderQuickProducts([]);
    return null;
  })
  .catch((err) => {
    console.error('Nao foi possivel carregar configuracao de produtos:', err);
  });

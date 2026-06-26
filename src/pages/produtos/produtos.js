const { ipcRenderer } = require('electron');

const form = document.getElementById('produtoForm');
const tbody = document.getElementById('tabelaProdutos').tBodies[0];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function getFormData() {
  return {
    id: document.getElementById('produtoId').value || null,
    nome: document.getElementById('produtoNome').value.trim(),
    codigo: document.getElementById('produtoCodigo').value.trim(),
    categoria: document.getElementById('produtoCategoria').value.trim(),
    fornecedor: document.getElementById('produtoFornecedor').value.trim(),
    preco_venda: Number(document.getElementById('produtoPrecoVenda').value),
    preco_custo: Number(document.getElementById('produtoPrecoCusto').value || 0),
    unidade: document.getElementById('produtoUnidade').value.trim() || 'un',
    quantidade: Number(document.getElementById('produtoQuantidade').value || 0),
    estoque_minimo: Number(document.getElementById('produtoEstoqueMinimo').value || 0),
    localizacao: document.getElementById('produtoLocalizacao').value.trim(),
    observacao: document.getElementById('produtoObservacao').value.trim(),
    controlar_estoque: document.getElementById('produtoControlarEstoque').checked,
  };
}

function fillForm(produto) {
  document.getElementById('produtoId').value = produto.id;
  document.getElementById('produtoNome').value = produto.nome || '';
  document.getElementById('produtoCodigo').value = produto.codigo || '';
  document.getElementById('produtoCategoria').value = produto.categoria || '';
  document.getElementById('produtoFornecedor').value = produto.fornecedor || '';
  document.getElementById('produtoPrecoVenda').value = Number(produto.preco_venda || 0).toFixed(2);
  document.getElementById('produtoPrecoCusto').value = Number(produto.preco_custo || 0).toFixed(2);
  document.getElementById('produtoUnidade').value = produto.unidade || 'un';
  document.getElementById('produtoQuantidade').value = Number(produto.quantidade || 0);
  document.getElementById('produtoEstoqueMinimo').value = Number(produto.estoque_minimo || 0);
  document.getElementById('produtoLocalizacao').value = produto.localizacao || '';
  document.getElementById('produtoObservacao').value = produto.observacao || '';
  document.getElementById('produtoControlarEstoque').checked = Boolean(produto.controlar_estoque);
}

function clearForm() {
  form.reset();
  document.getElementById('produtoId').value = '';
}

function renderProdutos(produtos) {
  tbody.innerHTML = '';

  produtos.forEach((produto) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = produto.nome;
    row.insertCell().textContent = produto.codigo || '-';
    row.insertCell().textContent = produto.categoria || '-';
    row.insertCell().textContent = formatCurrency(produto.preco_venda);
    row.insertCell().textContent = produto.preco_custo ? formatCurrency(produto.preco_custo) : '-';
    row.insertCell().textContent = produto.controlar_estoque ? `${Number(produto.quantidade || 0)} ${produto.unidade || 'un'}` : '-';
    row.insertCell().textContent = produto.controlar_estoque ? Number(produto.estoque_minimo || 0) : '-';
    row.insertCell().textContent = produto.localizacao || '-';
    row.insertCell().textContent = produto.controlar_estoque ? 'Sim' : 'Nao';

    const actions = row.insertCell();
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => fillForm(produto));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'secondary';
    deleteButton.textContent = 'Desativar';
    deleteButton.addEventListener('click', async () => {
      const result = await ipcRenderer.invoke('produtos:delete', produto.id);
      if (result.deleted) {
        await loadProdutos();
      }
    });

    actions.append(editButton, deleteButton);
  });
}

async function loadLowStock() {
  const rows = await ipcRenderer.invoke('produtos:low-stock');
  const box = document.getElementById('estoqueBaixo');
  if (!rows.length) {
    box.textContent = 'Nenhum produto abaixo do estoque minimo.';
    box.classList.remove('is-danger');
    return;
  }

  box.classList.add('is-danger');
  box.textContent = `Estoque baixo: ${rows.slice(0, 5).map((item) => `${item.nome} (${item.quantidade})`).join(', ')}`;
}

async function loadProdutos(term = '') {
  const produtos = term
    ? await ipcRenderer.invoke('produtos:search', term, 30)
    : await ipcRenderer.invoke('produtos:list');
  renderProdutos(produtos);
  await loadLowStock();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const produto = getFormData();

  if (!produto.nome || !Number.isFinite(produto.preco_venda) || produto.preco_venda <= 0) {
    alert('Informe nome e preco de venda.');
    return;
  }

  await ipcRenderer.invoke('produtos:save', produto);
  clearForm();
  await loadProdutos();
});

document.getElementById('limparForm').addEventListener('click', clearForm);
document.getElementById('buscaProduto').addEventListener('input', (event) => {
  loadProdutos(event.target.value.trim()).catch((err) => {
    console.error(err);
    alert('Nao foi possivel buscar produtos.');
  });
});

loadProdutos().catch((err) => {
  console.error(err);
  alert('Nao foi possivel carregar produtos.');
});

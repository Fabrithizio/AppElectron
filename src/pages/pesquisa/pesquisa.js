const { ipcRenderer } = require('electron');

const searchInput = document.getElementById('search');
const suggestions = document.getElementById('results');
const clientList = document.getElementById('clientes-lista');
const clientDetails = document.getElementById('results-dados');
const emptyState = document.getElementById('empty-state');
const historyBox = document.getElementById('historico-div');
const paymentInput = document.getElementById('paymentValue');
const paymentButton = document.getElementById('paymentButton');
const paymentHint = document.getElementById('paymentHint');
const historyButton = document.getElementById('historico');
let selectedClient = null;

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function showModalMessage(message) {
  document.getElementById('modal-text').textContent = message;
  document.getElementById('modal').style.display = 'block';
}

function hideModal() {
  document.getElementById('modal').style.display = 'none';
}

function createField(label, value) {
  const field = document.createElement('div');
  field.className = 'field';

  const title = document.createElement('span');
  title.textContent = label;

  const content = document.createElement('strong');
  content.textContent = value || '-';

  field.append(title, content);
  return field;
}

function setClientActions(cliente) {
  const debt = Number(cliente.divida || 0);
  paymentInput.disabled = debt <= 0;
  paymentButton.disabled = debt <= 0;
  historyButton.disabled = false;
  paymentHint.textContent = debt > 0
    ? `Divida atual: ${formatCurrency(debt)}`
    : 'Este cliente nao possui divida aberta.';
}

function renderClient(cliente) {
  selectedClient = cliente;
  emptyState.style.display = 'none';
  clientDetails.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'client-card';

  const title = document.createElement('h2');
  title.textContent = cliente.nome;
  card.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'field-grid';
  grid.append(
    createField('Nascimento', formatDate(cliente.DataNascimento)),
    createField('CPF', cliente.cpf),
    createField('RG', cliente.rg),
    createField('Endereco', cliente.endereco),
    createField('Telefone', cliente.telefone),
    createField('Email', cliente.email),
    createField('Divida atual', formatCurrency(cliente.divida)),
    createField('Ultimo pagamento', formatDate(cliente.dataPagamento)),
  );
  card.appendChild(grid);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'danger-button';
  removeButton.textContent = 'Inativar cliente';
  removeButton.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('clientes:delete', cliente.id);
    if (result.deleted) {
      selectedClient = null;
      clientDetails.innerHTML = '';
      emptyState.style.display = 'flex';
      searchInput.value = '';
      historyBox.innerHTML = '';
      setClientActions({ divida: 0 });
      historyButton.disabled = true;
      showModalMessage('Cliente inativado.');
    }
  });
  card.appendChild(removeButton);

  clientDetails.appendChild(card);
  setClientActions(cliente);
  loadHistory().catch(console.error);
}

async function selectClientByName(nome) {
  const cliente = await ipcRenderer.invoke('clientes:get-by-name', nome);
  if (!cliente) {
    showModalMessage('Cliente nao encontrado.');
    return;
  }

  searchInput.value = cliente.nome;
  suggestions.innerHTML = '';
  renderClient(cliente);
}

async function autocomplete() {
  const searchTerm = searchInput.value.trim();
  suggestions.innerHTML = '';

  if (!searchTerm) {
    return;
  }

  const clientes = await ipcRenderer.invoke('clientes:autocomplete', searchTerm, 10);
  clientes.forEach((cliente) => {
    const item = document.createElement('div');
    item.textContent = cliente.nome;
    item.addEventListener('click', () => {
      selectClientByName(cliente.nome).catch(console.error);
    });
    suggestions.appendChild(item);
  });
}

async function search() {
  const searchTerm = searchInput.value.trim();
  if (!searchTerm) {
    showModalMessage('Digite o nome do cliente.');
    return;
  }

  await selectClientByName(searchTerm);
}

function renderClientList(clientes) {
  clientList.innerHTML = '';
  clientes.forEach((cliente) => {
    const item = document.createElement('div');
    item.className = 'client-item';
    const name = document.createElement('strong');
    name.textContent = cliente.nome;
    const meta = document.createElement('span');
    meta.textContent = `${cliente.telefone || 'sem telefone'} | divida ${formatCurrency(cliente.divida)}`;
    item.append(name, meta);
    item.addEventListener('click', () => {
      selectClientByName(cliente.nome).catch(console.error);
    });
    clientList.appendChild(item);
  });
}

async function showClientes() {
  const clientes = await ipcRenderer.invoke('clientes:list');
  renderClientList(clientes);
}

function renderHistoryGroup(title, rows, formatter) {
  const group = document.createElement('div');
  group.className = 'history-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.appendChild(heading);

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-row';
    empty.textContent = 'Nenhum registro.';
    group.appendChild(empty);
    return group;
  }

  rows.slice(0, 20).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'history-row';
    item.textContent = formatter(row);
    group.appendChild(item);
  });

  return group;
}

async function loadHistory() {
  historyBox.innerHTML = '';
  if (!selectedClient) {
    return;
  }

  const [vendas, pagamentos] = await Promise.all([
    ipcRenderer.invoke('vendas:list-by-cliente', selectedClient.nome),
    ipcRenderer.invoke('pagamentos:list-by-cliente', selectedClient.nome),
  ]);

  historyBox.appendChild(renderHistoryGroup('Compras', vendas, (venda) => (
    `${formatDate(venda.dataVenda)} | ${formatCurrency(venda.preco)} | ${venda.metodoPagamento}\n${venda.descricao || ''}`
  )));
  historyBox.appendChild(renderHistoryGroup('Pagamentos', pagamentos, (pagamento) => (
    `${formatDate(pagamento.data_pagamento)} | pago ${formatCurrency(pagamento.valor_pago)} | restante ${formatCurrency(pagamento.divida_restante)}`
  )));
}

async function registerPayment() {
  if (!selectedClient) {
    return;
  }

  const valorPagamento = Number(paymentInput.value);
  const dividaAnterior = Number(selectedClient.divida || 0);

  if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) {
    showModalMessage('Insira um valor de pagamento valido.');
    return;
  }

  if (valorPagamento > dividaAnterior) {
    showModalMessage('O pagamento nao pode ser maior que a divida.');
    return;
  }

  const result = await ipcRenderer.invoke('pagamentos:create', {
    nomePagador: selectedClient.nome,
    dividaAnterior,
    valorPagamento,
  });

  if (result && result.cancelled) {
    showModalMessage('Pagamento cancelado antes de registrar.');
    return;
  }

  paymentInput.value = '';
  await selectClientByName(selectedClient.nome);
  showModalMessage('Pagamento registrado.');
}

searchInput.addEventListener('input', () => {
  autocomplete().catch((err) => {
    console.error(err);
    showModalMessage('Nao foi possivel buscar clientes.');
  });
});

document.getElementById('pesquisar').addEventListener('click', () => {
  search().catch((err) => {
    console.error(err);
    showModalMessage('Nao foi possivel pesquisar.');
  });
});

document.getElementById('verClientes').addEventListener('click', () => {
  showClientes().catch((err) => {
    console.error(err);
    showModalMessage('Nao foi possivel carregar clientes.');
  });
});

paymentButton.addEventListener('click', () => {
  registerPayment().catch((err) => {
    console.error(err);
    showModalMessage('Nao foi possivel registrar pagamento.');
  });
});

historyButton.addEventListener('click', () => {
  loadHistory().catch((err) => {
    console.error(err);
    showModalMessage('Nao foi possivel carregar historico.');
  });
});

document.querySelector('.close-button').addEventListener('click', hideModal);
window.addEventListener('click', (event) => {
  if (event.target === document.getElementById('modal')) {
    hideModal();
  }
});

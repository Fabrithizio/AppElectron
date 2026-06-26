const { ipcRenderer } = require('electron');

const table = document.getElementById('tabela-historico');
const thead = table.tHead || table.createTHead();
const tbody = table.tBodies[0];
const tabVendas = document.getElementById('tabVendas');
const tabPagamentos = document.getElementById('tabPagamentos');
let currentType = 'vendas';

function isoDate(date) {
  return date.toISOString().split('T')[0];
}

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  document.getElementById('dataInicio').value = isoDate(start);
  document.getElementById('dataFim').value = isoDate(end);
}

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

function getFilters() {
  return {
    dataInicio: document.getElementById('dataInicio').value,
    dataFim: document.getElementById('dataFim').value,
    cliente: document.getElementById('clienteFiltro').value.trim(),
    limit: Number(document.getElementById('limiteFiltro').value),
  };
}

function renderHeader(headers) {
  thead.innerHTML = '';
  const row = thead.insertRow();
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    row.appendChild(th);
  });
}

function setSummary(title, count, totalText = '') {
  document.getElementById('summaryTitle').textContent = title;
  document.getElementById('summaryCount').textContent = `${count} registros`;
  document.getElementById('summaryTotal').textContent = totalText;
}

function renderSales(vendas) {
  renderHeader(['ID', 'Data', 'Cliente', 'Metodo', 'Descricao', 'Valor', 'Cancelar']);
  tbody.innerHTML = '';

  vendas.forEach((venda) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = venda.id;
    row.insertCell().textContent = formatDate(venda.dataVenda);
    row.insertCell().textContent = venda.cliente;
    row.insertCell().textContent = venda.metodoPagamento;
    row.insertCell().textContent = venda.descricao || '-';
    row.insertCell().textContent = formatCurrency(venda.preco);

    const actions = row.insertCell();
    const button = document.createElement('button');
    button.className = 'delete-button';
    button.textContent = 'Cancelar';
    button.addEventListener('click', async () => {
      const result = await ipcRenderer.invoke('vendas:delete', venda.id);
      if (result.deleted) {
        await loadCurrent();
      }
    });
    actions.appendChild(button);
  });

  const total = vendas.reduce((sum, venda) => sum + Number(venda.preco || 0), 0);
  setSummary('Vendas no periodo', vendas.length, `Total exibido: ${formatCurrency(total)}`);
}

function renderPayments(pagamentos) {
  renderHeader(['ID', 'Data', 'Cliente', 'Pago', 'Divida anterior', 'Divida restante', 'Cancelar']);
  tbody.innerHTML = '';

  pagamentos.forEach((pagamento) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = pagamento.id;
    row.insertCell().textContent = formatDate(pagamento.data_pagamento);
    row.insertCell().textContent = pagamento.nome_pagador;
    row.insertCell().textContent = formatCurrency(pagamento.valor_pago);
    row.insertCell().textContent = formatCurrency(pagamento.divida_anterior);
    row.insertCell().textContent = formatCurrency(pagamento.divida_restante);

    const actions = row.insertCell();
    const button = document.createElement('button');
    button.className = 'delete-button';
    button.textContent = 'Cancelar';
    button.addEventListener('click', async () => {
      const result = await ipcRenderer.invoke('pagamentos:delete', pagamento.id);
      if (result.deleted) {
        await loadCurrent();
      }
    });
    actions.appendChild(button);
  });

  const total = pagamentos.reduce((sum, pagamento) => sum + Number(pagamento.valor_pago || 0), 0);
  setSummary('Pagamentos no periodo', pagamentos.length, `Total exibido: ${formatCurrency(total)}`);
}

async function loadCurrent() {
  const filters = getFilters();
  if (currentType === 'vendas') {
    const vendas = await ipcRenderer.invoke('vendas:list-filtered', filters);
    renderSales(vendas);
    return;
  }

  const pagamentos = await ipcRenderer.invoke('pagamentos:list-filtered', filters);
  renderPayments(pagamentos);
}

function setActiveTab(type) {
  currentType = type;
  tabVendas.classList.toggle('active', type === 'vendas');
  tabPagamentos.classList.toggle('active', type === 'pagamentos');
}

tabVendas.addEventListener('click', () => {
  setActiveTab('vendas');
  loadCurrent().catch(console.error);
});

tabPagamentos.addEventListener('click', () => {
  setActiveTab('pagamentos');
  loadCurrent().catch(console.error);
});

document.getElementById('buscarHistorico').addEventListener('click', () => {
  loadCurrent().catch((err) => {
    console.error(err);
    alert('Nao foi possivel carregar o historico.');
  });
});

setDefaultDates();
loadCurrent().catch(console.error);

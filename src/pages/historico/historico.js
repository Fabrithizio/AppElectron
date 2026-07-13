const { ipcRenderer } = require('electron');

const table = document.getElementById('tabela-historico');
const thead = table.tHead || table.createTHead();
const tbody = table.tBodies[0];
const tabVendas = document.getElementById('tabVendas');
const tabPagamentos = document.getElementById('tabPagamentos');
let currentType = 'vendas';
let currentExport = { headers: [], rows: [] };
let canUseOperationalCorrections = false;

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

function setSummary(title, count) {
  document.getElementById('summaryTitle').textContent = title;
  document.getElementById('summaryCount').textContent = `${count} registros`;
}

function validateFilters() {
  const filters = getFilters();
  if (!filters.dataInicio || !filters.dataFim) {
    alert('Informe inicio e fim do periodo.');
    return false;
  }

  if (filters.dataInicio > filters.dataFim) {
    alert('A data inicial nao pode ser maior que a data final.');
    return false;
  }

  return true;
}

function renderSales(vendas) {
  renderHeader(canUseOperationalCorrections
    ? ['ID', 'Data', 'Cliente', 'Metodo', 'Descricao', 'Valor', 'Cancelar']
    : ['ID', 'Data', 'Cliente', 'Metodo', 'Descricao', 'Valor']);
  tbody.innerHTML = '';
  currentExport = {
    headers: ['ID', 'Data', 'Cliente', 'Metodo', 'Descricao', 'Valor'],
    rows: vendas.map((venda) => ({
      ID: venda.id,
      Data: formatDate(venda.dataVenda),
      Cliente: venda.cliente,
      Metodo: venda.metodoPagamento,
      Descricao: venda.descricao || '',
      Valor: formatCurrency(venda.preco),
    })),
  };

  vendas.forEach((venda) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = venda.id;
    row.insertCell().textContent = formatDate(venda.dataVenda);
    row.insertCell().textContent = venda.cliente;
    row.insertCell().textContent = venda.metodoPagamento;
    row.insertCell().textContent = venda.descricao || '-';
    row.insertCell().textContent = formatCurrency(venda.preco);

    if (canUseOperationalCorrections) {
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
    }
  });

  setSummary('Vendas no periodo', vendas.length);
}

function renderPayments(pagamentos) {
  renderHeader(canUseOperationalCorrections
    ? ['ID', 'Data', 'Cliente', 'Pago', 'Divida anterior', 'Divida restante', 'Cancelar']
    : ['ID', 'Data', 'Cliente', 'Pago', 'Divida anterior', 'Divida restante']);
  tbody.innerHTML = '';
  currentExport = {
    headers: ['ID', 'Data', 'Cliente', 'Pago', 'Divida anterior', 'Divida restante'],
    rows: pagamentos.map((pagamento) => ({
      ID: pagamento.id,
      Data: formatDate(pagamento.data_pagamento),
      Cliente: pagamento.nome_pagador,
      Pago: formatCurrency(pagamento.valor_pago),
      'Divida anterior': formatCurrency(pagamento.divida_anterior),
      'Divida restante': formatCurrency(pagamento.divida_restante),
    })),
  };

  pagamentos.forEach((pagamento) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = pagamento.id;
    row.insertCell().textContent = formatDate(pagamento.data_pagamento);
    row.insertCell().textContent = pagamento.nome_pagador;
    row.insertCell().textContent = formatCurrency(pagamento.valor_pago);
    row.insertCell().textContent = formatCurrency(pagamento.divida_anterior);
    row.insertCell().textContent = formatCurrency(pagamento.divida_restante);

    if (canUseOperationalCorrections) {
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
    }
  });

  setSummary('Pagamentos no periodo', pagamentos.length);
}

async function loadCurrent() {
  if (!validateFilters()) {
    return;
  }

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

document.getElementById('exportarHistorico').addEventListener('click', async () => {
  if (!validateFilters()) {
    return;
  }

  if (!currentExport.rows.length) {
    alert('Busque registros antes de exportar.');
    return;
  }

  const filters = getFilters();
  const result = await ipcRenderer.invoke('app:export-csv', {
    ...currentExport,
    defaultName: `historico-${currentType}-${filters.dataInicio}-a-${filters.dataFim}.csv`,
  });

  if (!result.canceled) {
    alert(`Relatorio salvo em:\n${result.filePath}`);
  }
});

async function initialize() {
  const status = await ipcRenderer.invoke('auth:status');
  canUseOperationalCorrections = Boolean(
    status.authenticated
      && status.user
      && (status.user.permissions.operationalCorrections || status.user.permissions.criticalActions),
  );
  setDefaultDates();
  await loadCurrent();
}

initialize().catch(console.error);

const { ipcRenderer } = require('electron');

let currentSession = null;
let currentUser = null;

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('pt-BR');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function moneyInputValue(value) {
  return Number(value || 0).toFixed(2);
}

function setMessage(text, isError = false) {
  const message = document.getElementById('message');
  message.textContent = text || '';
  message.style.color = isError ? '#b91c1c' : '#115e59';
}

function renderStatus(status) {
  const openForm = document.getElementById('openCashForm');
  const openPanel = document.getElementById('openCashPanel');

  currentSession = status.open ? status.session : null;
  openForm.hidden = status.open;
  openPanel.hidden = !status.open;

  if (!status.open) {
    setText('cashStatusTitle', 'Nenhum caixa aberto');
    return;
  }

  const totals = status.totals || {};
  setText('cashStatusTitle', 'Caixa aberto');
  setText('openedAt', formatDateTime(status.session.aberto_em));
  setText('initialTotal', formatCurrency(status.session.valor_inicial));
  setText('paidSalesTotal', formatCurrency(totals.totalVendasPagas));
  setText('paymentsTotal', formatCurrency(totals.totalPagamentos));
  setText('expensesTotal', formatCurrency(totals.totalDespesas));
  setText('expectedTotal', formatCurrency(totals.totalEsperado));
  document.getElementById('countedValue').value = moneyInputValue(totals.totalEsperado);
}

async function loadStatus() {
  const status = await ipcRenderer.invoke('caixa:status');
  renderStatus(status);
}

function differenceClass(value) {
  const number = Number(value || 0);
  if (number > 0) {
    return 'difference-positive';
  }
  if (number < 0) {
    return 'difference-negative';
  }
  return '';
}

function renderHistory(rows) {
  const body = document.getElementById('historyBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6">Nenhum fechamento encontrado.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.data_caixa || '-'}</td>
      <td>${row.usuario || '-'}</td>
      <td>${row.status || '-'}</td>
      <td>${formatCurrency(row.total_esperado)}</td>
      <td>${row.valor_informado === null ? '-' : formatCurrency(row.valor_informado)}</td>
      <td class="${differenceClass(row.diferenca)}">${formatCurrency(row.diferenca)}</td>
    </tr>
  `).join('');
}

async function loadHistory() {
  if (!currentUser || currentUser.role !== 'owner') {
    return;
  }

  const filters = {
    dataInicio: document.getElementById('historyStart').value,
    dataFim: document.getElementById('historyEnd').value,
    usuario: document.getElementById('historyUser').value.trim(),
  };
  const rows = await ipcRenderer.invoke('caixa:list', filters);
  renderHistory(rows);
}

document.getElementById('reloadButton').addEventListener('click', async () => {
  setMessage('');
  await loadStatus();
  await loadHistory();
});

document.getElementById('openCashForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  try {
    const result = await ipcRenderer.invoke('caixa:abrir', {
      valorInicial: document.getElementById('initialValue').value,
    });
    if (result.cancelled) {
      return;
    }
    setMessage('Caixa aberto com sucesso.');
    await loadStatus();
    await loadHistory();
  } catch (err) {
    setMessage(err.message || 'Nao foi possivel abrir o caixa.', true);
  }
});

document.getElementById('closeCashForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentSession) {
    return;
  }

  setMessage('');
  try {
    const result = await ipcRenderer.invoke('caixa:fechar', {
      id: currentSession.id,
      valorInformado: document.getElementById('countedValue').value,
      observacao: document.getElementById('cashNote').value.trim(),
    });
    if (result.cancelled) {
      return;
    }
    if (!result.closed) {
      setMessage('Este caixa nao estava aberto.', true);
      return;
    }

    setMessage(`Caixa fechado. Diferenca: ${formatCurrency(result.diferenca)}.`);
    document.getElementById('cashNote').value = '';
    await loadStatus();
    await loadHistory();
  } catch (err) {
    setMessage(err.message || 'Nao foi possivel fechar o caixa.', true);
  }
});

document.getElementById('historyFilter').addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadHistory();
});

async function initialize() {
  const auth = await ipcRenderer.invoke('auth:status');
  if (!auth.authenticated) {
    window.location.href = '../../index.html';
    return;
  }

  currentUser = auth.user;
  document.getElementById('historyPanel').hidden = currentUser.role !== 'owner';
  await loadStatus();
  await loadHistory();
}

initialize().catch((err) => {
  console.error('Erro ao iniciar caixa:', err);
  setMessage('Nao foi possivel iniciar o caixa.', true);
});

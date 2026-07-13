const { ipcRenderer } = require('electron');

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

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function renderCashPanel(status) {
  const openForm = document.getElementById('openCashInlineForm');
  const cashLink = document.getElementById('cashPageLink');

  if (status.open) {
    setText('cashPanelTitle', 'Caixa aberto');
    setText('cashPanelText', 'No fim do expediente, confira e feche o caixa pela tela completa.');
    openForm.hidden = true;
    cashLink.textContent = 'Fechar caixa';
    cashLink.style.display = 'inline-flex';
    return;
  }

  setText('cashPanelTitle', 'Caixa fechado');
  setText('cashPanelText', 'Abra o caixa antes de iniciar as vendas do expediente.');
  openForm.hidden = false;
  cashLink.textContent = 'Conferir caixa';
  cashLink.style.display = 'inline-flex';
}

function emptyMessage(text) {
  const item = document.createElement('div');
  item.className = 'empty';
  item.textContent = text;
  return item;
}

function statusLabel(status) {
  const labels = {
    atrasado: 'Atrasado',
    atencao: 'Atencao',
    sem_data: 'Sem data clara',
    em_dia: 'Em dia',
  };
  return labels[status] || status;
}

function renderCollection(rows) {
  const box = document.getElementById('collectionList');
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum cliente para cobrar agora.'));
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = `item ${row.statusCobranca === 'atrasado' ? 'danger' : 'warning'}`;
    const title = document.createElement('strong');
    title.textContent = `${row.nome} - ${statusLabel(row.statusCobranca)}`;
    const meta = document.createElement('span');
    meta.textContent = `${formatCurrency(row.divida)} | referencia ${formatDate(row.referencia)} | ${row.atrasoTexto}`;
    const phone = document.createElement('span');
    phone.textContent = row.telefone ? `Telefone: ${row.telefone}` : 'Sem telefone cadastrado';
    item.append(title, meta, phone);
    box.appendChild(item);
  });
}

function renderBirthdays(rows) {
  const box = document.getElementById('birthdayList');
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum aniversariante hoje.'));
    return;
  }

  rows.forEach((cliente) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<strong>${cliente.nome}</strong><span>${cliente.telefone || 'Sem telefone'}</span>`;
    box.appendChild(item);
  });
}

function renderStock(rows) {
  const box = document.getElementById('stockList');
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum produto abaixo do minimo.'));
    return;
  }

  rows.forEach((produto) => {
    const item = document.createElement('div');
    item.className = 'item danger';
    item.innerHTML = `<strong>${produto.nome}</strong><span>Qtd. ${produto.quantidade} | minimo ${produto.estoque_minimo || 0}</span>`;
    box.appendChild(item);
  });
}

async function loadToday() {
  const data = await ipcRenderer.invoke('hoje:resumo');
  setText('cashStatus', data.caixaAberto ? 'Aberto' : 'Fechado');
  setText('salesToday', String(data.quantidadeVendasHoje || 0));
  setText('lateCount', String(data.totalAtrasados || 0));
  setText('attentionCount', String(data.totalAtencao || 0));
  renderCollection(data.clientesParaCobrar || []);
  renderBirthdays(data.aniversariantes || []);
  renderStock(data.estoqueBaixo || []);

  try {
    const cashStatus = await ipcRenderer.invoke('caixa:status');
    renderCashPanel(cashStatus);
  } catch (_err) {
    document.getElementById('cashPanel').hidden = true;
  }
}

document.getElementById('refreshButton').addEventListener('click', () => {
  loadToday().catch((err) => {
    console.error(err);
    alert('Nao foi possivel atualizar a tela Hoje.');
  });
});

document.getElementById('openCashInlineForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await ipcRenderer.invoke('caixa:abrir', {
      valorInicial: document.getElementById('inlineInitialValue').value,
    });
    if (result.cancelled) {
      return;
    }
    await loadToday();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Nao foi possivel abrir o caixa.');
  }
});

loadToday().catch((err) => {
  console.error(err);
  alert('Nao foi possivel carregar a tela Hoje.');
});

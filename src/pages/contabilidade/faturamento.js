const { ipcRenderer } = require('electron');

const loginPanel = document.getElementById('loginPanel');
const ownerContent = document.getElementById('ownerContent');
const loginError = document.getElementById('loginError');
const logoutButton = document.getElementById('logoutButton');
const baloesDiv = document.getElementById('baloes');
const paymentsBox = document.getElementById('totalIntervaloPagamentos');
const despesasTable = document.getElementById('tabelaDespesas').tBodies[0];
const contasTable = document.getElementById('tabelaContas').tBodies[0];
const auditoriaTable = document.getElementById('tabelaAuditoria').tBodies[0];
const usersTable = document.getElementById('tabelaUsuarios').tBodies[0];
let ownerAuthenticated = false;
let currentRange = null;
let currentConfig = null;
let currentAuditExport = { headers: [], rows: [] };

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

function isoDate(date) {
  return date.toISOString().split('T')[0];
}

function validateDateRange(startId, endId) {
  const start = document.getElementById(startId).value;
  const end = document.getElementById(endId).value;
  if (!start || !end) {
    alert('Informe inicio e fim do periodo.');
    return false;
  }

  if (start > end) {
    alert('A data inicial nao pode ser maior que a data final.');
    return false;
  }

  return true;
}

function setDefaultRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  document.getElementById('dataInicio').value = isoDate(start);
  document.getElementById('dataFim').value = isoDate(end);
  document.getElementById('despesaData').value = isoDate(end);
  document.getElementById('accountVencimento').value = isoDate(end);
  document.getElementById('accountInicio').value = isoDate(start);
  document.getElementById('accountFim').value = isoDate(end);
  document.getElementById('auditInicio').value = isoDate(start);
  document.getElementById('auditFim').value = isoDate(end);
}

function showOwnerContent() {
  ownerAuthenticated = true;
  loginPanel.style.display = 'none';
  ownerContent.style.display = 'block';
  logoutButton.style.display = 'inline-flex';
}

function showSection(targetId) {
  document.querySelectorAll('.owner-section').forEach((section) => {
    section.style.display = section.id === targetId ? 'block' : 'none';
  });
  document.querySelectorAll('.owner-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.target === targetId);
  });

  if (targetId === 'auditSection') {
    carregarAuditoria().catch(console.error);
  }
  if (targetId === 'accountsSection') {
    carregarContas().catch(console.error);
  }
  if (targetId === 'usersSection') {
    carregarUsuarios().catch(console.error);
  }
}

function showLogin() {
  ownerAuthenticated = false;
  loginPanel.style.display = 'block';
  ownerContent.style.display = 'none';
  logoutButton.style.display = 'none';
  document.getElementById('ownerPassword').focus();
}

function createBalloon({ className, metodo, valor, porcentagem }) {
  const balloon = document.createElement('div');
  balloon.className = `balao ${className}`;

  const method = document.createElement('div');
  method.className = 'metodo';
  method.textContent = metodo;

  const amount = document.createElement('div');
  amount.className = 'valor';
  amount.textContent = formatCurrency(valor);

  const percent = document.createElement('div');
  percent.className = 'porcentagem';
  percent.textContent = porcentagem;

  balloon.append(method, amount, percent);
  return balloon;
}

function renderDespesas(despesas) {
  despesasTable.innerHTML = '';
  despesas.forEach((despesa) => {
    const row = despesasTable.insertRow();
    row.insertCell().textContent = formatDate(despesa.data_despesa);
    row.insertCell().textContent = despesa.descricao;
    row.insertCell().textContent = despesa.categoria || '-';
    row.insertCell().textContent = formatCurrency(despesa.valor);

    const deleteCell = row.insertCell();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Cancelar';
    button.addEventListener('click', async () => {
      await ipcRenderer.invoke('despesas:delete', despesa.id);
      if (currentRange) {
        await carregarResumo(currentRange.dataInicio, currentRange.dataFim);
      }
    });
    deleteCell.appendChild(button);
  });
}

function renderSummary(summary) {
  baloesDiv.innerHTML = '';

  [
    ['entrada', 'Entradas reais', summary.totalEntradas, 'Vendas pagas + pagamentos'],
    ['saida', 'Saidas', summary.totalDespesas, 'Despesas do periodo'],
    ['saldo', 'Saldo', summary.saldo, 'Entradas menos saidas'],
    ['total', 'Vendas registradas', summary.totalVendas, 'Inclui vendas fiadas'],
    ['fiado', 'Fiado no periodo', summary.totalFiado, 'Vendas a prazo geradas'],
    ['total', 'Ticket medio', summary.ticketMedio, 'Media das vendas exibidas'],
  ].forEach(([className, metodo, valor, porcentagem]) => {
    baloesDiv.appendChild(createBalloon({ className, metodo, valor, porcentagem }));
  });

  summary.metodos.forEach((item) => {
    const percent = summary.totalVendas > 0 ? ((item.total / summary.totalVendas) * 100).toFixed(2) : '0.00';
    baloesDiv.appendChild(createBalloon({
      className: item.metodoPagamento.toLowerCase(),
      metodo: item.metodoPagamento,
      valor: item.total,
      porcentagem: `${percent}% do total`,
    }));
  });

  paymentsBox.textContent = '';
  paymentsBox.appendChild(createBalloon({
    className: 'total',
    metodo: 'Pagamentos no intervalo',
    valor: summary.totalPagamentos,
    porcentagem: 'Total recebido em dividas',
  }));
  paymentsBox.style.display = 'block';
  renderDespesas(summary.despesas || []);
}

function statusLabel(status) {
  if (status === 'pago') {
    return 'Pago/recebido';
  }
  if (status === 'cancelado') {
    return 'Cancelado';
  }
  return 'Pendente';
}

function typeLabel(tipo) {
  return tipo === 'receber' ? 'A receber' : 'A pagar';
}

function isOverdue(row) {
  if (row.status !== 'pendente' || !row.vencimento) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${row.vencimento}T00:00:00`);
  return dueDate < today;
}

function renderContas(rows) {
  contasTable.innerHTML = '';
  const pendingPay = rows
    .filter((row) => row.status === 'pendente' && row.tipo === 'pagar')
    .reduce((total, row) => total + Number(row.valor || 0), 0);
  const pendingReceive = rows
    .filter((row) => row.status === 'pendente' && row.tipo === 'receber')
    .reduce((total, row) => total + Number(row.valor || 0), 0);
  const overdue = rows.filter(isOverdue).length;

  document.getElementById('accountsPendingPay').textContent = `A pagar: ${formatCurrency(pendingPay)}`;
  document.getElementById('accountsPendingReceive').textContent = `A receber: ${formatCurrency(pendingReceive)}`;
  document.getElementById('accountsOverdue').textContent = `Vencidas: ${overdue}`;

  if (!rows.length) {
    const row = contasTable.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.textContent = 'Nenhuma conta encontrada.';
    return;
  }

  rows.forEach((conta) => {
    const row = contasTable.insertRow();
    row.insertCell().textContent = formatDate(conta.vencimento);
    row.insertCell().textContent = typeLabel(conta.tipo);
    row.insertCell().textContent = conta.descricao;
    row.insertCell().textContent = conta.pessoa || '-';
    row.insertCell().textContent = formatCurrency(conta.valor);

    const statusCell = row.insertCell();
    statusCell.textContent = statusLabel(conta.status);
    statusCell.className = `status-${conta.status}`;

    const actions = row.insertCell();
    if (conta.status === 'pendente') {
      const payButton = document.createElement('button');
      payButton.type = 'button';
      payButton.textContent = conta.tipo === 'receber' ? 'Receber' : 'Pagar';
      payButton.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('contas:pay', conta.id);
        if (result.paid) {
          await carregarContas();
          await carregarAuditoria();
        }
      });

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.textContent = 'Cancelar';
      cancelButton.className = 'danger-inline';
      cancelButton.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('contas:cancel', conta.id);
        if (result.cancelled) {
          await carregarContas();
          await carregarAuditoria();
        }
      });

      actions.append(payButton, cancelButton);
    } else {
      actions.textContent = conta.pago_em ? `Em ${formatDate(conta.pago_em)}` : '-';
    }
  });
}

function parseAuditJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function actionLabel(action) {
  const labels = {
    CRIAR_CLIENTE: 'Cadastrou cliente',
    ALTERAR_CLIENTE: 'Alterou cliente',
    INATIVAR_CLIENTE: 'Inativou cliente',
    CRIAR_VENDA: 'Registrou venda',
    CANCELAR_VENDA: 'Cancelou venda',
    CRIAR_PAGAMENTO: 'Registrou pagamento',
    CANCELAR_PAGAMENTO: 'Cancelou pagamento',
    CRIAR_DESPESA: 'Registrou saida',
    CANCELAR_DESPESA: 'Cancelou saida',
    CRIAR_CONTA_PAGAR: 'Registrou conta a pagar',
    CRIAR_CONTA_RECEBER: 'Registrou conta a receber',
    PAGAR_CONTA: 'Pagou conta',
    RECEBER_CONTA: 'Recebeu conta',
    CANCELAR_CONTA: 'Cancelou conta',
    CRIAR_PRODUTO: 'Cadastrou produto',
    ALTERAR_PRODUTO: 'Alterou produto',
    DESATIVAR_PRODUTO: 'Desativou produto',
    MOVIMENTAR_ESTOQUE: 'Movimentou estoque',
    CRIAR_USUARIO: 'Criou usuario',
    ALTERAR_USUARIO: 'Alterou usuario',
    DESATIVAR_USUARIO: 'Desativou usuario',
    ALTERAR_CONFIGURACOES: 'Alterou configuracoes',
    ALTERAR_LOGO: 'Alterou logo',
    GERAR_BACKUP: 'Gerou backup',
    GERAR_BACKUP_AUTOMATICO: 'Gerou backup automatico',
  };
  return labels[action] || action;
}

function describeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return ` Itens: ${items.map((item) => `${item.nome} (${item.quantidade})`).join(', ')}.`;
}

function auditDetails(item) {
  const before = parseAuditJson(item.dados_antes);
  const after = parseAuditJson(item.dados_depois);
  const data = after || before || {};

  if (item.acao === 'CRIAR_VENDA') {
    return `Cliente ${data.cliente || '-'}, ${formatCurrency(data.preco)}, ${data.metodoPagamento || '-'} ${describeItems(data.itens)}`;
  }

  if (item.acao === 'CANCELAR_VENDA') {
    const venda = data.venda || {};
    return `Venda ${item.entidade_id || '-'} de ${venda.cliente || '-'}, ${formatCurrency(venda.preco)}, ${venda.metodoPagamento || '-'} cancelada.${describeItems(data.itens)}`;
  }

  if (item.acao === 'CRIAR_PAGAMENTO') {
    return `Cliente ${data.nomePagador || '-'}, pago ${formatCurrency(data.valorPago)}, divida antes ${formatCurrency(data.dividaAtual)}, restante ${formatCurrency(data.dividaRestante)}.`;
  }

  if (item.acao === 'CANCELAR_PAGAMENTO') {
    return `Pagamento ${item.entidade_id || '-'} de ${data.nome_pagador || '-'}, valor ${formatCurrency(data.valor_pago)} cancelado e devolvido para a divida.`;
  }

  if (item.acao === 'CRIAR_DESPESA') {
    return `${data.descricao || '-'}, ${formatCurrency(data.valor)}, categoria ${data.categoria || '-'}.`;
  }

  if (item.acao === 'CANCELAR_DESPESA') {
    return `${data.descricao || '-'}, ${formatCurrency(data.valor)}, categoria ${data.categoria || '-'} cancelada.`;
  }

  if (item.entidade === 'FinanceiroContas') {
    const account = before || after || {};
    return `${account.descricao || '-'}, ${formatCurrency(account.valor)}, vencimento ${formatDate(account.vencimento)}, status ${account.status || '-'}.`;
  }

  if (item.entidade === 'Produtos') {
    return `Produto ${data.nome || '-'}, venda ${formatCurrency(data.preco_venda)}, estoque controlado ${data.controlar_estoque ? 'sim' : 'nao'}.`;
  }

  if (item.entidade === 'StockMovimentos') {
    return `${data.produtoNome || '-'}, ${data.tipo || '-'}, antes ${data.quantidadeAnterior ?? '-'}, movimento ${data.quantidadeMovimentada ?? '-'}, depois ${data.quantidadeNova ?? '-'}.`;
  }

  if (item.entidade === 'Usuarios') {
    return `Usuario ${data.username || '-'}, nome ${data.name || '-'}, perfil ${roleLabel(data.role)}.`;
  }

  if (item.entidade === 'Configuracoes') {
    if (item.acao === 'ALTERAR_LOGO') {
      return `Logo anterior ${before && before.logo ? before.logo : '-'}, nova logo ${after && after.logo ? after.logo : '-'}.`;
    }
    return `Empresa ${data.company && data.company.name ? data.company.name : '-'}, modo ${data.businessProfile && data.businessProfile.level ? data.businessProfile.level : '-'}.`;
  }

  if (item.entidade === 'Backup') {
    return `Backup salvo em ${data.backupPath || '-'}.`;
  }

  if (item.acao === 'CRIAR_CLIENTE') {
    return `Cliente ${data.nome || '-'} cadastrado.`;
  }

  if (item.acao === 'ALTERAR_CLIENTE') {
    return `Cliente ${data.nome || '-'} alterado.`;
  }

  if (item.acao === 'INATIVAR_CLIENTE') {
    return `Cliente ${data.nome || '-'} inativado.`;
  }

  return JSON.stringify(data).slice(0, 180);
}

function renderAuditoria(rows) {
  auditoriaTable.innerHTML = '';
  currentAuditExport = {
    headers: ['Data', 'Usuario', 'Acao', 'Area', 'ID', 'Motivo', 'Detalhes'],
    rows: rows.map((item) => ({
      Data: new Date(item.data_evento).toLocaleString('pt-BR'),
      Usuario: item.usuario || '',
      Acao: actionLabel(item.acao),
      Area: item.entidade,
      ID: item.entidade_id || '',
      Motivo: item.motivo || '',
      Detalhes: auditDetails(item),
    })),
  };

  rows.forEach((item) => {
    const row = auditoriaTable.insertRow();
    row.insertCell().textContent = new Date(item.data_evento).toLocaleString('pt-BR');
    row.insertCell().textContent = item.usuario || '-';
    row.insertCell().textContent = actionLabel(item.acao);
    row.insertCell().textContent = item.entidade;
    row.insertCell().textContent = item.entidade_id || '-';
    row.insertCell().textContent = item.motivo || '-';
    row.insertCell().textContent = auditDetails(item);
  });
}

function roleLabel(role) {
  return role === 'owner' ? 'Administrador' : 'Funcionario';
}

const permissionFields = {
  sales: 'permSales',
  clients: 'permClients',
  payments: 'permPayments',
  products: 'permProducts',
  history: 'permHistory',
  whatsapp: 'permWhatsapp',
  cash: 'permCash',
  finance: 'permFinance',
  administration: 'permAdministration',
  operationalCorrections: 'permOperationalCorrections',
  criticalActions: 'permCriticalActions',
};

const permissionDefaults = {
  owner: {
    sales: true,
    clients: true,
    payments: true,
    products: true,
    history: true,
    whatsapp: true,
    cash: true,
    finance: true,
    administration: true,
    operationalCorrections: true,
    criticalActions: true,
  },
  staff: {
    sales: true,
    clients: true,
    payments: true,
    products: true,
    history: true,
    whatsapp: true,
    cash: true,
    finance: false,
    administration: false,
    operationalCorrections: true,
    criticalActions: false,
  },
};

function setPermissionChecks(permissions) {
  Object.entries(permissionFields).forEach(([permission, id]) => {
    document.getElementById(id).checked = Boolean(permissions[permission]);
  });
}

function collectPermissionChecks() {
  return Object.fromEntries(
    Object.entries(permissionFields).map(([permission, id]) => [
      permission,
      document.getElementById(id).checked,
    ]),
  );
}

function clearUserForm() {
  document.getElementById('userOriginalUsername').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userUsername').disabled = false;
  document.getElementById('userRole').value = 'staff';
  document.getElementById('userPassword').value = '';
  setPermissionChecks(permissionDefaults.staff);
}

function fillUserForm(user) {
  document.getElementById('userOriginalUsername').value = user.username;
  document.getElementById('userName').value = user.name || '';
  document.getElementById('userUsername').value = user.username || '';
  document.getElementById('userUsername').disabled = true;
  document.getElementById('userRole').value = user.role || 'staff';
  document.getElementById('userPassword').value = '';
  setPermissionChecks({
    ...permissionDefaults[user.role === 'owner' ? 'owner' : 'staff'],
    ...(user.permissions || {}),
  });
}

function renderUsuarios(users) {
  usersTable.innerHTML = '';
  const hasDefaultUsers = users.some((user) => ['admin', 'funcionario'].includes(user.username));
  document.getElementById('defaultPasswordWarning').textContent = hasDefaultUsers
    ? 'Atencao: ainda existem usuarios padrao. Edite cada um, troque a senha/PIN e use nomes reais para auditoria.'
    : '';

  users.forEach((user) => {
    const row = usersTable.insertRow();
    row.insertCell().textContent = user.name;
    row.insertCell().textContent = user.username;
    row.insertCell().textContent = roleLabel(user.role);

    const actions = row.insertCell();
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => fillUserForm(user));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Desativar';
    deleteButton.className = 'danger-inline';
    deleteButton.addEventListener('click', async () => {
      const result = await ipcRenderer.invoke('auth:users-delete', user.username);
      if (result.deleted) {
        await carregarUsuarios();
        await fillAdminLoginOptions();
      }
    });

    actions.append(editButton, deleteButton);
  });
}

async function fillAdminLoginOptions() {
  const users = await ipcRenderer.invoke('auth:users');
  const owners = users.filter((user) => user.role === 'owner');
  const select = document.getElementById('ownerUser');
  select.innerHTML = '';

  owners.forEach((user) => {
    const option = document.createElement('option');
    option.value = user.username;
    option.textContent = user.name || user.username;
    select.appendChild(option);
  });
}

async function carregarUsuarios() {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const users = await ipcRenderer.invoke('auth:users');
  renderUsuarios(users);
}

async function carregarAuditoria() {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }
  if (!validateDateRange('auditInicio', 'auditFim')) {
    return;
  }

  const rows = await ipcRenderer.invoke('auditoria:list', {
    dataInicio: document.getElementById('auditInicio').value,
    dataFim: document.getElementById('auditFim').value,
    usuario: document.getElementById('auditUsuario').value.trim(),
    acao: document.getElementById('auditAcao').value.trim(),
    entidade: document.getElementById('auditEntidade').value,
    limit: 300,
  });
  renderAuditoria(rows);
}

async function carregarContas() {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }
  if (!validateDateRange('accountInicio', 'accountFim')) {
    return;
  }

  const rows = await ipcRenderer.invoke('contas:list', {
    tipo: document.getElementById('accountFilterTipo').value,
    status: document.getElementById('accountFilterStatus').value,
    dataInicio: document.getElementById('accountInicio').value,
    dataFim: document.getElementById('accountFim').value,
  });
  renderContas(rows);
}

function fillSettings(config) {
  currentConfig = config;
  document.getElementById('configCompanyName').value = config.company.name || '';
  document.getElementById('configAppTitle').value = config.company.appTitle || '';
  document.getElementById('configWhatsapp').value = config.company.whatsappUrl || '';
  document.getElementById('configLogo').value = config.company.logo || '';
  document.getElementById('configBusinessLevel').value = config.businessProfile.level || 'simple';
  document.getElementById('configSessionTimeout').value = Number(config.auth.sessionTimeoutMinutes || 30);
  document.getElementById('configAutoBackup').checked = config.backup ? config.backup.automaticEnabled !== false : true;
  document.getElementById('configBackupKeepLast').value = config.backup ? Number(config.backup.keepLast || 30) : 30;
  document.getElementById('moduleManualSales').checked = Boolean(config.modules.manualSales);
  document.getElementById('moduleClients').checked = Boolean(config.modules.clients);
  document.getElementById('modulePayments').checked = Boolean(config.modules.payments);
  document.getElementById('moduleCash').checked = Boolean(config.modules.cash);
  document.getElementById('moduleFinance').checked = Boolean(config.modules.finance);
  document.getElementById('moduleBackup').checked = Boolean(config.modules.backup);
  document.getElementById('moduleProducts').checked = Boolean(config.modules.simpleProducts);
  document.getElementById('moduleStock').checked = Boolean(config.modules.stockControl);
  document.getElementById('moduleBarcode').checked = Boolean(config.modules.barcode);
}

async function loadSettings() {
  const config = await ipcRenderer.invoke('app:config');
  fillSettings(config);
}

function collectSettings() {
  const level = document.getElementById('configBusinessLevel').value;
  return {
    ...currentConfig,
    company: {
      ...currentConfig.company,
      name: document.getElementById('configCompanyName').value.trim(),
      appTitle: document.getElementById('configAppTitle').value.trim(),
      whatsappUrl: document.getElementById('configWhatsapp').value.trim(),
      logo: document.getElementById('configLogo').value.trim() || currentConfig.company.logo,
    },
    auth: {
      ...currentConfig.auth,
      sessionTimeoutMinutes: Number(document.getElementById('configSessionTimeout').value || 30),
    },
    backup: {
      ...(currentConfig.backup || {}),
      automaticEnabled: document.getElementById('configAutoBackup').checked,
      automaticFolder: (currentConfig.backup && currentConfig.backup.automaticFolder) || 'backups/automaticos',
      keepLast: Number(document.getElementById('configBackupKeepLast').value || 30),
    },
    modules: {
      ...currentConfig.modules,
      manualSales: document.getElementById('moduleManualSales').checked,
      clients: document.getElementById('moduleClients').checked,
      payments: document.getElementById('modulePayments').checked,
      cash: document.getElementById('moduleCash').checked,
      finance: document.getElementById('moduleFinance').checked,
      backup: document.getElementById('moduleBackup').checked,
      simpleProducts: document.getElementById('moduleProducts').checked,
      stockControl: document.getElementById('moduleStock').checked,
      barcode: document.getElementById('moduleBarcode').checked,
    },
    businessProfile: {
      ...currentConfig.businessProfile,
      level,
      allowProductCatalog: level !== 'simple' || document.getElementById('moduleProducts').checked,
      requireStockForSale: level === 'stock',
    },
  };
}

async function carregarResumo(dataInicio, dataFim) {
  currentRange = { dataInicio, dataFim };
  const summary = await ipcRenderer.invoke('financeiro:resumo', { dataInicio, dataFim });
  renderSummary(summary);
}

async function buscarDados() {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const dataInicio = document.getElementById('dataInicio').value;
  const dataFim = document.getElementById('dataFim').value;

  if (!validateDateRange('dataInicio', 'dataFim')) {
    return;
  }

  await carregarResumo(dataInicio, dataFim);
}

async function loginOwner() {
  const username = document.getElementById('ownerUser').value.trim();
  const password = document.getElementById('ownerPassword').value;
  const result = await ipcRenderer.invoke('auth:login', { username, password });

  if (!result.authenticated || result.user.role !== 'owner') {
    if (result.authenticated) {
      await ipcRenderer.invoke('auth:logout');
    }
    loginError.textContent = 'Usuario sem acesso administrativo ou senha incorreta.';
    return;
  }

  loginError.textContent = '';
  document.getElementById('ownerPassword').value = '';
  showOwnerContent();
  await loadSettings();
  await buscarDados();
}

async function initializeOwnerArea() {
  setDefaultRange();
  await fillAdminLoginOptions();
  const status = await ipcRenderer.invoke('auth:status');
  if (!status.authenticated || status.user.role !== 'owner') {
    showLogin();
    return;
  }

  showOwnerContent();
  await loadSettings();
  await buscarDados();
}

document.querySelectorAll('.owner-tab').forEach((button) => {
  button.addEventListener('click', () => {
    showSection(button.dataset.target);
  });
});

document.getElementById('loginButton').addEventListener('click', () => {
  loginOwner().catch((err) => {
    console.error(err);
    loginError.textContent = 'Nao foi possivel validar usuario e senha.';
  });
});

document.getElementById('ownerPassword').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loginOwner().catch((err) => {
      console.error(err);
      loginError.textContent = 'Nao foi possivel validar usuario e senha.';
    });
  }
});

logoutButton.addEventListener('click', async () => {
  await ipcRenderer.invoke('auth:logout');
  showLogin();
});

document.querySelector('.buscar').addEventListener('click', () => {
  buscarDados().catch((err) => {
    console.error(err);
    alert('Nao foi possivel carregar os dados financeiros.');
  });
});

document.getElementById('despesaForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const despesa = {
    descricao: document.getElementById('despesaDescricao').value.trim(),
    valor: Number(document.getElementById('despesaValor').value),
    data_despesa: document.getElementById('despesaData').value,
    categoria: document.getElementById('despesaCategoria').value.trim(),
  };

  if (!despesa.descricao || !Number.isFinite(despesa.valor) || despesa.valor <= 0 || !despesa.data_despesa) {
    alert('Preencha descricao, valor e data da despesa.');
    return;
  }

  const result = await ipcRenderer.invoke('despesas:create', despesa);
  if (result && result.cancelled) {
    return;
  }
  event.target.reset();
  document.getElementById('despesaData').value = isoDate(new Date());

  if (currentRange) {
    await carregarResumo(currentRange.dataInicio, currentRange.dataFim);
  }
});

document.getElementById('accountForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const conta = {
    tipo: document.getElementById('accountTipo').value,
    descricao: document.getElementById('accountDescricao').value.trim(),
    pessoa: document.getElementById('accountPessoa').value.trim(),
    categoria: document.getElementById('accountCategoria').value.trim(),
    valor: Number(document.getElementById('accountValor').value),
    vencimento: document.getElementById('accountVencimento').value,
    observacao: document.getElementById('accountObservacao').value.trim(),
  };

  if (!conta.descricao || !Number.isFinite(conta.valor) || conta.valor <= 0 || !conta.vencimento) {
    alert('Preencha descricao, valor e vencimento da conta.');
    return;
  }

  const result = await ipcRenderer.invoke('contas:create', conta);
  if (result && result.cancelled) {
    return;
  }

  event.target.reset();
  document.getElementById('accountVencimento').value = isoDate(new Date());
  await carregarContas();
  await carregarAuditoria();
});

document.getElementById('buscarContas').addEventListener('click', () => {
  carregarContas().catch((err) => {
    console.error(err);
    alert('Nao foi possivel carregar as contas.');
  });
});

document.getElementById('buscarAuditoria').addEventListener('click', () => {
  carregarAuditoria().catch((err) => {
    console.error(err);
    alert('Nao foi possivel carregar auditoria.');
  });
});

document.getElementById('userForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const userData = {
    username: document.getElementById('userUsername').value.trim(),
    name: document.getElementById('userName').value.trim(),
    role: document.getElementById('userRole').value,
    password: document.getElementById('userPassword').value,
    permissions: collectPermissionChecks(),
  };

  if (!userData.username || !userData.name) {
    alert('Informe nome e usuario.');
    return;
  }

  await ipcRenderer.invoke('auth:users-save', userData);
  clearUserForm();
  await carregarUsuarios();
  await fillAdminLoginOptions();
});

document.getElementById('clearUserForm').addEventListener('click', clearUserForm);

document.getElementById('userRole').addEventListener('change', (event) => {
  const role = event.target.value === 'owner' ? 'owner' : 'staff';
  setPermissionChecks(permissionDefaults[role]);
});

document.getElementById('exportarAuditoria').addEventListener('click', async () => {
  if (!currentAuditExport.rows.length) {
    alert('Busque registros de auditoria antes de exportar.');
    return;
  }

  const result = await ipcRenderer.invoke('app:export-csv', {
    ...currentAuditExport,
    defaultName: 'auditoria.csv',
  });

  if (!result.canceled) {
    alert(`Auditoria salva em:\n${result.filePath}`);
  }
});

document.getElementById('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const saved = await ipcRenderer.invoke('app:save-config', collectSettings());
  fillSettings(saved);
  document.getElementById('settingsStatus').textContent = 'Configuracoes salvas. Volte para a tela inicial para ver os modulos atualizados.';
});

document.getElementById('selectLogoButton').addEventListener('click', async () => {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const result = await ipcRenderer.invoke('app:select-logo');
  if (result.canceled) {
    return;
  }

  fillSettings(result.config);
  document.getElementById('settingsStatus').textContent = 'Logo atualizada. Volte para a tela inicial para conferir.';
});

document.getElementById('adminBackupButton').addEventListener('click', async () => {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const result = await ipcRenderer.invoke('backup-database');
  if (result.canceled) {
    return;
  }

  alert(`Backup salvo em:\n${result.backupPath}`);
});

document.getElementById('databaseHealthButton').addEventListener('click', async () => {
  if (!ownerAuthenticated) {
    showLogin();
    return;
  }

  const health = await ipcRenderer.invoke('app:database-health');
  const counts = health.counts || {};
  alert(
    `Integridade: ${health.integrity}\n`
    + `Banco: ${health.databasePath}\n\n`
    + `Clientes: ${counts.clientes || 0}\n`
    + `Vendas: ${counts.vendas || 0}\n`
    + `Pagamentos: ${counts.pagamentos || 0}\n`
    + `Produtos: ${counts.produtos || 0}\n`
    + `Auditoria: ${counts.auditoria || 0}`,
  );
});

initializeOwnerArea().catch((err) => {
  console.error('Nao foi possivel iniciar administracao:', err);
  showLogin();
});

clearUserForm();

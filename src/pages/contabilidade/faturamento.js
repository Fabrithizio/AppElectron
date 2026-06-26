const { ipcRenderer } = require('electron');

const loginPanel = document.getElementById('loginPanel');
const ownerContent = document.getElementById('ownerContent');
const loginError = document.getElementById('loginError');
const logoutButton = document.getElementById('logoutButton');
const baloesDiv = document.getElementById('baloes');
const paymentsBox = document.getElementById('totalIntervaloPagamentos');
const despesasTable = document.getElementById('tabelaDespesas').tBodies[0];
const auditoriaTable = document.getElementById('tabelaAuditoria').tBodies[0];
const usersTable = document.getElementById('tabelaUsuarios').tBodies[0];
let ownerAuthenticated = false;
let currentRange = null;
let currentConfig = null;

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

function setDefaultRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  document.getElementById('dataInicio').value = isoDate(start);
  document.getElementById('dataFim').value = isoDate(end);
  document.getElementById('despesaData').value = isoDate(end);
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

function compactJson(value) {
  if (!value) {
    return '-';
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed) {
      return '-';
    }

    if (parsed.preco || parsed.valorPago || parsed.valor || parsed.dividaAtual) {
      return JSON.stringify(parsed).slice(0, 180);
    }

    return JSON.stringify(parsed).slice(0, 180);
  } catch (_err) {
    return String(value).slice(0, 180);
  }
}

function renderAuditoria(rows) {
  auditoriaTable.innerHTML = '';

  rows.forEach((item) => {
    const row = auditoriaTable.insertRow();
    row.insertCell().textContent = new Date(item.data_evento).toLocaleString('pt-BR');
    row.insertCell().textContent = item.usuario || '-';
    row.insertCell().textContent = item.acao;
    row.insertCell().textContent = item.entidade;
    row.insertCell().textContent = item.entidade_id || '-';
    row.insertCell().textContent = item.motivo || '-';
    row.insertCell().textContent = compactJson(item.dados_depois || item.dados_antes);
  });
}

function roleLabel(role) {
  return role === 'owner' ? 'Administrador' : 'Funcionario';
}

function clearUserForm() {
  document.getElementById('userOriginalUsername').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userUsername').disabled = false;
  document.getElementById('userRole').value = 'staff';
  document.getElementById('userPassword').value = '';
}

function fillUserForm(user) {
  document.getElementById('userOriginalUsername').value = user.username;
  document.getElementById('userName').value = user.name || '';
  document.getElementById('userUsername').value = user.username || '';
  document.getElementById('userUsername').disabled = true;
  document.getElementById('userRole').value = user.role || 'staff';
  document.getElementById('userPassword').value = '';
}

function renderUsuarios(users) {
  usersTable.innerHTML = '';
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

function fillSettings(config) {
  currentConfig = config;
  document.getElementById('configCompanyName').value = config.company.name || '';
  document.getElementById('configAppTitle').value = config.company.appTitle || '';
  document.getElementById('configWhatsapp').value = config.company.whatsappUrl || '';
  document.getElementById('configBusinessLevel').value = config.businessProfile.level || 'simple';
  document.getElementById('moduleManualSales').checked = Boolean(config.modules.manualSales);
  document.getElementById('moduleClients').checked = Boolean(config.modules.clients);
  document.getElementById('modulePayments').checked = Boolean(config.modules.payments);
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
    },
    modules: {
      ...currentConfig.modules,
      manualSales: document.getElementById('moduleManualSales').checked,
      clients: document.getElementById('moduleClients').checked,
      payments: document.getElementById('modulePayments').checked,
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

  if (!dataInicio || !dataFim) {
    alert('Informe as datas de inicio e fim.');
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

initializeOwnerArea().catch((err) => {
  console.error('Nao foi possivel iniciar administracao:', err);
  showLogin();
});

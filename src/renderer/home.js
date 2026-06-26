const { ipcRenderer, shell } = require('electron');

const loginGate = document.getElementById('loginGate');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
let activeUsers = [];

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function roleLabel(role) {
  return role === 'owner' ? 'Administrador' : 'Funcionario';
}

function showLoginGate() {
  loginGate.classList.add('is-visible');
  document.getElementById('loginPassword').focus();
}

function hideLoginGate() {
  loginGate.classList.remove('is-visible');
}

function updateSessionBadge(status) {
  const badge = document.getElementById('sessionBadge');
  if (!status.authenticated || !status.user) {
    badge.textContent = 'Sem login';
    return;
  }

  badge.textContent = `${roleLabel(status.user.role)}: ${status.user.name || status.user.username}`;
}

async function loadLoginUsers() {
  activeUsers = await ipcRenderer.invoke('auth:users');
  const select = document.getElementById('loginUser');
  select.innerHTML = '';

  activeUsers.forEach((user) => {
    const option = document.createElement('option');
    option.value = user.username;
    option.textContent = `${user.name || user.username} (${roleLabel(user.role)})`;
    select.appendChild(option);
  });

  const staff = activeUsers.find((user) => user.role !== 'owner');
  const first = staff || activeUsers[0];
  if (first) {
    select.value = first.username;
  }
}

async function requireSession() {
  const status = await ipcRenderer.invoke('auth:status');
  updateSessionBadge(status);
  if (!status.authenticated) {
    showLoginGate();
    return false;
  }

  hideLoginGate();
  return true;
}

function applyModules(modules) {
  document.querySelectorAll('[data-module]').forEach((element) => {
    const moduleName = element.dataset.module;
    element.classList.toggle('is-disabled', modules[moduleName] === false);
  });

  document.getElementById('ownerAreaButton').style.display = modules.finance ? 'inline-flex' : 'none';
  document.getElementById('paymentsButton').style.display = modules.payments ? 'inline-flex' : 'none';
  document.getElementById('backupButton').style.display = modules.backup ? 'inline-flex' : 'none';
}

function applyBusinessProfile(profile) {
  const descriptions = {
    simple: {
      title: 'Venda simples',
      description: 'Venda manual livre para lojas com pecas variadas ou sem estoque repetido.',
    },
    catalog: {
      title: 'Catalogo simples',
      description: 'Permite vender manualmente e tambem usar produtos cadastrados quando fizer sentido.',
    },
    stock: {
      title: 'Estoque controlado',
      description: 'Usa produtos cadastrados e pode controlar quantidade disponivel.',
    },
  };
  const selected = descriptions[profile.level] || descriptions.simple;
  setText('businessLevel', selected.title);
  setText('businessDescription', selected.description);
}

async function loadConfig() {
  const config = await ipcRenderer.invoke('app:config');
  document.documentElement.style.setProperty('--primary-color', config.theme.primaryColor);
  document.title = config.company.appTitle;
  setText('companyName', config.company.name);
  setText('appTitle', config.company.appTitle);
  document.getElementById('companyLogo').src = config.company.logo;

  applyModules(config.modules);
  applyBusinessProfile(config.businessProfile);

  document.getElementById('whatsappButton').addEventListener('click', () => {
    shell.openExternal(config.company.whatsappUrl);
  });
}

async function loadDashboard() {
  const summary = await ipcRenderer.invoke('dashboard:resumo');
  setText('salesCountValue', String(summary.quantidadeVendasHoje));
  setText('salesCount', `${summary.quantidadeVendasHoje} vendas`);
  setText('debtClientsValue', String(summary.clientesComDivida));
  setText('debtClients', `${summary.clientesComDivida} clientes`);
  setText('lateClients', String(summary.clientesAtrasados));
}

async function openOwnerArea() {
  window.location.href = 'pages/contabilidade/faturamento.html';
}

document.getElementById('paymentsButton').addEventListener('click', async () => {
  await ipcRenderer.invoke('pagamentos:verificar-atrasos');
  await loadDashboard();
});

document.getElementById('ownerAreaButton').addEventListener('click', () => {
  openOwnerArea().catch((err) => {
    console.error('Nao foi possivel abrir administracao:', err);
    alert('Nao foi possivel abrir a administracao.');
  });
});

document.getElementById('backupButton').addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('backup-database');
  if (result.canceled) {
    return;
  }

  alert(`Backup salvo em:\n${result.backupPath}`);
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPassword').value;
  const result = await ipcRenderer.invoke('auth:login', { username, password });

  if (!result.authenticated) {
    loginMessage.textContent = 'Usuario ou senha incorretos.';
    return;
  }

  loginMessage.textContent = '';
  updateSessionBadge(result);
  hideLoginGate();
  await loadDashboard();
});

document.getElementById('ownerLoginShortcut').addEventListener('click', () => {
  const owner = activeUsers.find((user) => user.role === 'owner');
  if (owner) {
    document.getElementById('loginUser').value = owner.username;
  }
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginPassword').focus();
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  await ipcRenderer.invoke('auth:logout');
  updateSessionBadge({ authenticated: false });
  showLoginGate();
});

async function initializeHome() {
  await loadConfig();
  await loadLoginUsers();
  const hasSession = await requireSession();
  if (hasSession) {
    await loadDashboard();
  }
}

initializeHome().catch((err) => {
  console.error('Nao foi possivel iniciar tela inicial:', err);
  showLoginGate();
});

const { BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const auth = require('./auth');
const { backupDatabase } = require('./backup');
const { loadAppConfig, saveAppConfig } = require('./config');
const { openWhatsappWindow } = require('./window');
const {
  countClientesWithDebt,
  countVendasByDate,
  countVendasByInterval,
  cancelFinancialAccount,
  closeCashSession,
  createFinancialAccount,
  deactivateProduto,
  deleteDespesa,
  deleteCliente,
  deletePagamentoAndRestoreDebt,
  deleteVendaAndAdjustDebt,
  getClienteByName,
  getCashTotals,
  getDatabaseHealth,
  getOpenCashSession,
  getProdutoByCode,
  insertCliente,
  insertVenda,
  listAuditLog,
  listCashSessions,
  listFinancialAccounts,
  listClientes,
  listClientesWithPaymentStatus,
  listBirthdayClientes,
  listManualCollectionSent,
  getManualCollectionSent,
  markManualCollectionSent,
  unmarkManualCollectionSent,
  listOperationalTasks,
  getOperationalTask,
  createOperationalTask,
  completeOperationalTask,
  reopenOperationalTask,
  listDespesasByInterval,
  listLowStockProdutos,
  listProdutoStockMovements,
  listPagamentos,
  listPagamentosByCliente,
  listPagamentosByDate,
  listPagamentosFiltered,
  listPagamentosByInterval,
  listProdutos,
  listVendas,
  listVendasByCliente,
  listVendasByDate,
  listVendasFiltered,
  markFinancialAccountPaid,
  moveProdutoStock,
  openCashSession,
  registerPayment,
  searchClientesByPrefix,
  searchProdutos,
  insertDespesa,
  sumDespesas,
  sumReceivedSales,
  sumVendas,
  sumVendasByPaymentMethod,
  updateCliente,
  upsertProduto,
  writeAuditLog,
  listWhatsAppDashboard,
  createWhatsAppEvent,
  beginWhatsAppAttempt,
  finishWhatsAppAttempt,
  listWhatsAppHistory,
} = require('./database');
const whatsapp = require('./whatsapp');
const { runVerification } = require('./whatsapp-automation');
const { statusForDueDate, isValidPhone, normalizePhone } = require('./whatsapp-rules');

const paymentMethods = ['Pix', 'Especie', 'Fiado', 'Debito', 'Credito'];
const overdueThresholdDays = 90;
const projectRoot = path.resolve(__dirname, '..', '..');

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function requireOwnerAccess() {
  auth.requireRole('owner');
}

function requireLogin() {
  return auth.requireAuthenticated();
}

function requirePermission(permission) {
  return auth.requirePermission(permission);
}

function currentUsername() {
  const session = auth.status();
  return session.authenticated && session.user ? session.user.username : null;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

async function confirm(parentWindow, options) {
  const result = await dialog.showMessageBox(parentWindow, {
    type: 'question',
    buttons: ['Cancelar', 'Confirmar'],
    defaultId: 0,
    cancelId: 0,
    ...options,
  });

  return result.response === 1;
}

async function confirmCritical(parentWindow, options) {
  return confirm(parentWindow, {
    type: 'warning',
    buttons: ['Cancelar', 'Confirmar'],
    defaultId: 0,
    cancelId: 0,
    ...options,
  });
}

function daysSince(dateString) {
  if (!dateString) {
    return null;
  }

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - date) / (1000 * 60 * 60 * 24));
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isUsableReferenceDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && value <= localDateString();
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const headerLine = headers.map(csvCell).join(';');
  const rowLines = rows.map((row) => headers.map((header) => csvCell(row[header])).join(';'));
  return [headerLine, ...rowLines].join('\r\n');
}

function publicUserAuditData(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    permissions: user.permissions || {},
  };
}

function formatDelay(days) {
  if (days === null || days === undefined) {
    return 'sem data para calcular';
  }

  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  if (months <= 0) {
    return `${days} dias`;
  }
  if (remainingDays === 0) {
    return `${months} mes${months > 1 ? 'es' : ''}`;
  }
  return `${months} mes${months > 1 ? 'es' : ''} e ${remainingDays} dias`;
}

function getReferenceDate(row) {
  // Qualquer pagamento, mesmo parcial, reinicia a contagem de atraso.
  // Se houver compra fiada depois do pagamento, a nova compra vira a referencia.
  const dates = [row.ultima_data_pagamento, row.dataPagamento, row.ultima_compra_fiado]
    .filter(isUsableReferenceDate)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function getOverdueRows(rows) {
  return getCollectionRows(rows)
    .filter((row) => row.statusCobranca === 'atrasado');
}

function getCollectionRows(rows) {
  return rows
    .filter((row) => Number(row.divida) > 0)
    .map((row) => {
      const referencia = getReferenceDate(row);
      const atrasoDias = daysSince(referencia);
      let statusCobranca = 'sem_data';
      if (atrasoDias !== null && atrasoDias >= overdueThresholdDays) {
        statusCobranca = 'atrasado';
      } else if (atrasoDias !== null && atrasoDias >= 60) {
        statusCobranca = 'atencao';
      } else if (atrasoDias !== null) {
        statusCobranca = 'em_dia';
      }

      return {
        ...row,
        referencia,
        atrasoDias,
        atrasoTexto: formatDelay(atrasoDias),
        statusCobranca,
      };
    })
    .sort((a, b) => {
      const order = { atrasado: 0, atencao: 1, sem_data: 2, em_dia: 3 };
      const statusDiff = order[a.statusCobranca] - order[b.statusCobranca];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return Number(b.atrasoDias || 0) - Number(a.atrasoDias || 0);
    });
}

async function handleVerifyPayments(event) {
  const rows = await listClientesWithPaymentStatus();
  const collectionRows = getCollectionRows(rows);
  const overdueRows = collectionRows.filter((row) => row.statusCobranca === 'atrasado');
  const attentionRows = collectionRows.filter((row) => row.statusCobranca === 'atencao');

  if (overdueRows.length === 0) {
    await dialog.showMessageBox(getSenderWindow(event), {
      type: attentionRows.length ? 'warning' : 'info',
      title: 'Verificacao de Pagamentos',
      message: attentionRows.length
        ? `Nao ha clientes com 3 meses ou mais, mas ha clientes chegando perto:\n> ${attentionRows.slice(0, 12).map((row) => `${row.nome.toUpperCase()} - ${formatCurrency(row.divida)} - ${row.atrasoTexto}`).join('\n> ')}`
        : 'Nao ha clientes com divida vencida ha 3 meses ou mais.',
    });
    return;
  }

  const overdueNames = overdueRows.map((row) => (
    `${row.nome.toUpperCase()} - ${formatCurrency(row.divida)} - atraso: ${row.atrasoTexto} - referencia: ${row.referencia || 'sem data'}`
  ));

  await dialog.showMessageBox(getSenderWindow(event), {
    type: 'warning',
    title: 'Alerta de Pagamento',
    message: `Clientes com divida vencida ha 3 meses ou mais:\n> ${overdueNames.join('\n> ')}`,
  });
}

async function openWhatsAppDraft(payload) {
  const phone = normalizePhone(payload && payload.phone);
  if (phone.length < 10 || phone.length > 15) throw new Error('Telefone ausente ou invalido.');
  const message = String(payload && payload.message || '').slice(0, 1500);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  await shell.openExternal(url);
  return { opened: true, sent: false };
}

function registerIpcHandlers() {
  ipcMain.handle('whatsapp:dashboard', async () => {
    requirePermission('whatsapp');
    const rows = await listWhatsAppDashboard();
    const clients = new Map();
    const history = (await listWhatsAppHistory(200)).map((row) => ({ id: row.id, cliente: row.nome, tipo: row.tipo,
      data_prevista: row.data_prevista, data_vencimento: row.data_vencimento, tentativa_em: row.tentativa_em, status: row.status,
      tentativas: row.tentativas, erro: row.erro, entregue_em: row.entregue_em,
      cancelado_em: row.cancelado_em, api_message_id: row.api_message_id }));
    for (const row of rows) {
      if (!clients.has(row.id)) clients.set(row.id, { id: row.id, nome: row.nome, telefone: row.telefone,
        divida: row.divida, data_vencimento: row.data_vencimento, consent: Number(row.whatsapp_opt_in) === 1 });
    }
    const today = localDateString();
    const list = [...clients.values()].map((client) => {
      const status = statusForDueDate(client.data_vencimento, today);
      return { ...client, status, telefoneValido: isValidPhone(client.telefone) };
    });
    return { clients: list, history, settings: { ...whatsapp.publicSettings(), companyName: loadAppConfig().company.name },
      totals: { clients: list.length, debt: list.reduce((sum, item) => sum + Number(item.divida || 0), 0),
        today: list.filter((item) => item.status === 'vence_hoje').length,
        overdue: list.filter((item) => item.status === 'atrasado').length } };
  });
  ipcMain.handle('whatsapp:settings', async () => { requirePermission('whatsapp'); return whatsapp.publicSettings(); });
  ipcMain.handle('whatsapp:settings-save', async (_event, settings) => {
    requireOwnerAccess();
    if (settings && settings.apiVersion && !/^v\d+\.\d+$/.test(String(settings.apiVersion))) throw new Error('Informe a versão da Graph API no formato vNN.N.');
    if (settings && settings.phoneNumberId && !/^\d{5,40}$/.test(String(settings.phoneNumberId))) throw new Error('ID do número comercial inválido.');
    if (settings && settings.businessAccountId && !/^\d{5,40}$/.test(String(settings.businessAccountId))) throw new Error('ID da conta empresarial inválido.');
    const saved = whatsapp.saveSettings(settings || {});
    await writeAuditLog({ entidade: 'WhatsApp', acao: 'ALTERAR_CONFIGURACAO', usuario: currentUsername(),
      dadosDepois: { ...saved, tokenConfigured: saved.tokenConfigured, token: undefined } });
    return saved;
  });
  ipcMain.handle('whatsapp:test-connection', async () => {
    requireOwnerAccess();
    try { const result = await whatsapp.testConnection(); return result; }
    catch (error) { throw new Error(String(error.message || 'Falha na conexao.').slice(0, 500)); }
  });
  ipcMain.handle('whatsapp:open-draft', async (_event, payload) => {
    requirePermission('whatsapp');
    return openWhatsAppDraft(payload);
  });
  ipcMain.handle('hoje:copy-collection-message', async (_event, message) => {
    requirePermission('clients');
    const text = String(message || '').trim();
    if (!text || text.length > 1500) throw new Error('Mensagem invalida.');
    clipboard.writeText(text);
    return { copied: true };
  });
  ipcMain.handle('hoje:open-collection-draft', async (_event, payload) => {
    requirePermission('clients');
    return openWhatsAppDraft(payload);
  });
  ipcMain.handle('hoje:mark-collection-sent', async (_event, clienteId) => {
    requirePermission('clients');
    const id = Number(clienteId);
    if (!Number.isInteger(id) || id < 1) throw new Error('Cliente inválido.');
    const month = localDateString().slice(0, 7);
    const before = await getManualCollectionSent(id, month);
    const sentDate = localDateString();
    const record = await markManualCollectionSent(id, month, currentUsername(), sentDate);
    await writeAuditLog({
      entidade: 'CobrancasEnviadasManualmente',
      entidadeId: id,
      acao: 'CONFIRMAR_ENVIO_COBRANCA',
      usuario: currentUsername(),
      dadosAntes: before,
      dadosDepois: record,
    });
    return record;
  });
  ipcMain.handle('hoje:unmark-collection-sent', async (_event, clienteId) => {
    requirePermission('clients');
    const id = Number(clienteId);
    if (!Number.isInteger(id) || id < 1) throw new Error('Cliente inválido.');
    const month = localDateString().slice(0, 7);
    const before = await getManualCollectionSent(id, month);
    if (!before) return { removed: false };
    await unmarkManualCollectionSent(id, month);
    await writeAuditLog({
      entidade: 'CobrancasEnviadasManualmente',
      entidadeId: id,
      acao: 'CORRIGIR_CONFIRMACAO_ENVIO_COBRANCA',
      usuario: currentUsername(),
      dadosAntes: before,
    });
    return { removed: true };
  });
  ipcMain.handle('hoje:tasks-context', async () => {
    const user = requireLogin();
    return {
      user: { username: user.username, name: user.name, role: user.role },
      isOwner: user.role === 'owner',
      users: user.role === 'owner'
        ? auth.listUsers().filter((item) => item.active !== false)
        : [],
    };
  });
  ipcMain.handle('hoje:tasks-list', async () => {
    const user = requireLogin();
    return listOperationalTasks({
      responsavelUsername: user.username,
      includeAll: user.role === 'owner',
      today: localDateString(),
    });
  });
  ipcMain.handle('hoje:tasks-create', async (_event, payload = {}) => {
    requireOwnerAccess();
    const user = auth.requireAuthenticated();
    const title = String(payload.titulo || '').trim().slice(0, 100);
    const details = String(payload.detalhes || '').trim().slice(0, 500);
    const dueDate = String(payload.dataPrevista || '');
    if (!title) throw new Error('Escolha ou informe o nome da tarefa.');
    if (!isValidDate(dueDate)) throw new Error('Informe uma data válida para a tarefa.');
    const parsedDate = new Date(`${dueDate}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dueDate) {
      throw new Error('Informe uma data válida para a tarefa.');
    }
    const assigneeUsername = payload.responsavelUsername === '__self'
      ? user.username
      : String(payload.responsavelUsername || '');
    const assignee = auth.listUsers().find((item) => item.username === assigneeUsername && item.active !== false);
    if (!assignee) throw new Error('Escolha um funcionário ativo para receber a tarefa.');
    return createOperationalTask({
      titulo: title,
      detalhes: details,
      responsavelUsername: assignee.username,
      dataPrevista: dueDate,
      criadoPor: user.username,
    });
  });
  ipcMain.handle('hoje:tasks-complete', async (_event, taskId) => {
    const user = requireLogin();
    const id = Number(taskId);
    if (!Number.isInteger(id) || id < 1) throw new Error('Tarefa inválida.');
    const task = await getOperationalTask(id);
    if (!task) throw new Error('Tarefa não encontrada.');
    if (user.role !== 'owner' && task.responsavel_username !== user.username) {
      throw new Error('Você só pode concluir tarefas atribuídas a você.');
    }
    return completeOperationalTask(id, user.username, localDateString());
  });
  ipcMain.handle('hoje:tasks-reopen', async (_event, taskId) => {
    requireOwnerAccess();
    const id = Number(taskId);
    if (!Number.isInteger(id) || id < 1) throw new Error('Tarefa inválida.');
    return reopenOperationalTask(id, currentUsername());
  });
  ipcMain.handle('whatsapp:send-test', async () => {
    requireOwnerAccess();
    const settings = whatsapp.getSettings();
    if (!settings.authorizedTestNumber || !settings.templates.teste) throw new Error('Informe o numero de teste autorizado e o modelo aprovado de teste.');
    const eventDate = localDateString();
    try {
      await createWhatsAppEvent(0, 'teste', eventDate, eventDate);
      await beginWhatsAppAttempt({ clienteId: 0, tipo: 'teste', dataPrevista: eventDate, dataVencimento: eventDate });
      const result = await whatsapp.sendCloudTemplate({ telefone: settings.authorizedTestNumber, nome: 'Teste',
        divida: 0, data_vencimento: '', whatsapp_opt_in: true }, 'teste', settings.templates.teste, settings.templateLanguage,
      { allowAuthorizedTest: true });
      await finishWhatsAppAttempt({ clienteId: 0, tipo: 'teste', dataPrevista: eventDate, status: 'aceito_api', messageId: result.messageId || null });
      await writeAuditLog({ entidade: 'WhatsApp', acao: 'ENVIAR_TESTE', usuario: currentUsername(),
        dadosDepois: { status: 'aceito_pela_api', messageId: result.messageId || null } });
      return { sent: true, messageId: result.messageId || null };
    } catch (error) {
      await finishWhatsAppAttempt({ clienteId: 0, tipo: 'teste', dataPrevista: eventDate,
        status: 'falha', error: String(error.message || 'Falha').slice(0, 500) });
      await writeAuditLog({ entidade: 'WhatsApp', acao: 'FALHA_TESTE', usuario: currentUsername(),
        dadosDepois: { status: 'falha', erro: String(error.message || 'Falha').slice(0, 500) } });
      throw new Error(String(error.message || 'Falha no envio.').slice(0, 500));
    }
  });
  ipcMain.handle('whatsapp:history', async () => { requirePermission('whatsapp'); return listWhatsAppHistory(); });
  ipcMain.handle('whatsapp:run-manual', async () => { requireOwnerAccess(); return runVerification({ manual: true }); });
  ipcMain.handle('app:config', async () => loadAppConfig());
  ipcMain.handle('app:open-whatsapp', async (_event, targetUrl) => {
    requirePermission('whatsapp');
    const config = loadAppConfig();
    const url = String(targetUrl || config.company.whatsappUrl || 'https://web.whatsapp.com/');
    if (!url.startsWith('https://web.whatsapp.com/') && !url.startsWith('https://wa.me/')) {
      throw new Error('URL de WhatsApp invalida.');
    }

    openWhatsappWindow(url);
    return { opened: true };
  });
  ipcMain.handle('app:save-config', async (_event, nextConfig) => {
    requireOwnerAccess();
    const before = loadAppConfig();
    const saved = saveAppConfig(nextConfig);
    await writeAuditLog({
      entidade: 'Configuracoes',
      acao: 'ALTERAR_CONFIGURACOES',
      usuario: currentUsername(),
      dadosAntes: {
        company: before.company,
        modules: before.modules,
        businessProfile: before.businessProfile,
        sessionTimeoutMinutes: before.auth.sessionTimeoutMinutes,
      },
      dadosDepois: {
        company: saved.company,
        modules: saved.modules,
        businessProfile: saved.businessProfile,
        sessionTimeoutMinutes: saved.auth.sessionTimeoutMinutes,
      },
    });
    return saved;
  });
  ipcMain.handle('app:select-logo', async (event) => {
    requireOwnerAccess();
    const result = await dialog.showOpenDialog(getSenderWindow(event), {
      title: 'Escolher logo da empresa',
      properties: ['openFile'],
      filters: [
        { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    const source = result.filePaths[0];
    const extension = path.extname(source).toLowerCase() || '.png';
    const logoPath = path.join(projectRoot, 'config', `company-logo${extension}`);
    fs.mkdirSync(path.dirname(logoPath), { recursive: true });
    fs.copyFileSync(source, logoPath);

    const config = loadAppConfig();
    const saved = saveAppConfig({
      ...config,
      company: {
        ...config.company,
        logo: `../config/company-logo${extension}`,
      },
    });
    await writeAuditLog({
      entidade: 'Configuracoes',
      acao: 'ALTERAR_LOGO',
      usuario: currentUsername(),
      dadosAntes: { logo: config.company.logo },
      dadosDepois: { logo: saved.company.logo },
    });

    return { canceled: false, config: saved };
  });
  ipcMain.handle('app:export-csv', async (event, payload) => {
    requireLogin();
    const headers = Array.isArray(payload.headers) ? payload.headers : [];
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!headers.length) {
      throw new Error('Nao ha colunas para exportar.');
    }

    const result = await dialog.showSaveDialog(getSenderWindow(event), {
      title: 'Salvar relatorio',
      defaultPath: payload.defaultName || 'relatorio.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, `\uFEFF${toCsv(headers, rows)}`, 'utf8');
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle('app:database-health', async () => {
    requireOwnerAccess();
    return getDatabaseHealth();
  });
  ipcMain.handle('auth:status', async () => auth.status());
  ipcMain.handle('auth:login', async (_event, credentials) => auth.login(credentials.username, credentials.password));
  ipcMain.handle('auth:logout', async () => auth.logout());
  ipcMain.handle('auth:users', async () => auth.listUsers().filter((user) => user.active !== false));
  ipcMain.handle('auth:users-save', async (_event, userData) => {
    requireOwnerAccess();
    const before = auth.listUsers().find((user) => user.username === String(userData.username || '').trim().toLowerCase());
    const saved = auth.saveUser(userData);
    await writeAuditLog({
      entidade: 'Usuarios',
      acao: before ? 'ALTERAR_USUARIO' : 'CRIAR_USUARIO',
      usuario: currentUsername(),
      dadosAntes: publicUserAuditData(before),
      dadosDepois: publicUserAuditData(saved),
    });
    return saved;
  });
  ipcMain.handle('auth:users-delete', async (event, username) => {
    requireOwnerAccess();
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Desativar usuario'],
      title: 'Confirmar desativacao',
      message: `Deseja desativar o usuario ${username}? O historico antigo continuara mostrando esse usuario.`,
    });

    if (!ok) {
      return { deleted: false };
    }

    const before = auth.listUsers().find((user) => user.username === username);
    const result = auth.deactivateUser(username);
    if (result.deleted) {
      await writeAuditLog({
        entidade: 'Usuarios',
        acao: 'DESATIVAR_USUARIO',
        usuario: currentUsername(),
        dadosAntes: publicUserAuditData(before),
        dadosDepois: { username, active: false },
      });
    }

    return result;
  });

  ipcMain.handle('backup-database', async (event) => {
    requireLogin();
    const result = await backupDatabase(getSenderWindow(event));
    if (!result.canceled) {
      await writeAuditLog({
        entidade: 'Backup',
        acao: 'GERAR_BACKUP',
        usuario: currentUsername(),
        dadosDepois: { backupPath: result.backupPath },
      });
    }

    return result;
  });

  ipcMain.handle('clientes:create', async (_event, data) => {
    requirePermission('clients');
    return insertCliente(data, { usuario: currentUsername() });
  });
  ipcMain.handle('clientes:update', async (_event, data) => {
    requirePermission('clients');
    return updateCliente(data, { usuario: currentUsername() });
  });
  ipcMain.handle('clientes:list', async () => {
    requirePermission('clients');
    return listClientes();
  });
  ipcMain.handle('clientes:get-by-name', async (_event, nome) => {
    requirePermission('clients');
    return getClienteByName(nome);
  });
  ipcMain.handle('clientes:autocomplete', async (_event, nome, limit = 10) => {
    requirePermission('clients');
    return searchClientesByPrefix(nome, limit);
  });

  ipcMain.handle('clientes:delete', async (event, idCliente) => {
    requirePermission('criticalActions');
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Inativar cliente'],
      title: 'Confirmar inativacao',
      message: `Deseja inativar o cliente ID ${idCliente}? O cadastro nao sera apagado do banco, apenas ocultado das telas principais.`,
    });

    if (!ok) {
      return { deleted: false };
    }

    await deleteCliente(idCliente, {
      motivo: 'Confirmado na tela de clientes',
      usuario: currentUsername(),
    });
    return { deleted: true, id: idCliente };
  });

  ipcMain.handle('vendas:create', async (event, data) => {
    requirePermission('sales');
    const ok = await confirmCritical(getSenderWindow(event), {
      title: 'Confirmar venda',
      message: `Confirmar venda de ${formatCurrency(data.preco)} para ${data.cliente} em ${data.metodoPagamento}?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return insertVenda(data, { usuario: currentUsername() });
  });
  ipcMain.handle('vendas:list', async () => {
    requirePermission('history');
    return listVendas();
  });
  ipcMain.handle('vendas:list-filtered', async (_event, filters) => {
    requirePermission('history');
    return listVendasFiltered(filters || {});
  });
  ipcMain.handle('vendas:list-by-cliente', async (_event, cliente) => {
    requirePermission('clients');
    return listVendasByCliente(cliente);
  });
  ipcMain.handle('vendas:list-by-date', async (_event, date) => {
    if (!isValidDate(date)) {
      return [];
    }
    return listVendasByDate(date);
  });
  ipcMain.handle('vendas:delete', async (event, id) => {
    requirePermission('operationalCorrections');
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Cancelar venda'],
      title: 'Operacao financeira critica',
      message: 'Deseja cancelar esta venda? Ela nao sera apagada: ficara registrada como cancelada, a divida fiada sera ajustada e o estoque sera devolvido quando existir controle de estoque.',
    });

    if (!ok) {
      return { deleted: false };
    }

    return deleteVendaAndAdjustDebt(id, {
      motivo: 'Confirmado no historico',
      usuario: currentUsername(),
    });
  });

  ipcMain.handle('pagamentos:create', async (event, data) => {
    requirePermission('payments');
    const ok = await confirmCritical(getSenderWindow(event), {
      title: 'Confirmar pagamento',
      message: `Confirmar pagamento de ${formatCurrency(data.valorPagamento)} para ${data.nomePagador}?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return registerPayment(data, { usuario: currentUsername() });
  });
  ipcMain.handle('pagamentos:list', async () => {
    requirePermission('history');
    return listPagamentos();
  });
  ipcMain.handle('pagamentos:list-filtered', async (_event, filters) => {
    requirePermission('history');
    return listPagamentosFiltered(filters || {});
  });
  ipcMain.handle('pagamentos:list-by-cliente', async (_event, cliente) => {
    requirePermission('clients');
    return listPagamentosByCliente(cliente);
  });
  ipcMain.handle('pagamentos:list-by-date', async (_event, date) => {
    if (!isValidDate(date)) {
      return [];
    }
    return listPagamentosByDate(date);
  });
  ipcMain.handle('pagamentos:list-by-interval', async (_event, { dataInicio, dataFim }) => {
    if (!isValidDate(dataInicio) || !isValidDate(dataFim)) {
      return [];
    }
    return listPagamentosByInterval(dataInicio, dataFim);
  });
  ipcMain.handle('pagamentos:delete', async (event, id) => {
    requirePermission('operationalCorrections');
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Cancelar pagamento'],
      title: 'Operacao financeira critica',
      message: 'Deseja cancelar este pagamento? Ele nao sera apagado: ficara registrado como cancelado e o valor voltara para a divida do cliente.',
    });

    if (!ok) {
      return { deleted: false };
    }

    return deletePagamentoAndRestoreDebt(id, {
      motivo: 'Confirmado no historico',
      usuario: currentUsername(),
    });
  });

  ipcMain.handle('financeiro:resumo', async (_event, { dataInicio, dataFim }) => {
    requireOwnerAccess();

    if (!isValidDate(dataInicio) || !isValidDate(dataFim)) {
      return { totalVendas: 0, totalPagamentos: 0, metodos: [] };
    }

    const [totalVendas, quantidadeVendas, vendasRecebidas, pagamentos, totalDespesas, despesas, totalFiado, metodos] = await Promise.all([
      sumVendas(dataInicio, dataFim),
      countVendasByInterval(dataInicio, dataFim),
      sumReceivedSales(dataInicio, dataFim),
      listPagamentosByInterval(dataInicio, dataFim),
      sumDespesas(dataInicio, dataFim),
      listDespesasByInterval(dataInicio, dataFim),
      sumVendasByPaymentMethod('Fiado', dataInicio, dataFim),
      Promise.all(
        paymentMethods.map(async (metodoPagamento) => ({
          metodoPagamento,
          total: await sumVendasByPaymentMethod(metodoPagamento, dataInicio, dataFim),
        })),
      ),
    ]);

    const totalPagamentos = pagamentos.reduce((total, pagamento) => total + Number(pagamento.valor_pago || 0), 0);
    const totalEntradas = Number(vendasRecebidas || 0) + totalPagamentos;
    return {
      totalVendas,
      quantidadeVendas,
      vendasRecebidas,
      totalPagamentos,
      totalDespesas,
      totalFiado,
      ticketMedio: quantidadeVendas > 0 ? Number(totalVendas || 0) / quantidadeVendas : 0,
      totalEntradas,
      saldo: totalEntradas - Number(totalDespesas || 0),
      despesas,
      metodos,
    };
  });

  ipcMain.handle('caixa:status', async () => {
    const user = requirePermission('cash');
    const session = await getOpenCashSession(user.username);
    if (!session) {
      return { open: false };
    }

    const totals = await getCashTotals(user.username, session.data_caixa);
    const totalEsperado = Number(session.valor_inicial || 0)
      + Number(totals.totalVendasPagas || 0)
      + Number(totals.totalPagamentos || 0)
      - Number(totals.totalDespesas || 0);

    return {
      open: true,
      session,
      totals: {
        ...totals,
        totalEsperado: Math.round(totalEsperado * 100) / 100,
      },
    };
  });

  ipcMain.handle('caixa:abrir', async (event, data) => {
    const user = requirePermission('cash');
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Abrir caixa'],
      title: 'Abrir caixa',
      message: `Deseja abrir o caixa de ${user.name || user.username} com valor inicial de ${formatCurrency(data.valorInicial)}?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return openCashSession({
      usuario: user.username,
      valorInicial: data.valorInicial,
    });
  });

  ipcMain.handle('caixa:fechar', async (event, data) => {
    const user = requirePermission('cash');
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Fechar caixa'],
      title: 'Fechar caixa',
      message: `Confirmar fechamento com valor contado de ${formatCurrency(data.valorInformado)}? Depois disso o fechamento fica registrado na administracao.`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return closeCashSession(data.id, {
      usuario: user.username,
      valorInformado: data.valorInformado,
      observacao: data.observacao,
    });
  });

  ipcMain.handle('caixa:list', async (_event, filters) => {
    requireOwnerAccess();
    return listCashSessions(filters || {});
  });

  ipcMain.handle('contas:create', async (event, conta) => {
    requireOwnerAccess();
    const tipoLabel = conta.tipo === 'receber' ? 'conta a receber' : 'conta a pagar';
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Registrar'],
      title: 'Registrar conta',
      message: `Deseja registrar ${tipoLabel} de ${formatCurrency(conta.valor)} com vencimento em ${conta.vencimento}?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return createFinancialAccount(conta, { usuario: currentUsername() });
  });

  ipcMain.handle('contas:list', async (_event, filters) => {
    requireOwnerAccess();
    return listFinancialAccounts(filters || {});
  });

  ipcMain.handle('contas:pay', async (event, id) => {
    requireOwnerAccess();
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Confirmar'],
      title: 'Confirmar quitacao',
      message: 'Confirmar que esta conta foi paga/recebida? O registro ficara salvo na auditoria.',
    });

    if (!ok) {
      return { paid: false };
    }

    return markFinancialAccountPaid(id, { usuario: currentUsername() });
  });

  ipcMain.handle('contas:cancel', async (event, id) => {
    requireOwnerAccess();
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Cancelar conta'],
      title: 'Cancelar conta',
      message: 'Deseja cancelar esta conta? Ela nao sera apagada, apenas marcada como cancelada.',
    });

    if (!ok) {
      return { cancelled: false };
    }

    return cancelFinancialAccount(id, {
      motivo: 'Confirmado na administracao',
      usuario: currentUsername(),
    });
  });

  ipcMain.handle('auditoria:list', async (_event, filters) => {
    requireOwnerAccess();
    return listAuditLog(filters || {});
  });

  ipcMain.handle('dashboard:resumo', async () => {
    const today = localDateString();
    const paymentRows = await listClientesWithPaymentStatus();
    const clientesAtrasados = getOverdueRows(paymentRows).length;

    const [quantidadeVendasHoje, clientesComDivida] = await Promise.all([
      countVendasByDate(today),
      countClientesWithDebt(),
    ]);

    return {
      date: today,
      quantidadeVendasHoje,
      clientesComDivida,
      clientesAtrasados,
    };
  });

  ipcMain.handle('hoje:resumo', async () => {
    const user = requireLogin();
    const today = localDateString();
    const monthDay = today.slice(5);
    const paymentRows = await listClientesWithPaymentStatus();
    const cobrancas = getCollectionRows(paymentRows);
    const clientesEmAtraso = cobrancas.filter((row) => row.statusCobranca === 'atrasado');
    const clientesParaAcompanhar = cobrancas
      .filter((row) => ['atencao', 'sem_data'].includes(row.statusCobranca))
      .slice(0, 12);

    const [quantidadeVendasHoje, aniversariantes, cobrancasEnviadasEsteMes] = await Promise.all([
      countVendasByDate(today),
      listBirthdayClientes(monthDay),
      listManualCollectionSent(today.slice(0, 7)),
    ]);

    const estoqueBaixo = user.permissions && user.permissions.products
      ? await listLowStockProdutos()
      : [];
    const caixaAberto = user.permissions && user.permissions.cash
      ? await getOpenCashSession(user.username)
      : null;

    return {
      data: today,
      quantidadeVendasHoje,
      caixaAberto: Boolean(caixaAberto),
      clientesEmAtraso,
      cobrancasEnviadasEsteMes: Object.fromEntries(
        cobrancasEnviadasEsteMes.map((row) => [row.cliente_id, row]),
      ),
      clientesParaAcompanhar,
      totalAtrasados: cobrancas.filter((row) => row.statusCobranca === 'atrasado').length,
      totalAtencao: cobrancas.filter((row) => row.statusCobranca === 'atencao').length,
      aniversariantes,
      estoqueBaixo: estoqueBaixo.slice(0, 12),
    };
  });

  ipcMain.handle('produtos:list', async () => {
    requirePermission('products');
    return listProdutos();
  });
  ipcMain.handle('produtos:search', async (_event, term, limit = 10) => {
    requirePermission('products');
    return searchProdutos(term, limit);
  });
  ipcMain.handle('produtos:get-by-code', async (_event, codigo) => {
    requirePermission('products');
    return getProdutoByCode(codigo);
  });
  ipcMain.handle('produtos:low-stock', async () => {
    requirePermission('products');
    return listLowStockProdutos();
  });
  ipcMain.handle('produtos:save', async (_event, produto) => {
    requirePermission('products');
    return upsertProduto(produto, { usuario: currentUsername() });
  });
  ipcMain.handle('produtos:stock-move', async (event, data) => {
    requirePermission('products');
    const actionLabels = {
      entrada: 'entrada de estoque',
      saida: 'saida de estoque',
      ajuste: 'ajuste de estoque',
    };
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Confirmar'],
      title: 'Confirmar estoque',
      message: `Confirmar ${actionLabels[data.tipo] || 'movimentacao'} de quantidade ${data.quantidade}? Esta acao ficara registrada na auditoria.`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return moveProdutoStock(data, { usuario: currentUsername() });
  });
  ipcMain.handle('produtos:stock-history', async (_event, filters) => {
    requirePermission('products');
    return listProdutoStockMovements(filters || {});
  });
  ipcMain.handle('produtos:delete', async (event, id) => {
    requirePermission('criticalActions');
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Desativar produto'],
      title: 'Confirmar desativacao',
      message: 'Deseja desativar este produto? Ele nao sera apagado do banco, mas deixara de aparecer nas vendas.',
    });

    if (!ok) {
      return { deleted: false };
    }

    return deactivateProduto(id, {
      motivo: 'Confirmado na tela de produtos',
      usuario: currentUsername(),
    });
  });

  ipcMain.handle('despesas:create', async (event, despesa) => {
    requireOwnerAccess();
    const ok = await confirmCritical(getSenderWindow(event), {
      title: 'Confirmar saida',
      message: `Confirmar saida de ${formatCurrency(despesa.valor)} para "${despesa.descricao}"?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return insertDespesa(despesa, { usuario: currentUsername() });
  });
  ipcMain.handle('despesas:delete', async (event, id) => {
    requireOwnerAccess();
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Cancelar saida'],
      title: 'Operacao financeira critica',
      message: 'Deseja cancelar esta saida? Ela nao sera apagada: ficara registrada como cancelada e saira dos totais financeiros.',
    });

    if (!ok) {
      return { deleted: false };
    }

    return deleteDespesa(id, {
      motivo: 'Confirmado na administracao',
      usuario: currentUsername(),
    });
  });

  ipcMain.handle('pagamentos:verificar-atrasos', handleVerifyPayments);
}

module.exports = { registerIpcHandlers };

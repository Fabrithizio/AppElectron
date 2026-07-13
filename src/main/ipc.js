const { BrowserWindow, dialog, ipcMain } = require('electron');
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
} = require('./database');

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

function registerIpcHandlers() {
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
    const clientesParaCobrar = cobrancas
      .filter((row) => ['atrasado', 'atencao', 'sem_data'].includes(row.statusCobranca))
      .slice(0, 12);

    const [quantidadeVendasHoje, aniversariantes] = await Promise.all([
      countVendasByDate(today),
      listBirthdayClientes(monthDay),
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
      clientesParaCobrar,
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

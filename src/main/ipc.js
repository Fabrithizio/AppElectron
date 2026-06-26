const { BrowserWindow, dialog, ipcMain } = require('electron');
const auth = require('./auth');
const { backupDatabase } = require('./backup');
const { loadAppConfig, saveAppConfig } = require('./config');
const {
  countClientesWithDebt,
  countVendasByDate,
  countVendasByInterval,
  deactivateProduto,
  deleteDespesa,
  deleteCliente,
  deletePagamentoAndRestoreDebt,
  deleteVendaAndAdjustDebt,
  getClienteByName,
  getProdutoByCode,
  insertCliente,
  insertVenda,
  listAuditLog,
  listClientes,
  listClientesWithPaymentStatus,
  listDespesasByInterval,
  listLowStockProdutos,
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
} = require('./database');

const paymentMethods = ['Pix', 'Especie', 'Fiado', 'Debito', 'Credito'];

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

async function handleVerifyPayments(event) {
  const rows = await listClientesWithPaymentStatus();
  const overdueNames = rows
    .filter((row) => Number(row.divida) > 0)
    .filter((row) => {
      const daysFromPayment = daysSince(row.ultima_data_pagamento);
      const daysFromPurchase = daysSince(row.ultima_data_compra);

      return (
        (daysFromPayment === null && daysFromPurchase === null) ||
        (daysFromPayment === null && daysFromPurchase >= 30) ||
        daysFromPayment >= 30
      );
    })
    .map((row) => row.nome.toUpperCase());

  if (overdueNames.length === 0) {
    await dialog.showMessageBox(getSenderWindow(event), {
      type: 'info',
      title: 'Verificacao de Pagamentos',
      message: 'Nao ha clientes com divida vencida ha 30 ou mais dias.',
    });
    return;
  }

  await dialog.showMessageBox(getSenderWindow(event), {
    type: 'warning',
    title: 'Alerta de Pagamento',
    message: `Clientes com divida vencida:\n> ${overdueNames.join('\n> ')}`,
  });
}

function registerIpcHandlers() {
  ipcMain.handle('app:config', async () => loadAppConfig());
  ipcMain.handle('app:save-config', async (_event, nextConfig) => {
    requireOwnerAccess();
    return saveAppConfig(nextConfig);
  });
  ipcMain.handle('auth:status', async () => auth.status());
  ipcMain.handle('auth:login', async (_event, credentials) => auth.login(credentials.username, credentials.password));
  ipcMain.handle('auth:logout', async () => auth.logout());
  ipcMain.handle('auth:users', async () => auth.listUsers().filter((user) => user.active !== false));
  ipcMain.handle('auth:users-save', async (_event, userData) => {
    requireOwnerAccess();
    return auth.saveUser(userData);
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

    return auth.deactivateUser(username);
  });

  ipcMain.handle('backup-database', async (event) => backupDatabase(getSenderWindow(event)));

  ipcMain.handle('clientes:create', async (_event, data) => {
    requireLogin();
    return insertCliente(data);
  });
  ipcMain.handle('clientes:update', async (_event, data) => {
    requireLogin();
    return updateCliente(data);
  });
  ipcMain.handle('clientes:list', async () => listClientes());
  ipcMain.handle('clientes:get-by-name', async (_event, nome) => getClienteByName(nome));
  ipcMain.handle('clientes:autocomplete', async (_event, nome, limit = 10) => searchClientesByPrefix(nome, limit));

  ipcMain.handle('clientes:delete', async (event, idCliente) => {
    requireOwnerAccess();
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
    requireLogin();
    const ok = await confirmCritical(getSenderWindow(event), {
      title: 'Confirmar venda',
      message: `Confirmar venda de ${formatCurrency(data.preco)} para ${data.cliente} em ${data.metodoPagamento}?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return insertVenda(data, { usuario: currentUsername() });
  });
  ipcMain.handle('vendas:list', async () => listVendas());
  ipcMain.handle('vendas:list-filtered', async (_event, filters) => listVendasFiltered(filters || {}));
  ipcMain.handle('vendas:list-by-cliente', async (_event, cliente) => listVendasByCliente(cliente));
  ipcMain.handle('vendas:list-by-date', async (_event, date) => {
    if (!isValidDate(date)) {
      return [];
    }
    return listVendasByDate(date);
  });
  ipcMain.handle('vendas:delete', async (event, id) => {
    requireOwnerAccess();
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
    requireLogin();
    const ok = await confirmCritical(getSenderWindow(event), {
      title: 'Confirmar pagamento',
      message: `Confirmar pagamento de ${formatCurrency(data.valorPagamento)} para ${data.nomePagador}?`,
    });

    if (!ok) {
      return { cancelled: true };
    }

    return registerPayment(data, { usuario: currentUsername() });
  });
  ipcMain.handle('pagamentos:list', async () => listPagamentos());
  ipcMain.handle('pagamentos:list-filtered', async (_event, filters) => listPagamentosFiltered(filters || {}));
  ipcMain.handle('pagamentos:list-by-cliente', async (_event, cliente) => listPagamentosByCliente(cliente));
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
    requireOwnerAccess();
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

  ipcMain.handle('auditoria:list', async (_event, filters) => {
    requireOwnerAccess();
    return listAuditLog(filters || {});
  });

  ipcMain.handle('dashboard:resumo', async () => {
    const today = new Date().toISOString().split('T')[0];
    const paymentRows = await listClientesWithPaymentStatus();
    const clientesAtrasados = paymentRows.filter((row) => {
      if (Number(row.divida || 0) <= 0) {
        return false;
      }

      const daysFromPayment = daysSince(row.ultima_data_pagamento);
      const daysFromPurchase = daysSince(row.ultima_data_compra);
      return (
        (daysFromPayment === null && daysFromPurchase === null) ||
        (daysFromPayment === null && daysFromPurchase >= 30) ||
        daysFromPayment >= 30
      );
    }).length;

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

  ipcMain.handle('produtos:list', async () => listProdutos());
  ipcMain.handle('produtos:search', async (_event, term, limit = 10) => searchProdutos(term, limit));
  ipcMain.handle('produtos:get-by-code', async (_event, codigo) => getProdutoByCode(codigo));
  ipcMain.handle('produtos:low-stock', async () => {
    requireLogin();
    return listLowStockProdutos();
  });
  ipcMain.handle('produtos:save', async (_event, produto) => {
    requireLogin();
    return upsertProduto(produto);
  });
  ipcMain.handle('produtos:delete', async (event, id) => {
    requireOwnerAccess();
    const ok = await confirmCritical(getSenderWindow(event), {
      buttons: ['Cancelar', 'Desativar produto'],
      title: 'Confirmar desativacao',
      message: 'Deseja desativar este produto? Ele nao sera apagado do banco, mas deixara de aparecer nas vendas.',
    });

    if (!ok) {
      return { deleted: false };
    }

    await deactivateProduto(id);
    return { deleted: true };
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

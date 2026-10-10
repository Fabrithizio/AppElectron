const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const { whatsappEventsSchemaSql } = require('./whatsapp-schema');

const projectRoot = path.resolve(__dirname, '..', '..');
const databasePath = path.join(projectRoot, 'Banco_dados.db');
const db = new sqlite3.Database(databasePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

function nowIsoDateTime() {
  return new Date().toISOString();
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function backupBeforeWhatsAppMigration() {
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) return;
  const health = await get('PRAGMA integrity_check');
  if (!health || health.integrity_check !== 'ok') throw new Error('Banco de dados nao passou na verificacao de integridade; migracao interrompida.');
  const columns = await all('PRAGMA table_info(Clientes)');
  const migration = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'WhatsAppEnvios'");
  const eventColumns = migration ? await all('PRAGMA table_info(WhatsAppEnvios)') : [];
  if (columns.some((column) => column.name === 'data_vencimento')
    && columns.some((column) => column.name === 'whatsapp_opt_in')
    && migration && eventColumns.some((column) => column.name === 'data_vencimento')) return;
  const backupDir = path.join(projectRoot, 'backups', 'schema-migrations');
  await fs.promises.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `before-whatsapp-${stamp}.db`);
  await fs.promises.copyFile(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  const digest = (file) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
  const [sourceHash, backupHash] = await Promise.all([digest(databasePath), digest(backupPath)]);
  if (sourceHash !== backupHash) {
    await fs.promises.rm(backupPath, { force: true });
    throw new Error('Backup da migracao do WhatsApp nao passou na verificacao de integridade.');
  }
}

async function writeAuditLog({
  entidade,
  entidadeId,
  acao,
  motivo,
  usuario,
  dadosAntes,
  dadosDepois,
}) {
  return run(
    `INSERT INTO AuditLog
      (entidade, entidade_id, acao, motivo, usuario, data_evento, dados_antes, dados_depois)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entidade,
      entidadeId || null,
      acao,
      motivo || null,
      usuario || null,
      nowIsoDateTime(),
      dadosAntes ? JSON.stringify(dadosAntes) : null,
      dadosDepois ? JSON.stringify(dadosDepois) : null,
    ],
  );
}

async function initializeDatabase() {
  await backupBeforeWhatsAppMigration();
  await run(`
    CREATE TABLE IF NOT EXISTS Clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      DataNascimento TEXT,
      cpf TEXT,
      rg TEXT,
      endereco TEXT,
      telefone TEXT,
      email TEXT,
      divida REAL DEFAULT 0,
      dataPagamento TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      metodoPagamento TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      dataVenda TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS VendaItens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER,
      nome TEXT NOT NULL,
      quantidade REAL NOT NULL,
      valor_unitario REAL NOT NULL,
      controlar_estoque INTEGER DEFAULT 0,
      FOREIGN KEY (venda_id) REFERENCES vendas(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS Pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_pagador TEXT NOT NULL,
      divida_anterior REAL NOT NULL,
      valor_pago REAL NOT NULL,
      divida_restante REAL NOT NULL,
      data_pagamento TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS Produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      codigo TEXT,
      preco_venda REAL DEFAULT 0,
      preco_custo REAL DEFAULT 0,
      quantidade REAL DEFAULT 0,
      controlar_estoque INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS Despesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data_despesa TEXT NOT NULL,
      categoria TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS AuditLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidade TEXT NOT NULL,
      entidade_id INTEGER,
      acao TEXT NOT NULL,
      motivo TEXT,
      usuario TEXT,
      data_evento TEXT NOT NULL,
      dados_antes TEXT,
      dados_depois TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS CobrancasEnviadasManualmente (
      cliente_id INTEGER NOT NULL,
      mes TEXT NOT NULL,
      enviado_em TEXT NOT NULL,
      usuario TEXT,
      PRIMARY KEY (cliente_id, mes)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS TarefasOperacionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      detalhes TEXT,
      responsavel_username TEXT NOT NULL,
      data_prevista TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_por TEXT,
      criado_em TEXT NOT NULL,
      concluido_por TEXT,
      concluido_em TEXT,
      rotina_id INTEGER
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS RotinasOperacionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      detalhes TEXT,
      responsavel_username TEXT NOT NULL,
      frequencia TEXT NOT NULL,
      proxima_data TEXT NOT NULL,
      ativa INTEGER NOT NULL DEFAULT 1,
      criado_por TEXT,
      criado_em TEXT NOT NULL
    )
  `);
  await ensureColumn('TarefasOperacionais', 'rotina_id', 'INTEGER');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tarefas_rotina_data ON TarefasOperacionais (rotina_id, data_prevista)');

  await run(`
    CREATE TABLE IF NOT EXISTS CaixaFechamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL,
      data_caixa TEXT NOT NULL,
      aberto_em TEXT NOT NULL,
      fechado_em TEXT,
      valor_inicial REAL DEFAULT 0,
      valor_informado REAL,
      total_vendas_pagas REAL DEFAULT 0,
      total_pagamentos REAL DEFAULT 0,
      total_despesas REAL DEFAULT 0,
      total_esperado REAL DEFAULT 0,
      diferenca REAL DEFAULT 0,
      observacao TEXT,
      status TEXT DEFAULT 'aberto'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS FinanceiroContas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      pessoa TEXT,
      categoria TEXT,
      valor REAL NOT NULL,
      vencimento TEXT NOT NULL,
      pago_em TEXT,
      status TEXT DEFAULT 'pendente',
      observacao TEXT,
      usuario TEXT,
      criado_em TEXT NOT NULL,
      cancelado_em TEXT,
      cancelado_motivo TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS StockMovimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      produto_nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      quantidade_anterior REAL NOT NULL,
      quantidade_movimentada REAL NOT NULL,
      quantidade_nova REAL NOT NULL,
      motivo TEXT,
      usuario TEXT,
      criado_em TEXT NOT NULL,
      FOREIGN KEY (produto_id) REFERENCES Produtos(id)
    )
  `);

  await ensureColumn('Clientes', 'ativo', 'INTEGER DEFAULT 1');
  await ensureColumn('Clientes', 'inativado_em', 'TEXT');
  await ensureColumn('Clientes', 'inativado_motivo', 'TEXT');
  await ensureColumn('vendas', 'cancelado', 'INTEGER DEFAULT 0');
  await ensureColumn('vendas', 'cancelado_em', 'TEXT');
  await ensureColumn('vendas', 'cancelado_motivo', 'TEXT');
  await ensureColumn('vendas', 'usuario', 'TEXT');
  await ensureColumn('Pagamentos', 'cancelado', 'INTEGER DEFAULT 0');
  await ensureColumn('Pagamentos', 'cancelado_em', 'TEXT');
  await ensureColumn('Pagamentos', 'cancelado_motivo', 'TEXT');
  await ensureColumn('Pagamentos', 'usuario', 'TEXT');
  await ensureColumn('Despesas', 'cancelado', 'INTEGER DEFAULT 0');
  await ensureColumn('Despesas', 'cancelado_em', 'TEXT');
  await ensureColumn('Despesas', 'cancelado_motivo', 'TEXT');
  await ensureColumn('Despesas', 'usuario', 'TEXT');
  await ensureColumn('Produtos', 'categoria', 'TEXT');
  await ensureColumn('Produtos', 'fornecedor', 'TEXT');
  await ensureColumn('Produtos', 'unidade', 'TEXT DEFAULT "un"');
  await ensureColumn('Produtos', 'estoque_minimo', 'REAL DEFAULT 0');
  await ensureColumn('Produtos', 'localizacao', 'TEXT');
  await ensureColumn('Produtos', 'observacao', 'TEXT');
  await ensureColumn('Clientes', 'data_vencimento', 'TEXT');
  await ensureColumn('Clientes', 'whatsapp_opt_in', 'INTEGER DEFAULT 0');
  await run(whatsappEventsSchemaSql);
  await ensureColumn('WhatsAppEnvios', 'data_vencimento', 'TEXT');
}

function normalizeMoney(value) {
  const number = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function subtractMoney(value, subtractValue) {
  return normalizeMoney(normalizeMoney(value) - normalizeMoney(subtractValue));
}

function validateClientDates(cliente) {
  for (const value of [cliente.data_vencimento, cliente.dataPagamento]) {
    if (!value) continue;
    const parsed = new Date(`${value}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error('Informe uma data válida para o vencimento e o pagamento.');
    }
  }
}

async function insertCliente(cliente, meta = {}) {
  validateClientDates(cliente);
  const result = await run(
    `INSERT INTO Clientes
      (nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento, data_vencimento, whatsapp_opt_in)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cliente.nome,
      cliente.DataNascimento || null,
      cliente.cpf || null,
      cliente.rg || null,
      cliente.endereco || null,
      cliente.telefone || null,
      cliente.email || null,
      normalizeMoney(cliente.divida),
      cliente.dataPagamento || null,
      cliente.data_vencimento || null,
      cliente.whatsapp_opt_in ? 1 : 0,
    ],
  );
  await writeAuditLog({
    entidade: 'Clientes',
    entidadeId: result.id,
    acao: 'CRIAR_CLIENTE',
    usuario: meta.usuario,
    dadosDepois: cliente,
  });
  return result;
}

async function updateCliente(cliente, meta = {}) {
  validateClientDates(cliente);
  const before = await get('SELECT * FROM Clientes WHERE id = ?', [cliente.id]);
  const result = await run(
    `UPDATE Clientes
      SET nome = ?, DataNascimento = ?, cpf = ?, rg = ?, endereco = ?, telefone = ?,
          email = ?, divida = ?, dataPagamento = ?, data_vencimento = ?, whatsapp_opt_in = ?
      WHERE id = ?`,
    [
      cliente.nome,
      cliente.DataNascimento || null,
      cliente.cpf || null,
      cliente.rg || null,
      cliente.endereco || null,
      cliente.telefone || null,
      cliente.email || null,
      normalizeMoney(cliente.divida),
      cliente.dataPagamento || null,
      cliente.data_vencimento || null,
      cliente.whatsapp_opt_in ? 1 : 0,
      cliente.id,
    ],
  );
  if (normalizeMoney(cliente.divida) <= 0) {
    await run(`UPDATE WhatsAppEnvios SET status = 'cancelado', cancelado_em = ?, atualizado_em = ?
      WHERE cliente_id = ? AND status IN ('pendente', 'agendado')`, [nowIsoDateTime(), nowIsoDateTime(), cliente.id]);
  }
  if (!cliente.whatsapp_opt_in) {
    await run(`UPDATE WhatsAppEnvios SET status = 'cancelado', cancelado_em = ?, atualizado_em = ?
      WHERE cliente_id = ? AND status IN ('pendente', 'agendado')`, [nowIsoDateTime(), nowIsoDateTime(), cliente.id]);
  }
  await writeAuditLog({
    entidade: 'Clientes',
    entidadeId: cliente.id,
    acao: 'ALTERAR_CLIENTE',
    usuario: meta.usuario,
    dadosAntes: before,
    dadosDepois: cliente,
  });
  return result;
}

async function listClientes() {
  return all('SELECT * FROM Clientes WHERE COALESCE(ativo, 1) = 1 ORDER BY nome');
}

async function searchClientesByPrefix(nome, limit = 10) {
  return all(
    'SELECT id, nome FROM Clientes WHERE COALESCE(ativo, 1) = 1 AND nome LIKE ? ORDER BY nome LIMIT ?',
    [`${nome}%`, limit],
  );
}

async function getClienteByName(nome) {
  return get('SELECT * FROM Clientes WHERE COALESCE(ativo, 1) = 1 AND nome = ?', [nome]);
}

async function deleteCliente(id, meta = {}) {
  const cliente = await get('SELECT * FROM Clientes WHERE id = ?', [id]);
  if (!cliente || Number(cliente.ativo) === 0) {
    return { deleted: false };
  }

  const result = await run(
    'UPDATE Clientes SET ativo = 0, inativado_em = ?, inativado_motivo = ? WHERE id = ?',
    [nowIsoDateTime(), meta.motivo || 'Inativado pelo usuario', id],
  );
  await run(`UPDATE WhatsAppEnvios SET status = 'cancelado', cancelado_em = ?, atualizado_em = ?
    WHERE cliente_id = ? AND status IN ('pendente', 'agendado')`, [nowIsoDateTime(), nowIsoDateTime(), id]);
  await writeAuditLog({
    entidade: 'Clientes',
    entidadeId: id,
    acao: 'INATIVAR_CLIENTE',
    motivo: meta.motivo,
    usuario: meta.usuario,
    dadosAntes: cliente,
  });
  return { deleted: result.changes > 0 };
}

async function insertVenda(venda, meta = {}) {
  await run('BEGIN TRANSACTION');
  try {
    const result = await run(
      `INSERT INTO vendas (cliente, metodoPagamento, descricao, preco, dataVenda, usuario)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [
        venda.cliente,
        venda.metodoPagamento,
        venda.descricao || '',
        normalizeMoney(venda.preco),
        venda.dataVenda,
        meta.usuario || null,
      ],
    );

    if (Array.isArray(venda.itens)) {
      for (const item of venda.itens) {
        await run(
          `INSERT INTO VendaItens
            (venda_id, produto_id, nome, quantidade, valor_unitario, controlar_estoque)
            VALUES (?, ?, ?, ?, ?, ?)`,
          [
            result.id,
            item.produto_id || null,
            item.nome,
            Number(item.quantidade || 0),
            normalizeMoney(item.valor),
            item.controlar_estoque ? 1 : 0,
          ],
        );

        if (item.produto_id && item.controlar_estoque) {
          const produto = await get('SELECT quantidade, nome FROM Produtos WHERE id = ? AND ativo = 1', [item.produto_id]);
          const nextQuantity = Number(produto ? produto.quantidade : 0) - Number(item.quantidade || 0);
          if (!produto || nextQuantity < 0) {
            throw new Error(`Estoque insuficiente para ${produto ? produto.nome : item.nome}.`);
          }

          await run('UPDATE Produtos SET quantidade = quantidade - ? WHERE id = ?', [
            Number(item.quantidade || 0),
            item.produto_id,
          ]);
        }
      }
    }

    if (venda.metodoPagamento === 'Fiado') {
      await run('UPDATE Clientes SET divida = ROUND(COALESCE(divida, 0) + ?, 2) WHERE nome = ?', [
        normalizeMoney(venda.preco),
        venda.cliente,
      ]);
    }

    await writeAuditLog({
      entidade: 'vendas',
      entidadeId: result.id,
      acao: 'CRIAR_VENDA',
      usuario: meta.usuario,
      dadosDepois: venda,
    });

    await run('COMMIT');
    return result;
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function listVendas() {
  return listVendasFiltered({});
}

async function listVendasByCliente(cliente) {
  return all(
    'SELECT * FROM vendas WHERE COALESCE(cancelado, 0) = 0 AND cliente = ? ORDER BY dataVenda DESC, id DESC',
    [cliente],
  );
}

async function listVendasByDate(date) {
  return all(
    'SELECT * FROM vendas WHERE COALESCE(cancelado, 0) = 0 AND DATE(dataVenda) = ? ORDER BY id DESC',
    [date],
  );
}

async function listVendasFiltered({ dataInicio, dataFim, cliente, limit = 200 }) {
  const filters = ['COALESCE(cancelado, 0) = 0'];
  const params = [];

  if (dataInicio) {
    filters.push('DATE(dataVenda) >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    filters.push('DATE(dataVenda) <= ?');
    params.push(dataFim);
  }
  if (cliente) {
    filters.push('cliente LIKE ?');
    params.push(`%${cliente}%`);
  }

  params.push(Math.min(Number(limit) || 200, 1000));

  return all(
    `SELECT * FROM vendas
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY dataVenda DESC, id DESC
      LIMIT ?`,
    params,
  );
}

async function deleteVendaAndAdjustDebt(id, meta = {}) {
  const venda = await get('SELECT * FROM vendas WHERE id = ?', [id]);
  if (!venda || Number(venda.cancelado) === 1) {
    return { deleted: false };
  }

  await run('BEGIN TRANSACTION');
  try {
    const itens = await all('SELECT * FROM VendaItens WHERE venda_id = ?', [id]);
    for (const item of itens) {
      if (item.produto_id && item.controlar_estoque) {
        await run('UPDATE Produtos SET quantidade = quantidade + ? WHERE id = ?', [
          Number(item.quantidade || 0),
          item.produto_id,
        ]);
      }
    }

    if (venda.metodoPagamento === 'Fiado') {
      await run('UPDATE Clientes SET divida = ROUND(MAX(COALESCE(divida, 0) - ?, 0), 2) WHERE nome = ?', [
        normalizeMoney(venda.preco),
        venda.cliente,
      ]);
      await run(`UPDATE WhatsAppEnvios SET status = 'cancelado', cancelado_em = ?, atualizado_em = ?
        WHERE status IN ('pendente', 'agendado') AND cliente_id = (
          SELECT id FROM Clientes WHERE nome = ? AND COALESCE(divida, 0) <= 0 LIMIT 1
        )`, [nowIsoDateTime(), nowIsoDateTime(), venda.cliente]);
    }

    await run(
      'UPDATE vendas SET cancelado = 1, cancelado_em = ?, cancelado_motivo = ? WHERE id = ?',
      [nowIsoDateTime(), meta.motivo || 'Cancelado pelo usuario', id],
    );
    await writeAuditLog({
      entidade: 'vendas',
      entidadeId: id,
      acao: 'CANCELAR_VENDA',
      motivo: meta.motivo,
      usuario: meta.usuario,
      dadosAntes: { venda, itens },
    });
    await run('COMMIT');
    return { deleted: true };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function registerPayment({ nomePagador, dividaAnterior, valorPagamento }, meta = {}) {
  const valorPago = normalizeMoney(valorPagamento);
  const cliente = await get('SELECT divida FROM Clientes WHERE nome = ?', [nomePagador]);
  const dividaAtual = cliente ? normalizeMoney(cliente.divida) : normalizeMoney(dividaAnterior);
  if (valorPago <= 0 || valorPago > dividaAtual) {
    throw new Error('Valor de pagamento invalido para a divida atual.');
  }
  const dividaRestante = Math.max(subtractMoney(dividaAtual, valorPago), 0);
  const dataPagamento = todayDate();

  await run('BEGIN TRANSACTION');
  try {
    await run('UPDATE Clientes SET divida = ?, dataPagamento = ? WHERE nome = ?', [
      dividaRestante,
      dataPagamento,
      nomePagador,
    ]);
    const result = await run(
      `INSERT INTO Pagamentos
        (nome_pagador, divida_anterior, valor_pago, divida_restante, data_pagamento, usuario)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [nomePagador, dividaAtual, valorPago, dividaRestante, dataPagamento, meta.usuario || null],
    );
    if (dividaRestante <= 0) {
      await run(`UPDATE WhatsAppEnvios SET status = 'cancelado', cancelado_em = ?, atualizado_em = ?
        WHERE cliente_id = (SELECT id FROM Clientes WHERE nome = ?) AND status IN ('pendente', 'agendado')`,
      [nowIsoDateTime(), nowIsoDateTime(), nomePagador]);
    }
    await writeAuditLog({
      entidade: 'Pagamentos',
      entidadeId: result.id,
      acao: 'CRIAR_PAGAMENTO',
      usuario: meta.usuario,
      dadosDepois: { nomePagador, dividaAtual, valorPago, dividaRestante, dataPagamento },
    });
    await run('COMMIT');
    return { id: result.id, dividaRestante, dataPagamento };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function listPagamentos() {
  return listPagamentosFiltered({});
}

async function listPagamentosByCliente(nomePagador) {
  return all(
    'SELECT * FROM Pagamentos WHERE COALESCE(cancelado, 0) = 0 AND nome_pagador = ? ORDER BY data_pagamento DESC, id DESC',
    [nomePagador],
  );
}

async function listPagamentosByDate(date) {
  return all(
    'SELECT * FROM Pagamentos WHERE COALESCE(cancelado, 0) = 0 AND DATE(data_pagamento) = ? ORDER BY id DESC',
    [date],
  );
}

async function listPagamentosByInterval(dataInicio, dataFim) {
  return all(
    `SELECT * FROM Pagamentos
      WHERE COALESCE(cancelado, 0) = 0 AND DATE(data_pagamento) BETWEEN ? AND ?
      ORDER BY data_pagamento DESC, id DESC`,
    [dataInicio, dataFim],
  );
}

async function listPagamentosFiltered({ dataInicio, dataFim, cliente, limit = 200 }) {
  const filters = ['COALESCE(cancelado, 0) = 0'];
  const params = [];

  if (dataInicio) {
    filters.push('DATE(data_pagamento) >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    filters.push('DATE(data_pagamento) <= ?');
    params.push(dataFim);
  }
  if (cliente) {
    filters.push('nome_pagador LIKE ?');
    params.push(`%${cliente}%`);
  }

  params.push(Math.min(Number(limit) || 200, 1000));

  return all(
    `SELECT * FROM Pagamentos
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY data_pagamento DESC, id DESC
      LIMIT ?`,
    params,
  );
}

async function deletePagamentoAndRestoreDebt(id, meta = {}) {
  const pagamento = await get('SELECT * FROM Pagamentos WHERE id = ?', [id]);
  if (!pagamento || Number(pagamento.cancelado) === 1) {
    return { deleted: false };
  }

  await run('BEGIN TRANSACTION');
  try {
    await run('UPDATE Clientes SET divida = ROUND(COALESCE(divida, 0) + ?, 2) WHERE nome = ?', [
      normalizeMoney(pagamento.valor_pago),
      pagamento.nome_pagador,
    ]);
    await run(
      'UPDATE Pagamentos SET cancelado = 1, cancelado_em = ?, cancelado_motivo = ? WHERE id = ?',
      [nowIsoDateTime(), meta.motivo || 'Cancelado pelo usuario', id],
    );
    await writeAuditLog({
      entidade: 'Pagamentos',
      entidadeId: id,
      acao: 'CANCELAR_PAGAMENTO',
      motivo: meta.motivo,
      usuario: meta.usuario,
      dadosAntes: pagamento,
    });
    await run('COMMIT');
    return { deleted: true };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function sumVendas(dataInicio, dataFim) {
  const row = await get(
    'SELECT COALESCE(SUM(preco), 0) AS total FROM vendas WHERE COALESCE(cancelado, 0) = 0 AND DATE(dataVenda) BETWEEN ? AND ?',
    [dataInicio, dataFim],
  );
  return normalizeMoney(row.total);
}

async function sumVendasByPaymentMethod(metodoPagamento, dataInicio, dataFim) {
  const row = await get(
    `SELECT COALESCE(SUM(preco), 0) AS total
      FROM vendas
      WHERE COALESCE(cancelado, 0) = 0 AND metodoPagamento = ? AND DATE(dataVenda) BETWEEN ? AND ?`,
    [metodoPagamento, dataInicio, dataFim],
  );
  return normalizeMoney(row.total);
}

async function sumReceivedSales(dataInicio, dataFim) {
  const row = await get(
    `SELECT COALESCE(SUM(preco), 0) AS total
      FROM vendas
      WHERE COALESCE(cancelado, 0) = 0 AND metodoPagamento != 'Fiado' AND DATE(dataVenda) BETWEEN ? AND ?`,
    [dataInicio, dataFim],
  );
  return normalizeMoney(row.total);
}

async function sumVendasByDate(date) {
  const row = await get(
    'SELECT COALESCE(SUM(preco), 0) AS total FROM vendas WHERE COALESCE(cancelado, 0) = 0 AND DATE(dataVenda) = ?',
    [date],
  );
  return normalizeMoney(row.total);
}

async function countVendasByDate(date) {
  const row = await get(
    'SELECT COUNT(*) AS total FROM vendas WHERE COALESCE(cancelado, 0) = 0 AND DATE(dataVenda) = ?',
    [date],
  );
  return normalizeMoney(row.total);
}

async function countVendasByInterval(dataInicio, dataFim) {
  const row = await get(
    'SELECT COUNT(*) AS total FROM vendas WHERE COALESCE(cancelado, 0) = 0 AND DATE(dataVenda) BETWEEN ? AND ?',
    [dataInicio, dataFim],
  );
  return normalizeMoney(row.total);
}

async function sumOpenDebt() {
  const row = await get('SELECT COALESCE(SUM(divida), 0) AS total FROM Clientes WHERE COALESCE(ativo, 1) = 1');
  return normalizeMoney(row.total);
}

async function countClientesWithDebt() {
  const row = await get(
    'SELECT COUNT(*) AS total FROM Clientes WHERE COALESCE(ativo, 1) = 1 AND COALESCE(divida, 0) > 0',
  );
  return row.total;
}

async function listProdutos() {
  return all('SELECT * FROM Produtos WHERE ativo = 1 ORDER BY nome');
}

async function searchProdutos(term, limit = 10) {
  return all(
    `SELECT * FROM Produtos
      WHERE ativo = 1 AND (nome LIKE ? OR codigo LIKE ?)
      ORDER BY nome
      LIMIT ?`,
    [`${term}%`, `${term}%`, limit],
  );
}

async function getProdutoByCode(codigo) {
  return get('SELECT * FROM Produtos WHERE ativo = 1 AND codigo = ?', [codigo]);
}

async function upsertProduto(produto, meta = {}) {
  const before = produto.id ? await get('SELECT * FROM Produtos WHERE id = ?', [produto.id]) : null;
  const params = [
    produto.nome,
    produto.codigo || null,
    normalizeMoney(produto.preco_venda),
    normalizeMoney(produto.preco_custo),
    Number(produto.quantidade || 0),
    produto.controlar_estoque ? 1 : 0,
    produto.categoria || null,
    produto.fornecedor || null,
    produto.unidade || 'un',
    Number(produto.estoque_minimo || 0),
    produto.localizacao || null,
    produto.observacao || null,
  ];

  if (produto.id) {
    const result = await run(
      `UPDATE Produtos
        SET nome = ?, codigo = ?, preco_venda = ?, preco_custo = ?,
            controlar_estoque = ?, categoria = ?, fornecedor = ?, unidade = ?,
            estoque_minimo = ?, localizacao = ?, observacao = ?
        WHERE id = ?`,
      [
        params[0],
        params[1],
        params[2],
        params[3],
        params[5],
        params[6],
        params[7],
        params[8],
        params[9],
        params[10],
        params[11],
        produto.id,
      ],
    );
    await writeAuditLog({
      entidade: 'Produtos',
      entidadeId: produto.id,
      acao: 'ALTERAR_PRODUTO',
      usuario: meta.usuario,
      dadosAntes: before,
      dadosDepois: { ...produto, quantidade: before ? before.quantidade : produto.quantidade },
    });
    return result;
  }

  const result = await run(
    `INSERT INTO Produtos
      (nome, codigo, preco_venda, preco_custo, quantidade, controlar_estoque,
       categoria, fornecedor, unidade, estoque_minimo, localizacao, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params,
  );
  await writeAuditLog({
    entidade: 'Produtos',
    entidadeId: result.id,
    acao: 'CRIAR_PRODUTO',
    usuario: meta.usuario,
    dadosDepois: produto,
  });
  return result;
}

async function moveProdutoStock({ produtoId, tipo, quantidade, motivo }, meta = {}) {
  const produto = await get('SELECT * FROM Produtos WHERE id = ? AND ativo = 1', [produtoId]);
  if (!produto) {
    throw new Error('Produto nao encontrado.');
  }
  if (Number(produto.controlar_estoque) !== 1) {
    throw new Error('Este produto nao esta com controle de estoque ativo.');
  }

  const currentQuantity = Number(produto.quantidade || 0);
  const movementQuantity = Number(quantidade || 0);
  if (!Number.isFinite(movementQuantity) || movementQuantity < 0) {
    throw new Error('Quantidade invalida.');
  }

  let nextQuantity = currentQuantity;
  if (tipo === 'entrada') {
    nextQuantity = currentQuantity + movementQuantity;
  } else if (tipo === 'saida') {
    nextQuantity = currentQuantity - movementQuantity;
  } else if (tipo === 'ajuste') {
    nextQuantity = movementQuantity;
  } else {
    throw new Error('Tipo de movimentacao invalido.');
  }

  if (nextQuantity < 0) {
    throw new Error('A movimentacao deixaria o estoque negativo.');
  }

  await run('BEGIN TRANSACTION');
  try {
    await run('UPDATE Produtos SET quantidade = ? WHERE id = ?', [nextQuantity, produtoId]);
    const result = await run(
      `INSERT INTO StockMovimentos
        (produto_id, produto_nome, tipo, quantidade_anterior, quantidade_movimentada,
         quantidade_nova, motivo, usuario, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        produtoId,
        produto.nome,
        tipo,
        currentQuantity,
        movementQuantity,
        nextQuantity,
        motivo || null,
        meta.usuario || null,
        nowIsoDateTime(),
      ],
    );
    await writeAuditLog({
      entidade: 'StockMovimentos',
      entidadeId: result.id,
      acao: 'MOVIMENTAR_ESTOQUE',
      motivo,
      usuario: meta.usuario,
      dadosAntes: produto,
      dadosDepois: {
        produtoId,
        produtoNome: produto.nome,
        tipo,
        quantidadeAnterior: currentQuantity,
        quantidadeMovimentada: movementQuantity,
        quantidadeNova: nextQuantity,
      },
    });
    await run('COMMIT');
    return { moved: true, id: result.id, quantidadeNova: nextQuantity };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function listProdutoStockMovements({ produtoId, dataInicio, dataFim, limit = 200 }) {
  const filters = [];
  const params = [];

  if (produtoId) {
    filters.push('produto_id = ?');
    params.push(produtoId);
  }
  if (dataInicio) {
    filters.push('DATE(criado_em) >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    filters.push('DATE(criado_em) <= ?');
    params.push(dataFim);
  }

  params.push(Math.min(Number(limit) || 200, 1000));

  return all(
    `SELECT *
      FROM StockMovimentos
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY criado_em DESC, id DESC
      LIMIT ?`,
    params,
  );
}

async function listLowStockProdutos() {
  return all(
    `SELECT * FROM Produtos
      WHERE ativo = 1
        AND controlar_estoque = 1
        AND quantidade <= COALESCE(estoque_minimo, 0)
      ORDER BY quantidade ASC, nome`,
  );
}

async function deactivateProduto(id, meta = {}) {
  const produto = await get('SELECT * FROM Produtos WHERE id = ?', [id]);
  if (!produto || Number(produto.ativo) === 0) {
    return { deleted: false };
  }

  const result = await run('UPDATE Produtos SET ativo = 0 WHERE id = ?', [id]);
  await writeAuditLog({
    entidade: 'Produtos',
    entidadeId: id,
    acao: 'DESATIVAR_PRODUTO',
    motivo: meta.motivo,
    usuario: meta.usuario,
    dadosAntes: produto,
  });

  return { deleted: result.changes > 0 };
}

async function insertDespesa(despesa, meta = {}) {
  await run('BEGIN TRANSACTION');
  try {
    const result = await run(
      `INSERT INTO Despesas (descricao, valor, data_despesa, categoria)
        VALUES (?, ?, ?, ?)`,
      [
        despesa.descricao,
        normalizeMoney(despesa.valor),
        despesa.data_despesa,
        despesa.categoria || null,
      ],
    );
    await run('UPDATE Despesas SET usuario = ? WHERE id = ?', [meta.usuario || null, result.id]);
    await writeAuditLog({
      entidade: 'Despesas',
      entidadeId: result.id,
      acao: 'CRIAR_DESPESA',
      usuario: meta.usuario,
      dadosDepois: despesa,
    });
    await run('COMMIT');
    return result;
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function listDespesasByInterval(dataInicio, dataFim) {
  return all(
    `SELECT * FROM Despesas
      WHERE COALESCE(cancelado, 0) = 0 AND DATE(data_despesa) BETWEEN ? AND ?
      ORDER BY data_despesa DESC, id DESC`,
    [dataInicio, dataFim],
  );
}

async function deleteDespesa(id, meta = {}) {
  const despesa = await get('SELECT * FROM Despesas WHERE id = ?', [id]);
  if (!despesa || Number(despesa.cancelado) === 1) {
    return { deleted: false };
  }

  await run('BEGIN TRANSACTION');
  try {
    await run(
      'UPDATE Despesas SET cancelado = 1, cancelado_em = ?, cancelado_motivo = ? WHERE id = ?',
      [nowIsoDateTime(), meta.motivo || 'Cancelado pelo usuario', id],
    );
    await writeAuditLog({
      entidade: 'Despesas',
      entidadeId: id,
      acao: 'CANCELAR_DESPESA',
      motivo: meta.motivo,
      usuario: meta.usuario,
      dadosAntes: despesa,
    });
    await run('COMMIT');
    return { deleted: true };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function sumDespesas(dataInicio, dataFim) {
  const row = await get(
    'SELECT COALESCE(SUM(valor), 0) AS total FROM Despesas WHERE COALESCE(cancelado, 0) = 0 AND DATE(data_despesa) BETWEEN ? AND ?',
    [dataInicio, dataFim],
  );
  return row.total;
}

async function listBirthdayClientes(monthDay) {
  return all(
    "SELECT * FROM Clientes WHERE COALESCE(ativo, 1) = 1 AND strftime('%m-%d', DataNascimento) = ?",
    [monthDay],
  );
}

async function listManualCollectionSent(month) {
  return all(
    'SELECT cliente_id, enviado_em, usuario FROM CobrancasEnviadasManualmente WHERE mes = ?',
    [month],
  );
}

async function getManualCollectionSent(clienteId, month) {
  return get(
    'SELECT cliente_id, enviado_em, usuario FROM CobrancasEnviadasManualmente WHERE cliente_id = ? AND mes = ?',
    [clienteId, month],
  );
}

async function markManualCollectionSent(clienteId, month, usuario, enviadoEm) {
  const client = await get('SELECT id FROM Clientes WHERE id = ?', [clienteId]);
  if (!client) throw new Error('Cliente não encontrado.');
  await run(
    `INSERT OR REPLACE INTO CobrancasEnviadasManualmente (cliente_id, mes, enviado_em, usuario)
      VALUES (?, ?, ?, ?)`,
    [clienteId, month, enviadoEm, usuario || null],
  );
  return getManualCollectionSent(clienteId, month);
}

async function unmarkManualCollectionSent(clienteId, month) {
  return run(
    'DELETE FROM CobrancasEnviadasManualmente WHERE cliente_id = ? AND mes = ?',
    [clienteId, month],
  );
}

function addDaysToDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextRoutineDate(frequency, dateString) {
  let nextDate = addDaysToDate(dateString, frequency === 'weekly' ? 7 : 1);
  if (frequency === 'weekdays') {
    while ([0, 6].includes(new Date(`${nextDate}T00:00:00.000Z`).getUTCDay())) {
      nextDate = addDaysToDate(nextDate, 1);
    }
  }
  return nextDate;
}

function firstRoutineDateOnOrAfter(frequency, dateString) {
  let nextDate = dateString;
  if (frequency === 'weekdays') {
    while ([0, 6].includes(new Date(`${nextDate}T00:00:00.000Z`).getUTCDay())) {
      nextDate = addDaysToDate(nextDate, 1);
    }
  }
  return nextDate;
}

async function listOperationalTasks({ responsavelUsername, includeAll = false, today }) {
  const throughDate = addDaysToDate(today, 7);
  const routines = await all('SELECT * FROM RotinasOperacionais WHERE ativa = 1');
  for (const routine of routines) {
    let nextDate = routine.proxima_data;
    if (nextDate < today) nextDate = firstRoutineDateOnOrAfter(routine.frequencia, today);
    while (nextDate <= throughDate) {
      await createOperationalTask({
        titulo: routine.titulo,
        detalhes: routine.detalhes,
        responsavelUsername: routine.responsavel_username,
        dataPrevista: nextDate,
        criadoPor: routine.criado_por,
        rotinaId: routine.id,
      });
      nextDate = nextRoutineDate(routine.frequencia, nextDate);
    }
    if (nextDate !== routine.proxima_data) {
      await run('UPDATE RotinasOperacionais SET proxima_data = ? WHERE id = ?', [nextDate, routine.id]);
    }
  }

  const scope = includeAll ? '' : ' AND t.responsavel_username = ?';
  const params = includeAll ? [] : [responsavelUsername];
  return all(
    `SELECT t.*, r.frequencia AS rotina_frequencia, r.ativa AS rotina_ativa
       FROM TarefasOperacionais t
       LEFT JOIN RotinasOperacionais r ON r.id = t.rotina_id
      WHERE (t.status = 'pendente' OR t.concluido_em IS NOT NULL)
        ${scope}
      ORDER BY CASE t.status WHEN 'pendente' THEN 0 ELSE 1 END, t.data_prevista, t.id`,
    params,
  );
}

async function getOperationalTask(id) {
  return get('SELECT * FROM TarefasOperacionais WHERE id = ?', [id]);
}

async function createOperationalTask({ titulo, detalhes, responsavelUsername, dataPrevista, criadoPor, rotinaId = null }) {
  if (rotinaId) {
    const existing = await get(
      'SELECT * FROM TarefasOperacionais WHERE rotina_id = ? AND data_prevista = ?',
      [rotinaId, dataPrevista],
    );
    if (existing) return existing;
  }
  const result = await run(
    `INSERT INTO TarefasOperacionais
      (titulo, detalhes, responsavel_username, data_prevista, status, criado_por, criado_em, rotina_id)
      VALUES (?, ?, ?, ?, 'pendente', ?, ?, ?)`,
    [titulo, detalhes || null, responsavelUsername, dataPrevista, criadoPor || null, nowIsoDateTime(), rotinaId],
  );
  const task = await getOperationalTask(result.id);
  await writeAuditLog({
    entidade: 'TarefasOperacionais',
    entidadeId: task.id,
    acao: 'CRIAR_TAREFA',
    usuario: criadoPor,
    dadosDepois: task,
  });
  return task;
}

async function createOperationalRoutine({ titulo, detalhes, responsavelUsername, dataInicio, frequencia, criadoPor }) {
  const nextDate = firstRoutineDateOnOrAfter(frequencia, dataInicio);
  const result = await run(
    `INSERT INTO RotinasOperacionais
      (titulo, detalhes, responsavel_username, frequencia, proxima_data, ativa, criado_por, criado_em)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [titulo, detalhes || null, responsavelUsername, frequencia, nextDate, criadoPor || null, nowIsoDateTime()],
  );
  const routine = await get('SELECT * FROM RotinasOperacionais WHERE id = ?', [result.id]);
  await writeAuditLog({
    entidade: 'RotinasOperacionais',
    entidadeId: routine.id,
    acao: 'CRIAR_ROTINA_TAREFA',
    usuario: criadoPor,
    dadosDepois: routine,
  });
  await createOperationalTask({
    titulo,
    detalhes,
    responsavelUsername,
    dataPrevista: nextDate,
    criadoPor,
    rotinaId: routine.id,
  });
  await run('UPDATE RotinasOperacionais SET proxima_data = ? WHERE id = ?', [
    nextRoutineDate(frequencia, nextDate),
    routine.id,
  ]);
  return routine;
}

async function pauseOperationalRoutine(id, usuario, today) {
  const routine = await get('SELECT * FROM RotinasOperacionais WHERE id = ?', [id]);
  if (!routine || !routine.ativa) return { paused: false };
  await run('UPDATE RotinasOperacionais SET ativa = 0 WHERE id = ?', [id]);
  await run(
    "DELETE FROM TarefasOperacionais WHERE rotina_id = ? AND status = 'pendente' AND data_prevista > ?",
    [id, today],
  );
  const updated = await get('SELECT * FROM RotinasOperacionais WHERE id = ?', [id]);
  await writeAuditLog({
    entidade: 'RotinasOperacionais',
    entidadeId: id,
    acao: 'PAUSAR_ROTINA_TAREFA',
    usuario,
    dadosAntes: routine,
    dadosDepois: updated,
  });
  return { paused: true, routine: updated };
}

async function completeOperationalTask(id, usuario, completedDate) {
  const task = await getOperationalTask(id);
  if (!task || task.status !== 'pendente') return { completed: false };
  await run(
    "UPDATE TarefasOperacionais SET status = 'concluida', concluido_por = ?, concluido_em = ? WHERE id = ? AND status = 'pendente'",
    [usuario, completedDate, id],
  );
  const updated = await getOperationalTask(id);
  await writeAuditLog({
    entidade: 'TarefasOperacionais',
    entidadeId: id,
    acao: 'CONCLUIR_TAREFA',
    usuario,
    dadosAntes: task,
    dadosDepois: updated,
  });
  return { completed: true, task: updated };
}

async function reopenOperationalTask(id, usuario) {
  const task = await getOperationalTask(id);
  if (!task || task.status !== 'concluida') return { reopened: false };
  await run(
    "UPDATE TarefasOperacionais SET status = 'pendente', concluido_por = NULL, concluido_em = NULL WHERE id = ? AND status = 'concluida'",
    [id],
  );
  const updated = await getOperationalTask(id);
  await writeAuditLog({
    entidade: 'TarefasOperacionais',
    entidadeId: id,
    acao: 'REABRIR_TAREFA',
    usuario,
    dadosAntes: task,
    dadosDepois: updated,
  });
  return { reopened: true, task: updated };
}

async function listClientesWithPaymentStatus() {
  return all(`
    SELECT c.id, c.nome, c.telefone, c.divida, c.dataPagamento, c.data_vencimento, c.whatsapp_opt_in,
      COALESCE(MAX(p.data_pagamento), NULL) AS ultima_data_pagamento,
      COALESCE(MAX(CASE WHEN v.metodoPagamento = 'Fiado' THEN v.dataVenda END), NULL) AS ultima_compra_fiado
    FROM Clientes c
    LEFT JOIN Pagamentos p ON c.nome = p.nome_pagador AND COALESCE(p.cancelado, 0) = 0
    LEFT JOIN vendas v ON c.nome = v.cliente AND COALESCE(v.cancelado, 0) = 0
    WHERE COALESCE(c.ativo, 1) = 1
    GROUP BY c.id
    ORDER BY c.nome
  `);
}

async function listWhatsAppDashboard() {
  return all(`SELECT c.id, c.nome, c.telefone, c.divida, c.data_vencimento, c.whatsapp_opt_in, c.ativo,
      e.tipo, e.data_prevista, e.tentativa_em, e.status AS envio_status,
      e.api_message_id, e.tentativas, e.erro, e.entregue_em, e.cancelado_em
    FROM Clientes c LEFT JOIN WhatsAppEnvios e ON e.cliente_id = c.id
    WHERE COALESCE(c.ativo, 1) = 1 AND COALESCE(c.divida, 0) > 0
    ORDER BY c.nome, e.criado_em DESC`);
}

async function createWhatsAppEvent(clienteId, tipo, dataPrevista, dataVencimento) {
  const now = nowIsoDateTime();
  return run(`INSERT OR IGNORE INTO WhatsAppEnvios
    (cliente_id, tipo, data_prevista, data_vencimento, status, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, 'pendente', ?, ?)`, [clienteId, tipo, dataPrevista, dataVencimento || null, now, now]);
}

async function getWhatsAppEvent(clienteId, tipo, dataPrevista) {
  return get('SELECT * FROM WhatsAppEnvios WHERE cliente_id = ? AND tipo = ? AND data_prevista = ?',
    [clienteId, tipo, dataPrevista]);
}

async function countWhatsAppAttemptsToday(today) {
  const row = await get("SELECT COUNT(*) AS total FROM WhatsAppEnvios WHERE DATE(tentativa_em, 'localtime') = ?", [today]);
  return Number(row.total || 0);
}

async function beginWhatsAppAttempt({ clienteId, tipo, dataPrevista, dataVencimento }) {
  const now = nowIsoDateTime();
  await run(`INSERT OR IGNORE INTO WhatsAppEnvios
    (cliente_id, tipo, data_prevista, data_vencimento, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)`,
  [clienteId, tipo, dataPrevista, dataVencimento || null, now, now]);
  const event = await get('SELECT id, tentativas FROM WhatsAppEnvios WHERE cliente_id = ? AND tipo = ? AND data_prevista = ?',
    [clienteId, tipo, dataPrevista]);
  await run(`UPDATE WhatsAppEnvios SET tentativa_em = ?, status = ?, api_message_id = ?,
    tentativas = tentativas + 1, erro = NULL, atualizado_em = ? WHERE id = ?`,
  [now, 'enviando', null, now, event.id]);
  return event.id;
}

async function finishWhatsAppAttempt({ clienteId, tipo, dataPrevista, status, messageId, error }) {
  const now = nowIsoDateTime();
  return run(`UPDATE WhatsAppEnvios SET status = ?, api_message_id = ?, erro = ?, atualizado_em = ?
    WHERE cliente_id = ? AND tipo = ? AND data_prevista = ?`,
  [status, messageId || null, error || null, now, clienteId, tipo, dataPrevista]);
}

async function listWhatsAppHistory(limit = 200) {
  return all(`SELECT e.*, COALESCE(c.nome, CASE WHEN e.cliente_id = 0 THEN 'Teste autorizado' END) AS nome FROM WhatsAppEnvios e
    LEFT JOIN Clientes c ON c.id = e.cliente_id ORDER BY e.criado_em DESC LIMIT ?`, [limit]);
}

async function listAuditLog({ dataInicio, dataFim, usuario, acao, entidade, limit = 200 }) {
  const filters = [];
  const params = [];

  if (dataInicio) {
    filters.push('DATE(data_evento) >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    filters.push('DATE(data_evento) <= ?');
    params.push(dataFim);
  }
  if (usuario) {
    filters.push('usuario LIKE ?');
    params.push(`%${usuario}%`);
  }
  if (acao) {
    filters.push('acao LIKE ?');
    params.push(`%${acao}%`);
  }
  if (entidade) {
    filters.push('entidade = ?');
    params.push(entidade);
  }

  params.push(Math.min(Number(limit) || 200, 1000));

  return all(
    `SELECT id, entidade, entidade_id, acao, motivo, usuario, data_evento, dados_antes, dados_depois
      FROM AuditLog
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY data_evento DESC, id DESC
      LIMIT ?`,
    params,
  );
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

async function getCashTotals(usuario, dataCaixa) {
  const [vendasRow, pagamentosRow, despesasRow] = await Promise.all([
    get(
      `SELECT COALESCE(SUM(preco), 0) AS total
        FROM vendas
        WHERE usuario = ?
          AND DATE(dataVenda) = ?
          AND metodoPagamento != 'Fiado'
          AND COALESCE(cancelado, 0) = 0`,
      [usuario, dataCaixa],
    ),
    get(
      `SELECT COALESCE(SUM(valor_pago), 0) AS total
        FROM Pagamentos
        WHERE usuario = ? AND DATE(data_pagamento) = ? AND COALESCE(cancelado, 0) = 0`,
      [usuario, dataCaixa],
    ),
    get(
      `SELECT COALESCE(SUM(valor), 0) AS total
        FROM Despesas
        WHERE usuario = ? AND DATE(data_despesa) = ? AND COALESCE(cancelado, 0) = 0`,
      [usuario, dataCaixa],
    ),
  ]);

  return {
    totalVendasPagas: normalizeMoney(vendasRow.total),
    totalPagamentos: normalizeMoney(pagamentosRow.total),
    totalDespesas: normalizeMoney(despesasRow.total),
  };
}

async function getOpenCashSession(usuario) {
  return get(
    `SELECT *
      FROM CaixaFechamentos
      WHERE usuario = ? AND status = 'aberto'
      ORDER BY id DESC
      LIMIT 1`,
    [usuario],
  );
}

async function openCashSession({ usuario, valorInicial }) {
  const current = await getOpenCashSession(usuario);
  if (current) {
    throw new Error('Este usuario ja possui um caixa aberto.');
  }

  const dataCaixa = todayDate();
  const initialValue = normalizeMoney(valorInicial);
  const result = await run(
    `INSERT INTO CaixaFechamentos (usuario, data_caixa, aberto_em, valor_inicial, status)
      VALUES (?, ?, ?, ?, 'aberto')`,
    [usuario, dataCaixa, nowIsoDateTime(), initialValue],
  );

  await writeAuditLog({
    entidade: 'CaixaFechamentos',
    entidadeId: result.id,
    acao: 'ABRIR_CAIXA',
    usuario,
    dadosDepois: { usuario, dataCaixa, valorInicial: initialValue },
  });

  return { id: result.id, usuario, data_caixa: dataCaixa, valor_inicial: initialValue, status: 'aberto' };
}

async function closeCashSession(id, { usuario, valorInformado, observacao }) {
  const session = await get('SELECT * FROM CaixaFechamentos WHERE id = ?', [id]);
  if (!session || session.status !== 'aberto') {
    return { closed: false };
  }
  if (session.usuario !== usuario) {
    throw new Error('Este caixa pertence a outro usuario.');
  }

  const totals = await getCashTotals(session.usuario, session.data_caixa);
  const valorInicial = normalizeMoney(session.valor_inicial);
  const counted = normalizeMoney(valorInformado);
  const expected = normalizeMoney(
    valorInicial + totals.totalVendasPagas + totals.totalPagamentos - totals.totalDespesas,
  );
  const difference = normalizeMoney(counted - expected);

  await run(
    `UPDATE CaixaFechamentos
      SET fechado_em = ?,
          valor_informado = ?,
          total_vendas_pagas = ?,
          total_pagamentos = ?,
          total_despesas = ?,
          total_esperado = ?,
          diferenca = ?,
          observacao = ?,
          status = 'fechado'
      WHERE id = ?`,
    [
      nowIsoDateTime(),
      counted,
      totals.totalVendasPagas,
      totals.totalPagamentos,
      totals.totalDespesas,
      expected,
      difference,
      observacao || null,
      id,
    ],
  );

  await writeAuditLog({
    entidade: 'CaixaFechamentos',
    entidadeId: id,
    acao: 'FECHAR_CAIXA',
    usuario,
    dadosAntes: session,
    dadosDepois: { ...totals, valorInformado: counted, totalEsperado: expected, diferenca: difference },
  });

  return {
    closed: true,
    id,
    ...totals,
    valorInicial,
    valorInformado: counted,
    totalEsperado: expected,
    diferenca: difference,
  };
}

async function listCashSessions({ dataInicio, dataFim, usuario, limit = 200 }) {
  const filters = [];
  const params = [];

  if (dataInicio) {
    filters.push('DATE(data_caixa) >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    filters.push('DATE(data_caixa) <= ?');
    params.push(dataFim);
  }
  if (usuario) {
    filters.push('usuario LIKE ?');
    params.push(`%${usuario}%`);
  }

  params.push(Math.min(Number(limit) || 200, 1000));

  return all(
    `SELECT *
      FROM CaixaFechamentos
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY data_caixa DESC, id DESC
      LIMIT ?`,
    params,
  );
}

async function createFinancialAccount(conta, meta = {}) {
  const tipo = conta.tipo === 'receber' ? 'receber' : 'pagar';
  const result = await run(
    `INSERT INTO FinanceiroContas
      (tipo, descricao, pessoa, categoria, valor, vencimento, observacao, usuario, criado_em, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
    [
      tipo,
      conta.descricao,
      conta.pessoa || null,
      conta.categoria || null,
      normalizeMoney(conta.valor),
      conta.vencimento,
      conta.observacao || null,
      meta.usuario || null,
      nowIsoDateTime(),
    ],
  );

  await writeAuditLog({
    entidade: 'FinanceiroContas',
    entidadeId: result.id,
    acao: tipo === 'pagar' ? 'CRIAR_CONTA_PAGAR' : 'CRIAR_CONTA_RECEBER',
    usuario: meta.usuario,
    dadosDepois: conta,
  });

  return result;
}

async function listFinancialAccounts({ tipo, status, dataInicio, dataFim, limit = 300 }) {
  const filters = [];
  const params = [];

  if (tipo) {
    filters.push('tipo = ?');
    params.push(tipo);
  }
  if (status) {
    filters.push('status = ?');
    params.push(status);
  }
  if (dataInicio) {
    filters.push('DATE(vencimento) >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    filters.push('DATE(vencimento) <= ?');
    params.push(dataFim);
  }

  params.push(Math.min(Number(limit) || 300, 1000));

  return all(
    `SELECT *
      FROM FinanceiroContas
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY
        CASE status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END,
        vencimento ASC,
        id DESC
      LIMIT ?`,
    params,
  );
}

async function getDatabaseHealth() {
  const integrity = await get('PRAGMA integrity_check');
  const [clientes, vendas, pagamentos, produtos, auditoria] = await Promise.all([
    get('SELECT COUNT(*) AS total FROM Clientes'),
    get('SELECT COUNT(*) AS total FROM vendas'),
    get('SELECT COUNT(*) AS total FROM Pagamentos'),
    get('SELECT COUNT(*) AS total FROM Produtos'),
    get('SELECT COUNT(*) AS total FROM AuditLog'),
  ]);

  return {
    databasePath,
    integrity: integrity ? Object.values(integrity)[0] : 'sem resposta',
    counts: {
      clientes: clientes.total,
      vendas: vendas.total,
      pagamentos: pagamentos.total,
      produtos: produtos.total,
      auditoria: auditoria.total,
    },
  };
}

async function markFinancialAccountPaid(id, meta = {}) {
  const conta = await get('SELECT * FROM FinanceiroContas WHERE id = ?', [id]);
  if (!conta || conta.status !== 'pendente') {
    return { paid: false };
  }

  await run(
    "UPDATE FinanceiroContas SET status = 'pago', pago_em = ? WHERE id = ?",
    [todayDate(), id],
  );
  await writeAuditLog({
    entidade: 'FinanceiroContas',
    entidadeId: id,
    acao: conta.tipo === 'pagar' ? 'PAGAR_CONTA' : 'RECEBER_CONTA',
    usuario: meta.usuario,
    dadosAntes: conta,
    dadosDepois: { pagoEm: todayDate() },
  });

  return { paid: true };
}

async function cancelFinancialAccount(id, meta = {}) {
  const conta = await get('SELECT * FROM FinanceiroContas WHERE id = ?', [id]);
  if (!conta || conta.status === 'cancelado') {
    return { cancelled: false };
  }

  await run(
    "UPDATE FinanceiroContas SET status = 'cancelado', cancelado_em = ?, cancelado_motivo = ? WHERE id = ?",
    [nowIsoDateTime(), meta.motivo || 'Cancelado pelo usuario', id],
  );
  await writeAuditLog({
    entidade: 'FinanceiroContas',
    entidadeId: id,
    acao: 'CANCELAR_CONTA',
    motivo: meta.motivo,
    usuario: meta.usuario,
    dadosAntes: conta,
  });

  return { cancelled: true };
}

module.exports = {
  databasePath,
  db,
  initializeDatabase,
  writeAuditLog,
  insertCliente,
  updateCliente,
  listClientes,
  searchClientesByPrefix,
  getClienteByName,
  deleteCliente,
  insertVenda,
  listVendas,
  listVendasByCliente,
  listVendasByDate,
  listVendasFiltered,
  deleteVendaAndAdjustDebt,
  registerPayment,
  listPagamentos,
  listPagamentosByCliente,
  listPagamentosByDate,
  listPagamentosByInterval,
  listPagamentosFiltered,
  deletePagamentoAndRestoreDebt,
  sumVendas,
  sumVendasByPaymentMethod,
  sumReceivedSales,
  sumVendasByDate,
  countVendasByDate,
  countVendasByInterval,
  sumOpenDebt,
  countClientesWithDebt,
  listProdutos,
  searchProdutos,
  getProdutoByCode,
  upsertProduto,
  moveProdutoStock,
  listProdutoStockMovements,
  listLowStockProdutos,
  deactivateProduto,
  insertDespesa,
  listDespesasByInterval,
  deleteDespesa,
  sumDespesas,
  listBirthdayClientes,
  listManualCollectionSent,
  getManualCollectionSent,
  markManualCollectionSent,
  unmarkManualCollectionSent,
  listOperationalTasks,
  getOperationalTask,
  createOperationalTask,
  createOperationalRoutine,
  pauseOperationalRoutine,
  completeOperationalTask,
  reopenOperationalTask,
  listClientesWithPaymentStatus,
  listWhatsAppDashboard,
  createWhatsAppEvent,
  getWhatsAppEvent,
  countWhatsAppAttemptsToday,
  beginWhatsAppAttempt,
  finishWhatsAppAttempt,
  listWhatsAppHistory,
  listAuditLog,
  getCashTotals,
  getOpenCashSession,
  openCashSession,
  closeCashSession,
  listCashSessions,
  createFinancialAccount,
  listFinancialAccounts,
  markFinancialAccountPaid,
  cancelFinancialAccount,
  getDatabaseHealth,
};

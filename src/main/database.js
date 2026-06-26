const path = require('path');
const sqlite3 = require('sqlite3').verbose();

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
}

function normalizeMoney(value) {
  const number = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function subtractMoney(value, subtractValue) {
  return normalizeMoney(normalizeMoney(value) - normalizeMoney(subtractValue));
}

async function insertCliente(cliente) {
  const result = await run(
    `INSERT INTO Clientes
      (nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );
  await writeAuditLog({
    entidade: 'Clientes',
    entidadeId: result.id,
    acao: 'CRIAR_CLIENTE',
    dadosDepois: cliente,
  });
  return result;
}

async function updateCliente(cliente) {
  const before = await get('SELECT * FROM Clientes WHERE id = ?', [cliente.id]);
  const result = await run(
    `UPDATE Clientes
      SET nome = ?, DataNascimento = ?, cpf = ?, rg = ?, endereco = ?, telefone = ?,
          email = ?, divida = ?, dataPagamento = ?
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
      cliente.id,
    ],
  );
  await writeAuditLog({
    entidade: 'Clientes',
    entidadeId: cliente.id,
    acao: 'ALTERAR_CLIENTE',
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
  const dataPagamento = new Date().toISOString().split('T')[0];

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

async function upsertProduto(produto) {
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
    return run(
      `UPDATE Produtos
        SET nome = ?, codigo = ?, preco_venda = ?, preco_custo = ?, quantidade = ?,
            controlar_estoque = ?, categoria = ?, fornecedor = ?, unidade = ?,
            estoque_minimo = ?, localizacao = ?, observacao = ?
        WHERE id = ?`,
      [...params, produto.id],
    );
  }

  return run(
    `INSERT INTO Produtos
      (nome, codigo, preco_venda, preco_custo, quantidade, controlar_estoque,
       categoria, fornecedor, unidade, estoque_minimo, localizacao, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

async function deactivateProduto(id) {
  return run('UPDATE Produtos SET ativo = 0 WHERE id = ?', [id]);
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

async function listClientesWithPaymentStatus() {
  return all(`
    SELECT c.nome, c.divida,
      COALESCE(MAX(p.data_pagamento), NULL) AS ultima_data_pagamento,
      COALESCE(MAX(v.dataVenda), NULL) AS ultima_data_compra
    FROM Clientes c
    LEFT JOIN Pagamentos p ON c.nome = p.nome_pagador AND COALESCE(p.cancelado, 0) = 0
    LEFT JOIN vendas v ON c.nome = v.cliente AND COALESCE(v.cancelado, 0) = 0
    WHERE COALESCE(c.ativo, 1) = 1
    GROUP BY c.nome
    ORDER BY c.nome
  `);
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

module.exports = {
  databasePath,
  db,
  initializeDatabase,
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
  listLowStockProdutos,
  deactivateProduto,
  insertDespesa,
  listDespesasByInterval,
  deleteDespesa,
  sumDespesas,
  listBirthdayClientes,
  listClientesWithPaymentStatus,
  listAuditLog,
};

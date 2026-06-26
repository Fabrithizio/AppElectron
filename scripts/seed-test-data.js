const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.join(__dirname, '..');
const databasePath = path.join(root, 'Banco_dados.db');
const backupsDir = path.join(root, 'backups');
const backupPath = path.join(backupsDir, `Banco_dados.before-seed-${Date.now()}.db`);
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

function closeDb() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function createTables() {
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
      controlar_estoque INTEGER DEFAULT 0
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
}

async function clearOldTestData() {
  await run("DELETE FROM Pagamentos WHERE nome_pagador LIKE 'TESTE - %'");
  await run("DELETE FROM VendaItens WHERE venda_id IN (SELECT id FROM vendas WHERE cliente LIKE 'TESTE - %')");
  await run("DELETE FROM vendas WHERE cliente LIKE 'TESTE - %'");
  await run("DELETE FROM Clientes WHERE nome LIKE 'TESTE - %'");
  await run("DELETE FROM Produtos WHERE nome LIKE 'TESTE - %'");
  await run("DELETE FROM Despesas WHERE descricao LIKE 'TESTE - %'");
}

async function insertCliente(cliente) {
  await run(
    `INSERT INTO Clientes
      (nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cliente.nome,
      cliente.DataNascimento,
      cliente.cpf,
      cliente.rg,
      cliente.endereco,
      cliente.telefone,
      cliente.email,
      cliente.divida,
      cliente.dataPagamento,
    ],
  );
}

async function insertVenda(venda) {
  await run(
    `INSERT INTO vendas (cliente, metodoPagamento, descricao, preco, dataVenda)
      VALUES (?, ?, ?, ?, ?)`,
    [venda.cliente, venda.metodoPagamento, venda.descricao, venda.preco, venda.dataVenda],
  );
}

async function insertPagamento(pagamento) {
  await run(
    `INSERT INTO Pagamentos
      (nome_pagador, divida_anterior, valor_pago, divida_restante, data_pagamento)
      VALUES (?, ?, ?, ?, ?)`,
    [
      pagamento.nome_pagador,
      pagamento.divida_anterior,
      pagamento.valor_pago,
      pagamento.divida_restante,
      pagamento.data_pagamento,
    ],
  );
}

async function insertProduto(produto) {
  await run(
    `INSERT INTO Produtos (nome, codigo, preco_venda, preco_custo, quantidade, controlar_estoque)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      produto.nome,
      produto.codigo,
      produto.preco_venda,
      produto.preco_custo,
      produto.quantidade,
      produto.controlar_estoque ? 1 : 0,
    ],
  );
}

async function insertDespesa(despesa) {
  await run(
    `INSERT INTO Despesas (descricao, valor, data_despesa, categoria)
      VALUES (?, ?, ?, ?)`,
    [despesa.descricao, despesa.valor, despesa.data_despesa, despesa.categoria],
  );
}

async function seed() {
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.copyFileSync(databasePath, backupPath);

  await createTables();
  await run('BEGIN TRANSACTION');

  try {
    await clearOldTestData();

    const clientes = [
      {
        nome: 'TESTE - Ana Silva',
        DataNascimento: '1992-06-24',
        cpf: '111.111.111-11',
        rg: '11.111.111-1',
        endereco: 'Rua das Flores, 100',
        telefone: '(85) 99999-1111',
        email: 'ana.teste@example.com',
        divida: 65,
        dataPagamento: '2026-06-10',
      },
      {
        nome: 'TESTE - Bruno Costa',
        DataNascimento: '1988-01-15',
        cpf: '222.222.222-22',
        rg: '22.222.222-2',
        endereco: 'Av. Central, 220',
        telefone: '(85) 99999-2222',
        email: 'bruno.teste@example.com',
        divida: 0,
        dataPagamento: '2026-06-22',
      },
      {
        nome: 'TESTE - Carla Menezes',
        DataNascimento: '1995-09-03',
        cpf: '333.333.333-33',
        rg: '33.333.333-3',
        endereco: 'Rua Norte, 33',
        telefone: '(85) 99999-3333',
        email: 'carla.teste@example.com',
        divida: 180,
        dataPagamento: '2026-05-01',
      },
      {
        nome: 'TESTE - Diego Lima',
        DataNascimento: '1979-12-20',
        cpf: '444.444.444-44',
        rg: '44.444.444-4',
        endereco: 'Rua Sul, 44',
        telefone: '(85) 99999-4444',
        email: 'diego.teste@example.com',
        divida: 0,
        dataPagamento: null,
      },
    ];

    const vendas = [
      {
        cliente: 'TESTE - Ana Silva',
        metodoPagamento: 'Fiado',
        descricao: 'Item: Blusa preta / Quant: 1 / Valor: R$ 85.00\nItem: Cinto / Quant: 1 / Valor: R$ 20.00',
        preco: 105,
        dataVenda: '2026-06-10',
      },
      {
        cliente: 'TESTE - Bruno Costa',
        metodoPagamento: 'Pix',
        descricao: 'Item: Calca jeans / Quant: 1 / Valor: R$ 120.00',
        preco: 120,
        dataVenda: '2026-06-12',
      },
      {
        cliente: 'TESTE - Carla Menezes',
        metodoPagamento: 'Fiado',
        descricao: 'Item: Vestido / Quant: 2 / Valor: R$ 90.00',
        preco: 180,
        dataVenda: '2026-05-01',
      },
      {
        cliente: 'TESTE - Diego Lima',
        metodoPagamento: 'Credito',
        descricao: 'Item: Tenis / Quant: 1 / Valor: R$ 210.00',
        preco: 210,
        dataVenda: '2026-06-20',
      },
      {
        cliente: 'TESTE - Bruno Costa',
        metodoPagamento: 'Especie',
        descricao: 'Item: Meias / Quant: 3 / Valor: R$ 15.00',
        preco: 45,
        dataVenda: '2026-06-22',
      },
    ];

    const pagamentos = [
      {
        nome_pagador: 'TESTE - Ana Silva',
        divida_anterior: 105,
        valor_pago: 40,
        divida_restante: 65,
        data_pagamento: '2026-06-15',
      },
      {
        nome_pagador: 'TESTE - Bruno Costa',
        divida_anterior: 50,
        valor_pago: 50,
        divida_restante: 0,
        data_pagamento: '2026-06-22',
      },
    ];

    const produtos = [
      {
        nome: 'TESTE - Produto livre sem estoque',
        codigo: null,
        preco_venda: 35,
        preco_custo: 18,
        quantidade: 0,
        controlar_estoque: false,
      },
      {
        nome: 'TESTE - Produto com estoque simples',
        codigo: 'TESTE001',
        preco_venda: 80,
        preco_custo: 42,
        quantidade: 12,
        controlar_estoque: true,
      },
    ];

    const despesas = [
      {
        descricao: 'TESTE - Compra de embalagens',
        valor: 38,
        data_despesa: '2026-06-12',
        categoria: 'Operacional',
      },
      {
        descricao: 'TESTE - Manutencao da loja',
        valor: 75,
        data_despesa: '2026-06-20',
        categoria: 'Manutencao',
      },
    ];

    for (const cliente of clientes) {
      await insertCliente(cliente);
    }
    for (const venda of vendas) {
      await insertVenda(venda);
    }
    for (const pagamento of pagamentos) {
      await insertPagamento(pagamento);
    }
    for (const produto of produtos) {
      await insertProduto(produto);
    }
    for (const despesa of despesas) {
      await insertDespesa(despesa);
    }

    await run('COMMIT');
    console.log('Dados de teste inseridos com sucesso.');
    console.log(`Backup criado em: ${backupPath}`);
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

seed()
  .catch((err) => {
    console.error('Erro ao inserir dados de teste:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb().catch((err) => {
      console.error('Erro ao fechar banco:', err);
      process.exitCode = 1;
    });
  });

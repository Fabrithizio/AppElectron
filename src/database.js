// Importa o módulo sqlite3
const sqlite3 = require('sqlite3').verbose();

// Nome do banco de dados SQLite
const dbName = 'Banco_dados.db';

// Cria uma instância do banco de dados SQLite
const db = new sqlite3.Database(dbName);

// Função para criar uma tabela se ela não existir
function createTable(tableName, columns) {
  db.run(`CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`);
}

// Função para inserir um novo cliente no banco de dados
function insertCliente({ nome, cpf, rg, endereco, telefone, email, divida }) {
  createTable('Clientes', 'id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, cpf TEXT, rg TEXT, endereco TEXT, telefone TEXT, email TEXT, divida REAL');
  db.run('INSERT INTO Clientes (nome, cpf, rg, endereco, telefone, email, divida) VALUES (?, ?, ?, ?, ?, ?, ?)', [nome, cpf, rg, endereco, telefone, email, divida]);
}

// Função para inserir uma nova venda no banco de dados
function insertVenda({ cliente, tipo, genero = '', categoria = '', marca = '', descricao, preco, quantidade, dataVenda }) {
  createTable('vendas', 'id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT, tipo TEXT, genero TEXT, categoria TEXT, marca TEXT, descricao TEXT, preco REAL, quantidade INTEGER, dataVenda TEXT');
  db.run('INSERT INTO vendas (cliente, tipo, genero, categoria, marca, descricao, preco, quantidade, dataVenda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [cliente, tipo, genero, categoria, marca, descricao, preco, quantidade, dataVenda]);
}

// Função para lidar com o sistema de pagamentos de clientes
createTable('Pagamentos', 'id INTEGER PRIMARY KEY AUTOINCREMENT, id_cliente INTEGER, data_pagamento TEXT, valor_pago REAL');

// Função para obter atividades por data
function getActivitiesByDate(date, callback) {
  let sql = `SELECT * FROM vendas
             INNER JOIN clientes ON vendas.cliente_id = clientes.id
             INNER JOIN pagamentos ON vendas.id = pagamentos.venda_id
             WHERE vendas.data = ?`;

  db.all(sql, [date], function(err, rows) {
    if (err) {
      console.error(err);
      return;
    }
    callback(rows);
  });
}

// Função para obter atividades por cliente
function getActivitiesByClient(clientName, callback) {
  let sql = `SELECT * FROM vendas
             INNER JOIN clientes ON vendas.cliente_id = clientes.id
             INNER JOIN pagamentos ON vendas.id = pagamentos.venda_id
             WHERE clientes.nome = ?`;

  db.all(sql, [clientName], function(err, rows) {
    if (err) {
      console.error(err);
      return;
    }
    callback(rows);
  });
}

// Exporta o banco de dados e as funções
module.exports = { db, insertCliente, insertVenda };

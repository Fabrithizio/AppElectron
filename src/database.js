const sqlite3 = require('sqlite3').verbose();

// Nome do banco de dados SQLite
const dbName = 'banco_dados.db';

// Cria uma instância do banco de dados SQLite
const db = new sqlite3.Database(dbName);


function insertCliente({ nome, cpf, rg, endereco, telefone, email, divida }) {
  db.serialize(() => {
    // Cria a tabela clientes se não existir
    db.run('CREATE TABLE IF NOT EXISTS Clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, cpf TEXT, rg TEXT, endereco TEXT, telefone TEXT, email TEXT, divida REAL)');

    // Insere os valores no banco de dados
    db.run('INSERT INTO Clientes (nome, cpf, rg, endereco, telefone, email, divida) VALUES (?, ?, ?, ?, ?, ?, ?)', [nome, cpf, rg, endereco, telefone, email, divida], (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Cliente inserido com sucesso.');
      }
    });
  });
}


//função que coida do sistema de vendas e banco de dados

function insertVenda({ cliente, metodoPagamento, descricao, preco, dataVenda }) {
  db.serialize(() => {
    // Cria a tabela vendas se não existir
    db.run('CREATE TABLE IF NOT EXISTS vendas (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente TEXT, metodoPagamento TEXT, descricao TEXT, preco REAL,  dataVenda TEXT)');

    // Insere os valores no banco de dados
    db.run('INSERT INTO vendas (cliente,  metodoPagamento, descricao, preco, dataVenda) VALUES (?, ?, ?, ?, ?)', [cliente,  metodoPagamento, descricao, preco, dataVenda], (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Venda inserida com sucesso.');
      }
    });
  });
}




db.run(`CREATE TABLE IF NOT EXISTS Pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_pagador TEXT,
  divida_anterior REAL,
  valor_pago REAL,
  divida_restante REAL,
  data_pagamento TEXT
)`);



module.exports = { db, insertCliente, insertVenda };











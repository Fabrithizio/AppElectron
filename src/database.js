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

function insertVenda({ cliente, tipo, genero = '', categoria = '', marca = '', metodoPagamento, descricao, preco, quantidade, dataVenda }) {
  db.serialize(() => {
    // Cria a tabela vendas se não existir
    db.run('CREATE TABLE IF NOT EXISTS vendas (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente TEXT, tipo TEXT, genero TEXT, categoria TEXT, marca TEXT,metodoPagamento TEXT, descricao TEXT, preco REAL, quantidade INTEGER, dataVenda TEXT)');

    // Insere os valores no banco de dados
    db.run('INSERT INTO vendas (cliente, tipo, genero, categoria, marca, metodoPagamento, descricao, preco, quantidade, dataVenda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [cliente, tipo, genero, categoria, marca, metodoPagamento, descricao, preco, quantidade, dataVenda], (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Venda inserida com sucesso.');
      }
    });
  });
}


//função para lidar com o sistema de pagamentos de clientes
db.run('CREATE TABLE IF NOT EXISTS Pagamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, id_cliente INTEGER, data_pagamento TEXT, valor_pago REAL)');



//sitesma de historico
db.run('CREATE TABLE IF NOT EXISTS historico (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, data TEXT, detalhes TEXT)');





module.exports = { db, insertCliente, insertVenda,};






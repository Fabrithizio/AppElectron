const sqlite3 = require('sqlite3').verbose();

// Nome do banco de dados SQLite
const dbName = 'Banco_dados.db';

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

function insertVenda({ cliente, tipo, genero = '', categoria = '', marca = '', descricao, preco, quantidade, dataVenda }) {
    db.serialize(() => {
      // Verifica se a tabela existe
      const sql = 'SELECT name FROM sqlite_master WHERE type = "table" AND name = "vendas"';
      const result = db.all(sql);
  
      if (result.length === 0) {
        // A tabela não existe, então a cria
        db.run('CREATE TABLE IF NOT EXISTS vendas (INTEGER PRIMARY KEY AUTOINCREMENT,cliente TEXT, tipo TEXT, genero TEXT, categoria TEXT, marca TEXT, descricao TEXT, preco REAL, quantidade INTEGER)');
      }
  
      // Insere os valores no banco de dados
      db.run('INSERT INTO vendas (cliente, tipo, genero, categoria, marca, descricao, preco, quantidade, dataVenda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [cliente, tipo, genero, categoria, marca, descricao, preco, quantidade, dataVenda], (err) => {
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


//coisa do sistesma de historico
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




module.exports = { db, insertCliente, insertVenda,};






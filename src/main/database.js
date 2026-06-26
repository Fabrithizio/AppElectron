const sqlite3 = require('sqlite3').verbose();

// Nome do banco de dados SQLite
const dbName = 'banco_dados.db';

// Cria uma instância do banco de dados SQLite
const db = new sqlite3.Database(dbName);


function insertCliente({ nome, DataNascimento,  cpf, rg, endereco, telefone, email, divida, dataPagamento }) {
  db.serialize(() => {
    // Cria a tabela clientes se não existir
    db.run('CREATE TABLE IF NOT EXISTS Clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, DataNascimento TEXT, cpf TEXT, rg TEXT, endereco TEXT, telefone TEXT, email TEXT, divida REAL, dataPagamento TEXT)');

    // Insere os valores no banco de dados
    db.run('INSERT INTO Clientes (nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento], (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Cliente inserido com sucesso.');
      }
    });
  });
}

// Função para atualizar um cliente no banco de dados
function updateCliente({ id, nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento }) {
  db.run('UPDATE Clientes SET nome = ?, DataNascimento = ?, cpf = ?, rg = ?, endereco = ?, telefone = ?, email = ?, divida = ?, dataPagamento = ? WHERE id = ?',
    [nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento, id],
    function(err) {
      if (err) {
        console.error(err);
      } else {
        console.log('Cliente atualizado com sucesso.');
      }
    }
  );
}

//função que cuida do sistema de vendas e banco de dados

function insertVenda({ cliente, metodoPagamento, descricao, preco, dataVenda }) {
  db.serialize(() => {
    // Cria a tabela vendas se não existir
    db.run('CREATE TABLE IF NOT EXISTS vendas (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente TEXT, metodoPagamento TEXT, descricao TEXT, preco REAL,  dataVenda TEXT)');

    // Insere os valores no banco de dados
    db.run('INSERT INTO vendas (cliente, metodoPagamento, descricao, preco, dataVenda) VALUES (?, ?, ?, ?, ?)', [cliente, metodoPagamento, descricao, preco, dataVenda], (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Venda inserida com sucesso.');
      }
    });
  });
}


function somaVendas(intervaloInicio, intervaloFim) {
  return new Promise((resolve, reject) => {
    // Formata as datas para o formato do SQLite
    let dataInicioFormatada = intervaloInicio.toISOString().split('T')[0];
    let dataFimFormatada = intervaloFim.toISOString().split('T')[0];

    db.serialize(() => {
      db.get(`SELECT SUM(preco) as totalVendas FROM vendas WHERE dataVenda BETWEEN ? AND ?`, [dataInicioFormatada, dataFimFormatada], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.totalVendas);
        }
      });
    });
  });
}

function somaVendasPorMetodoPagamento(metodoPagamento, intervaloInicio, intervaloFim) {
  return new Promise((resolve, reject) => {
    // Formata as datas para o formato do SQLite
    let dataInicioFormatada = intervaloInicio.toISOString().split('T')[0];
    let dataFimFormatada = intervaloFim.toISOString().split('T')[0];

    db.serialize(() => {
      db.get(`SELECT SUM(preco) as totalVendas FROM vendas WHERE metodoPagamento = ? AND dataVenda BETWEEN ? AND ?`, [metodoPagamento, dataInicioFormatada, dataFimFormatada], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.totalVendas);
        }
      });
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

module.exports = { db, insertCliente, insertVenda, updateCliente,somaVendas,somaVendasPorMetodoPagamento };











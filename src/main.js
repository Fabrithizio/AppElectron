const { app, BrowserWindow, ipcMain } = require('electron');
const{db,insertCliente,insertVenda,} = require('./database.js');


// responsavel pr pegar dos dados do historico de pagamentos
ipcMain.on('carregar-dados-historico-vendas', (event) => {
  db.all('SELECT * FROM vendas', [], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('dados-historico-vendas', rows);
  });
});



// historico de pagamentos
ipcMain.on('carregar-dados-historico-pagamentos', (event) => {
  db.all('SELECT * FROM Pagamentos', [], (err, rows) => {
    if (err) {
      event.sender.send('erro', 'Não foi possível carregar o histórico de pagamentos.');
    } else {
      event.sender.send('dados-historico-pagamentos', rows);
    }
  });
});

//responsavel por filtra o  hstorico de vendas
ipcMain.on('filtrar-vendas-por-data', (event, dataSelecionada) => {
  db.all('SELECT * FROM vendas WHERE dataVenda LIKE ?', [`${dataSelecionada}%`], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('resultado-filtro-data', rows);
  });
});

//responsavel por filtra o  hstorico de pagamentos
ipcMain.on('filtrar-pagamentos-por-data', (event, dataSelecionada) => {
  db.all('SELECT * FROM Pagamentos WHERE data_pagamento LIKE ?', [dataSelecionada + '%'], (err, rows) => {
    if (err) {
      event.sender.send('erro', 'Não foi possível filtrar os pagamentos pela data selecionada.');
    } else {
      event.sender.send('resultado-filtro-data-pagamentos', rows);
    }
  });
});


// confirmação de envio do cadastro de clientes para o banco
ipcMain.on('submit-cliente', (event, data) => {
  insertCliente(data);
});

// confirmação de envio dos dados para o banco  do sistema de vendas
ipcMain.on('submit-venda', (event, data) => {
  insertVenda(data);
});

//sistema para lidar com a busca de clientes no banco para a vendas
ipcMain.on('search', (event, searchTerm) => {
  console.log('Evento search recebido:', searchTerm);
  db.all('SELECT * FROM Clientes WHERE nome = ?', [searchTerm], function(err, rows) {
      if (err) {
          console.error(err);
          return;
      }
      event.sender.send('search-results', rows);
  });
});

// lida com o sistema de alto complete da parte esqueda do pesquisar
ipcMain.on('autocomplete-pesquisa', (event, searchTerm) => {
  db.all('SELECT nome FROM Clientes WHERE nome LIKE ? LIMIT 10', [searchTerm + '%'], function(err, rows) {
      if (err) {
          console.error(err);
          return;
      }
      event.sender.send('autocomplete-results', rows);
  });
});

// Lida com o sistema de auto-completar o nome do cliente
ipcMain.on('autocomplete-client-name', (event, clientName) => {
  db.all('SELECT nome FROM Clientes WHERE nome LIKE ? LIMIT 5', [clientName + '%'], function(err, rows) {
      if (err) {
          console.error(err);
          return;
      }
      event.sender.send('autocomplete-client-name-results', rows);
  });
});

ipcMain.on('registrar-pagamento', (event, { nomePagador, dividaAnterior, valorPagamento }) => {
  // Obtém a data e hora local no formato ISO
  const dataPagamento = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
  const dividaRestante = dividaAnterior - valorPagamento;

  db.serialize(() => {
    // Atualiza a dívida do cliente na tabela Clientes
    db.run('UPDATE Clientes SET divida = ? WHERE nome = ?', [dividaRestante, nomePagador], function(err) {
      if (err) {
        event.sender.send('erro', 'Erro ao atualizar a dívida do cliente: ' + err.message);
        return;
      }

      // Registra o pagamento na tabela Pagamentos com as novas colunas
      db.run('INSERT INTO Pagamentos (nome_pagador, divida_anterior, valor_pago, divida_restante, data_pagamento) VALUES (?, ?, ?, ?, ?)', [nomePagador, dividaAnterior, valorPagamento, dividaRestante, dataPagamento], function(err) {
        if (err) {
          event.sender.send('erro', 'Erro ao registrar o pagamento: ' + err.message);
          return;
        }

        // Envia uma confirmação de volta ao processo de renderização
        event.sender.send('pagamento-registrado', 'Pagamento registrado com sucesso.');
      });
    });
  });
});



// lida com o sistema de vendas a fiado
ipcMain.on('registrar-divida', (event, { cliente, divida }) => {
  db.serialize(() => {
      // Adiciona o valor da dívida à dívida atual do cliente na tabela Clientes
      db.run('UPDATE Clientes SET divida = divida + ? WHERE nome = ?', [divida, cliente]);
  });
});


//responsavel pelos sistema de historio 
ipcMain.on('get-activities-by-date', (event, date) => {
  getActivitiesByDate(date, function(rows) {
    event.sender.send('activities-by-date-results', rows);
  });
});

ipcMain.on('get-activities-by-client', (event, clientName) => {
  getActivitiesByClient(clientName, function(rows) {
    event.sender.send('activities-by-client-results', rows);
  });
});


//controle do sistema electron
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      nodeIntegration: true, // Habilita o 'require' no processo de renderização
      contextIsolation: false // Desabilita o isolamento de contexto
    }
  });

  win.loadFile('src/index.html');
}

app.whenReady().then(() => createWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Fecha a conexão com o banco de dados SQLite quando todas as janelas são fechadas
    db.close();
    app.quit();
  }
});

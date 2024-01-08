const { app, BrowserWindow, ipcMain } = require('electron');
const{db,insertCliente,insertVenda} = require('./database.js');

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



//coisa do sistema de pagamento da pagina pesquisar
ipcMain.on('registrar-pagamento', (event, { id, divida, pagamento }) => {
  db.serialize(() => {
      // Atualiza a dívida do cliente na tabela Clientes
      db.run('UPDATE Clientes SET divida = ? WHERE id = ?', [divida, id]);

      // Registra o pagamento na tabela Pagamentos
      db.run('INSERT INTO Pagamentos (id_cliente, data_pagamento, valor_pago) VALUES (?, ?, ?)', [id, new Date().toISOString(), pagamento]);
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

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
// Supondo que você esteja usando o sqlite3 para o banco de dados
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('caminho/para/seu/banco-de-dados.db');

// Crie a janela principal do Electron e carregue o HTML
function createWindow() {
  // ... Código para criar a janela do Electron ...
}

app.whenReady().then(createWindow);

// Evento para carregar os dados históricos de vendas
ipcMain.on('carregar-dados-historico-vendas', (event) => {
  db.all('SELECT * FROM vendas', [], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('dados-historico-vendas', rows);
  });
});

// Evento para carregar os dados históricos de pagamentos
ipcMain.on('carregar-dados-historico-pagamentos', (event) => {
  db.all('SELECT * FROM pagamentos', [], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('dados-historico-pagamentos', rows);
  });
});

// Evento para filtrar os dados por data
ipcMain.on('filtrar-dados', (event, dataSelecionada) => {
  // Filtrar dados de vendas
  db.all('SELECT * FROM vendas WHERE dataVenda LIKE ?', [`${dataSelecionada}%`], (err, vendas) => {
    if (err) {
      throw err;
    }
    // Filtrar dados de pagamentos
    db.all('SELECT * FROM pagamentos WHERE data_pagamento LIKE ?', [`${dataSelecionada}%`], (err, pagamentos) => {
      if (err) {
        throw err;
      }
      event.sender.send('resultado-filtro-data', { vendas, pagamentos });
    });
  });
});

// Código para lidar com o fechamento da janela do Electron
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
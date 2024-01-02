// renderer.js
const { ipcRenderer } = require('electron');
const { handleClienteEvents } = require('./pages/clientes/clientes.js');
const { handleVendaEvents } = require('./pages/vendas/vendas.js');

document.addEventListener('DOMContentLoaded', (event) => {
  handleClienteEvents();
  handleVendaEvents();

  // Solicitar atividades por data
  ipcRenderer.send('get-activities-by-date', date);

  // Receber resultados de atividades por data
  ipcRenderer.on('activities-by-date-results', (event, rows) => {
    // Adicione o código aqui para exibir 'rows' na sua página
  });

  // Solicitar atividades por cliente
  ipcRenderer.send('get-activities-by-client', clientName);

  // Receber resultados de atividades por cliente
  ipcRenderer.on('activities-by-client-results', (event, rows) => {
    // Adicione o código aqui para exibir 'rows' na sua página
  });
});

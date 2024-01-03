# AppElectron
App feito em electron para gerenciar uma pequena loja de roupase artigos
voce deve instalar o electron e o sqlite3 no seu projeto e adicionar o npm start ao seu arquivo packae.json

 adcionar ao final do rendere
 
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
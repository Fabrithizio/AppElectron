const { ipcRenderer } = require('electron');
const { shell } = require('electron');
const backupDatabase = require('./backup.js');

  document.getElementById('pagamentos').addEventListener('click', () => {
  ipcRenderer.send('verificar-pagamentos');
});






document.getElementById('whatsapp-icon').addEventListener('click', function() {
  shell.openExternal('https://web.whatsapp.com/');
});


document.getElementById('backupButton').addEventListener('click', backupDatabase);

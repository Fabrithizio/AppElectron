const { ipcRenderer } = require('electron');


  document.getElementById('pagamentos').addEventListener('click', () => {
  ipcRenderer.send('verificar-pagamentos');
});





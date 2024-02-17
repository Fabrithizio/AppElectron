const { ipcRenderer } = require('electron');

    document.getElementById('faturamento').addEventListener('click', () => {
    ipcRenderer.send('verificar-pagamentos');
  });

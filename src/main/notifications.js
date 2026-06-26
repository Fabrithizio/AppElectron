const { dialog } = require('electron');
const { listBirthdayClientes } = require('./database');

function getTodayMonthDay() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${month}-${day}`;
}

async function showBirthdayAlerts(parentWindow) {
  const clientes = await listBirthdayClientes(getTodayMonthDay());

  for (const cliente of clientes) {
    await dialog.showMessageBox(parentWindow, {
      type: 'info',
      title: 'Aniversario do Cliente',
      message: `Hoje e o aniversario do cliente ${cliente.nome.toUpperCase()}.`,
    });
  }
}

module.exports = { showBirthdayAlerts };

const fs = require('fs/promises');
const path = require('path');
const { dialog } = require('electron');
const { databasePath } = require('./database');

function formatDateForFile(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

async function chooseBackupDestination(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Escolha onde salvar o backup',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function backupDatabase(parentWindow) {
  const destinationFolder = await chooseBackupDestination(parentWindow);
  if (!destinationFolder) {
    return { canceled: true };
  }

  const backupFolder = path.join(destinationFolder, `backup-${formatDateForFile()}`);
  await fs.mkdir(backupFolder, { recursive: true });

  const backupPath = path.join(backupFolder, 'Banco_dados.db');
  await fs.copyFile(databasePath, backupPath);

  return { canceled: false, backupPath };
}

module.exports = { backupDatabase };

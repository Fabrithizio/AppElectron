const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { databasePath } = require('./database');

const projectRoot = path.resolve(__dirname, '..', '..');

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

async function backupDatabaseToFolder(destinationFolder, label = `backup-${formatDateForFile()}`) {
  const backupFolder = path.join(destinationFolder, label);
  await fs.mkdir(backupFolder, { recursive: true });

  const backupPath = path.join(backupFolder, 'Banco_dados.db');
  await fs.copyFile(databasePath, backupPath);
  return backupPath;
}

async function cleanupOldAutomaticBackups(destinationFolder, keepLast = 30) {
  if (!fsSync.existsSync(destinationFolder)) {
    return;
  }

  const entries = await fs.readdir(destinationFolder, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('auto-'))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(destinationFolder, entry.name),
    }))
    .sort((a, b) => b.name.localeCompare(a.name));

  const toDelete = folders.slice(Math.max(Number(keepLast) || 30, 1));
  for (const folder of toDelete) {
    await fs.rm(folder.fullPath, { recursive: true, force: true });
  }
}

async function automaticBackup(options = {}) {
  if (options.enabled === false) {
    return { skipped: true, reason: 'disabled' };
  }

  const destinationFolder = options.folder
    ? path.resolve(projectRoot, options.folder)
    : path.join(projectRoot, 'backups', 'automaticos');
  const today = new Date().toISOString().split('T')[0];
  const marker = path.join(destinationFolder, `auto-${today}`);
  const backupPath = path.join(marker, 'Banco_dados.db');

  if (fsSync.existsSync(backupPath)) {
    return { skipped: true, reason: 'already_exists', backupPath };
  }

  const createdPath = await backupDatabaseToFolder(destinationFolder, `auto-${today}`);
  await cleanupOldAutomaticBackups(destinationFolder, options.keepLast || 30);
  return { skipped: false, backupPath: createdPath };
}

module.exports = { backupDatabase, automaticBackup };

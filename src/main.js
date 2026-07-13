const { BrowserWindow, app } = require('electron');
const { db, initializeDatabase, writeAuditLog } = require('./main/database');
const { registerIpcHandlers } = require('./main/ipc');
const { showBirthdayAlerts } = require('./main/notifications');
const { createMainWindow } = require('./main/window');
const { automaticBackup } = require('./main/backup');
const { loadAppConfig } = require('./main/config');

async function bootstrap() {
  await initializeDatabase();
  automaticBackup(loadAppConfig().backup)
    .then(async (result) => {
      if (!result.skipped) {
        await writeAuditLog({
          entidade: 'Backup',
          acao: 'GERAR_BACKUP_AUTOMATICO',
          dadosDepois: { backupPath: result.backupPath },
        });
      }
    })
    .catch((err) => {
      console.error('Erro ao gerar backup automatico:', err);
    });
  registerIpcHandlers();

  const mainWindow = createMainWindow();
  mainWindow.once('ready-to-show', () => {
    showBirthdayAlerts(mainWindow).catch((err) => {
      console.error('Erro ao verificar aniversarios:', err);
    });
  });
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error('Erro ao iniciar aplicativo:', err);
  app.quit();
});

app.on('activate', () => {
  if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('window-all-closed', () => {
  db.close();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

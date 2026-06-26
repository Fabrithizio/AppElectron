const { BrowserWindow, app } = require('electron');
const { db, initializeDatabase } = require('./main/database');
const { registerIpcHandlers } = require('./main/ipc');
const { showBirthdayAlerts } = require('./main/notifications');
const { createMainWindow } = require('./main/window');

async function bootstrap() {
  await initializeDatabase();
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

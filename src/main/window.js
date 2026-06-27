const path = require('path');
const { BrowserWindow } = require('electron');

let whatsappWindow = null;

function createMainWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 800,
    minWidth: 880,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

function openWhatsappWindow(url = 'https://web.whatsapp.com/') {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.focus();
    return whatsappWindow;
  }

  whatsappWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'WhatsApp',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  whatsappWindow.loadURL(url, {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  whatsappWindow.on('closed', () => {
    whatsappWindow = null;
  });

  return whatsappWindow;
}

module.exports = { createMainWindow, openWhatsappWindow };

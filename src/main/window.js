const path = require('path');
const { BrowserWindow } = require('electron');

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

module.exports = { createMainWindow };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Hoje opens the edited draft using the selected client ID', async () => {
  const calls = [];
  const elements = [];
  const notices = {};
  const document = {
    querySelectorAll() { return []; },
    createElement() {
      const element = { append() {}, setAttribute() {}, addEventListener(event, callback) { this[event] = callback; } };
      elements.push(element);
      return element;
    },
    getElementById(id) { return notices[id] ||= {}; },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/hoje/hoje.js'), 'utf8');
  const context = vm.createContext({ document, require: () => ({ ipcRenderer: { invoke: async (...args) => calls.push(args) } }) });
  vm.runInContext(source.slice(0, source.indexOf("document.querySelectorAll('[data-task-filter]')")), context);
  vm.runInContext("addMessageEditor({ appendChild() {} }, { clientId: 123, name: 'Teste', message: 'Olá! 😊', noticeId: 'notice' })", context);
  elements.find(element => element.className === 'message-editor').value = 'Texto editado & revisão';
  await elements.find(element => element.textContent === 'Abrir WhatsApp').click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'hoje:open-collection-draft');
  assert.equal(calls[0][1].clientId, 123);
  assert.equal(calls[0][1].message, 'Texto editado & revisão');
  assert.match(notices.notice.textContent, /aberta com o texto pronto/);
});

test('an existing WhatsApp window navigates to the next selected conversation', () => {
  const windows = [];
  class BrowserWindow {
    constructor() { this.urls = []; windows.push(this); }
    loadURL(url) { this.urls.push(url); }
    on() {}
    isDestroyed() { return false; }
    focus() { this.focused = true; }
  }
  const context = vm.createContext({ module: { exports: {} }, require: name => name === 'electron' ? { BrowserWindow } : require(name) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/main/window.js'), 'utf8'), context);
  const open = context.module.exports.openWhatsappWindow;
  open();
  const url = 'https://web.whatsapp.com/send?phone=5511999990000&text=' + encodeURIComponent('Teste de rascunho 😊');
  open(url);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].urls.at(-1), url);
  assert.equal(windows[0].focused, true);
});

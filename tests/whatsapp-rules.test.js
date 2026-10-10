const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { statusForDueDate, eventForDueDate, isEligible, isValidPhone, canSendAutomatically } = require('../src/main/whatsapp-rules');
const { whatsappEventsSchemaSql } = require('../src/main/whatsapp-schema');

test('cliente sem dívida não é elegível', () => assert.equal(isEligible({ divida: 0, data_vencimento: '2026-10-09', whatsapp_opt_in: 1 }), false));
test('cliente com vencimento futuro fora da antecedência não recebe evento', () => assert.equal(eventForDueDate('2026-10-20', '2026-10-09', 3, 7), null));
test('cliente dentro da antecedência configurada recebe lembrete', () => assert.equal(eventForDueDate('2026-10-12', '2026-10-09', 3, 7), 'lembrete'));
test('vencimento de hoje entra na situação e evento corretos', () => {
  assert.equal(statusForDueDate('2026-10-09', '2026-10-09'), 'vence_hoje');
  assert.equal(eventForDueDate('2026-10-09', '2026-10-09'), 'vencimento');
});
test('vencimento passado é atraso e observa o intervalo configurado', () => {
  assert.equal(statusForDueDate('2026-10-02', '2026-10-09'), 'atrasado');
  assert.equal(eventForDueDate('2026-10-02', '2026-10-09', 3, 7), 'atraso');
  assert.equal(eventForDueDate('2026-10-05', '2026-10-09', 3, 7), null);
});
test('pagamento parcial preserva elegibilidade enquanto houver saldo', () => assert.equal(isEligible({ divida: 10.5, data_vencimento: '2026-10-09', whatsapp_opt_in: 1 }), true));
test('pagamento parcial reduz o saldo e pagamento total cancela eventos futuros', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE Clientes (id INTEGER PRIMARY KEY, divida REAL); INSERT INTO Clientes VALUES (1, 100);');
  db.exec(whatsappEventsSchemaSql);
  db.prepare("INSERT INTO WhatsAppEnvios (cliente_id,tipo,data_prevista,status,criado_em,atualizado_em) VALUES (1,'atraso','2026-10-16','pendente','now','now')").run();
  db.prepare('UPDATE Clientes SET divida = ROUND(MAX(divida - ?, 0), 2) WHERE id = ?').run(60, 1);
  assert.equal(db.prepare('SELECT divida FROM Clientes WHERE id=1').get().divida, 40);
  db.prepare('UPDATE Clientes SET divida = 0 WHERE id = ?').run(1);
  db.prepare("UPDATE WhatsAppEnvios SET status='cancelado' WHERE cliente_id = ? AND status IN ('pendente','agendado')").run(1);
  assert.equal(db.prepare('SELECT status FROM WhatsAppEnvios').get().status, 'cancelado'); db.close();
});
test('cliente sem consentimento ou inativado não é elegível', () => {
  assert.equal(isEligible({ divida: 20, data_vencimento: '2026-10-09', whatsapp_opt_in: 0 }), false);
  assert.equal(isEligible({ divida: 20, data_vencimento: '2026-10-09', whatsapp_opt_in: 1, ativo: 0 }), false);
});
test('telefone ausente ou inválido é identificado', () => {
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone('(11) 99999-0000'), true);
});
test('configuração ausente ou modo de teste bloqueia envio real', () => {
  assert.equal(canSendAutomatically({ enabled: false, testMode: false, configured: true }), false);
  assert.equal(canSendAutomatically({ enabled: true, testMode: true, configured: true }), false);
  assert.equal(canSendAutomatically({ enabled: true, testMode: false, configured: false }), false);
});
test('restrição persistente impede duplicar o mesmo evento', () => {
  const db = new DatabaseSync(':memory:'); db.exec(whatsappEventsSchemaSql);
  const insert = db.prepare("INSERT OR IGNORE INTO WhatsAppEnvios (cliente_id,tipo,data_prevista,criado_em,atualizado_em) VALUES (?,?,?,?,?)");
  insert.run(7, 'atraso', '2026-10-02', 'now', 'now'); insert.run(7, 'atraso', '2026-10-02', 'now', 'now');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM WhatsAppEnvios').get().n, 1); db.close();
});
test('schema de mensagens pode ser adicionado preservando clientes anteriores', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE Clientes (id INTEGER PRIMARY KEY, nome TEXT, divida REAL); INSERT INTO Clientes VALUES (1, 'Cliente fictício', 25);");
  db.exec('ALTER TABLE Clientes ADD COLUMN data_vencimento TEXT');
  db.exec('ALTER TABLE Clientes ADD COLUMN whatsapp_opt_in INTEGER DEFAULT 0');
  db.exec(whatsappEventsSchemaSql);
  assert.deepEqual({ ...db.prepare('SELECT nome, divida, data_vencimento, whatsapp_opt_in FROM Clientes WHERE id=1').get() },
    { nome: 'Cliente fictício', divida: 25, data_vencimento: null, whatsapp_opt_in: 0 });
  db.close();
});
test('resultado da tentativa distingue aceitação da API de entrega', () => {
  const db = new DatabaseSync(':memory:'); db.exec(whatsappEventsSchemaSql);
  db.prepare("INSERT INTO WhatsAppEnvios (cliente_id,tipo,data_prevista,status,criado_em,atualizado_em) VALUES (1,'atraso','2026-10-02','aceito_api','now','now')").run();
  assert.equal(db.prepare('SELECT status, entregue_em FROM WhatsAppEnvios').get().status, 'aceito_api');
  assert.equal(db.prepare('SELECT entregue_em FROM WhatsAppEnvios').get().entregue_em, null); db.close();
});
test('falha é registrada sem exigir telefone ou dados financeiros nos logs', () => {
  const db = new DatabaseSync(':memory:'); db.exec(whatsappEventsSchemaSql);
  db.prepare("INSERT INTO WhatsAppEnvios (cliente_id,tipo,data_prevista,status,erro,criado_em,atualizado_em) VALUES (1,'lembrete','2026-10-12','falha','timeout','now','now')").run();
  assert.equal(db.prepare('SELECT status, erro FROM WhatsAppEnvios').get().status, 'falha'); db.close();
});

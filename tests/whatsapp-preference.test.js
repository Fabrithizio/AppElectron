const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrateWhatsAppDefault } = require('../src/main/whatsapp-preference-migration');

test('existing clients enabled once; manual opt-outs survive subsequent startups', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE Clientes (id INTEGER PRIMARY KEY, whatsapp_opt_in INTEGER DEFAULT 0); INSERT INTO Clientes VALUES (1, 0), (2, NULL), (3, 1)');
    const adapter = { run: async sql => db.exec(sql), get: async sql => db.prepare(sql).get() };
    await migrateWhatsAppDefault(adapter);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Clientes WHERE whatsapp_opt_in = 1').get().n, 3);
    db.exec('UPDATE Clientes SET whatsapp_opt_in = 0 WHERE id = 1');
    await migrateWhatsAppDefault(adapter);
    assert.equal(db.prepare('SELECT whatsapp_opt_in FROM Clientes WHERE id = 1').get().whatsapp_opt_in, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM WhatsAppPreferenceMigration').get().n, 1);
  } finally { db.close(); }
});

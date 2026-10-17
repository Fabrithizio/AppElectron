// Applied once: later manual opt-outs must survive every restart.
async function migrateWhatsAppDefault({ run, get }) {
  await run('BEGIN IMMEDIATE');
  try {
    await run('CREATE TABLE IF NOT EXISTS WhatsAppPreferenceMigration (id INTEGER PRIMARY KEY, aplicado_em TEXT NOT NULL)');
    if (!await get('SELECT id FROM WhatsAppPreferenceMigration WHERE id = 1')) {
      await run('UPDATE Clientes SET whatsapp_opt_in = 1');
      await run("INSERT INTO WhatsAppPreferenceMigration (id, aplicado_em) VALUES (1, datetime('now'))");
    }
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

module.exports = { migrateWhatsAppDefault };

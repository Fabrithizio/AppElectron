const whatsappEventsSchemaSql = `CREATE TABLE IF NOT EXISTS WhatsAppEnvios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  data_prevista TEXT NOT NULL,
  data_vencimento TEXT,
  tentativa_em TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  api_message_id TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  erro TEXT,
  entregue_em TEXT,
  cancelado_em TEXT,
  concluido_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE(cliente_id, tipo, data_prevista)
)`;

module.exports = { whatsappEventsSchemaSql };

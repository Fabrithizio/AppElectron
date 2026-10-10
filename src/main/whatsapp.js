const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { normalizePhone } = require('./whatsapp-rules');

const defaultDraftTemplates = {
  lembrete: 'Olá, {nome}! Passando para lembrar que o pagamento de {valor} está previsto para {vencimento}. Qualquer dúvida, entre em contato com {loja}.',
  vencimento: 'Olá, {nome}! Hoje é a data prevista para o pagamento de {valor} referente à sua conta na {loja}. Caso já tenha pago, por favor, desconsidere esta mensagem.',
  atraso: 'Olá, {nome}! Consta em nosso sistema um saldo pendente de {valor}, com vencimento em {vencimento}. Se já realizou o pagamento, por favor, desconsidere esta mensagem. Caso precise, entre em contato conosco.',
  semVencimento: 'Olá, {nome}! Consta em nosso sistema um saldo pendente de {valor}. Para conversar sobre sua conta, entre em contato com {loja}.',
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'whatsapp-settings.json');
}

function readStored() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (_err) { return {}; }
}

function getSettings() {
  const stored = readStored();
  let token = '';
  if (stored.token && safeStorage.isEncryptionAvailable()) {
    try { token = safeStorage.decryptString(Buffer.from(stored.token, 'base64')); } catch (_err) { token = ''; }
  }
  return {
    enabled: stored.enabled === true,
    testMode: stored.testMode !== false,
    automationEnabled: stored.automationEnabled === true,
    beforeDays: Math.max(0, Math.min(30, Number(stored.beforeDays ?? 3))),
    intervalDays: Math.max(1, Math.min(90, Number(stored.intervalDays ?? 7))),
    sendStart: stored.sendStart || '09:00',
    sendEnd: stored.sendEnd || '18:00',
    dailyLimit: Math.max(1, Math.min(100, Number(stored.dailyLimit ?? 20))),
    apiVersion: stored.apiVersion || '',
    phoneNumberId: stored.phoneNumberId || '',
    businessAccountId: stored.businessAccountId || '',
    authorizedTestNumber: stored.authorizedTestNumber || '',
    templates: stored.templates || { lembrete: '', vencimento: '', atraso: '', teste: '' },
    templateLanguage: stored.templateLanguage || 'pt_BR',
    draftTemplates: stored.draftTemplates || defaultDraftTemplates,
    token,
    configured: Boolean(token && stored.phoneNumberId && stored.apiVersion),
  };
}

function publicSettings() {
  const settings = getSettings();
  const { token, ...safe } = settings;
  return { ...safe, tokenConfigured: Boolean(token) };
}

function saveSettings(input) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do Windows nao esta disponivel.');
  if (input.authorizedTestNumber && !/^\+?[\d\s()\-]{10,20}$/.test(String(input.authorizedTestNumber))) throw new Error('Numero de teste invalido.');
  if (input.templateLanguage && !/^[a-z]{2}_[A-Z]{2}$/.test(String(input.templateLanguage))) throw new Error('Idioma dos modelos deve usar o formato pt_BR.');
  if (String(input.token || '').length > 4096) throw new Error('Token de acesso muito longo.');
  for (const name of Object.values(input.templates || {})) {
    if (name && !/^[a-z0-9_]{1,512}$/.test(String(name))) throw new Error('Nome do modelo aprovado invalido.');
  }
  const previous = readStored();
  const token = String(input.token || '').trim();
  const stored = {
    enabled: input.enabled === true,
    testMode: input.testMode !== false,
    automationEnabled: input.automationEnabled === true,
    beforeDays: Math.max(0, Math.min(30, Number(input.beforeDays ?? 3))),
    intervalDays: Math.max(1, Math.min(90, Number(input.intervalDays ?? 7))),
    sendStart: /^\d{2}:\d{2}$/.test(input.sendStart) ? input.sendStart : '09:00',
    sendEnd: /^\d{2}:\d{2}$/.test(input.sendEnd) ? input.sendEnd : '18:00',
    dailyLimit: Math.max(1, Math.min(100, Number(input.dailyLimit ?? 20))),
    apiVersion: String(input.apiVersion || '').trim(),
    phoneNumberId: String(input.phoneNumberId || '').trim(),
    businessAccountId: String(input.businessAccountId || '').trim(),
    authorizedTestNumber: String(input.authorizedTestNumber || '').replace(/\D/g, ''),
    templates: Object.fromEntries(['lembrete', 'vencimento', 'atraso', 'teste'].map((kind) => [kind, String((input.templates || {})[kind] || '').trim()])),
    templateLanguage: String(input.templateLanguage || 'pt_BR').trim(),
    draftTemplates: Object.fromEntries(Object.keys(defaultDraftTemplates).map((kind) => [kind,
      String((input.draftTemplates || {})[kind] || defaultDraftTemplates[kind]).slice(0, 2000)])),
    token: token ? safeStorage.encryptString(token).toString('base64') : input.clearToken ? '' : previous.token || '',
  };
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 });
  return publicSettings();
}

function interpolate(template, customer, storeName, kind) {
  const overdue = customer.data_vencimento
    ? Math.max(0, Math.floor((Date.now() - new Date(`${customer.data_vencimento}T00:00:00`).getTime()) / 86400000)) : '';
  return String(template || '').replace(/\{(nome|loja|valor|vencimento|dias_atraso)\}/g, (_match, key) => ({
    nome: customer.nome,
    loja: storeName,
    valor: Number(customer.divida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    vencimento: customer.data_vencimento || 'sem vencimento definido',
    dias_atraso: overdue,
  })[key]);
}

function phoneDigits(value) { return String(value || '').replace(/\D/g, ''); }

function sanitizedError(message, settings, recipient = '') {
  let output = String(message || 'Falha na comunicacao com a API.').slice(0, 500);
  if (settings.token) output = output.split(settings.token).join('[token oculto]');
  if (recipient) output = output.split(recipient).join('[telefone oculto]');
  output = output.replace(/Bearer\s+\S+/gi, 'Bearer [token oculto]');
  return output;
}

async function sendCloudTemplate(customer, kind, templateName, language = 'pt_BR', { allowAuthorizedTest = false } = {}) {
  const settings = getSettings();
  if (!settings.enabled || (!allowAuthorizedTest && settings.testMode) || !settings.configured) throw new Error('Envio real desativado ou sem configuracao completa.');
  if (!customer.whatsapp_opt_in) throw new Error('Cliente sem consentimento registrado para WhatsApp.');
  const recipient = normalizePhone(customer.telefone);
  if (recipient.length < 10 || recipient.length > 15) throw new Error('Telefone ausente ou invalido.');
  if (!templateName) throw new Error('Modelo aprovado nao configurado para este tipo de lembrete.');
  const url = `https://graph.facebook.com/${encodeURIComponent(settings.apiVersion)}/${encodeURIComponent(settings.phoneNumberId)}/messages`;
  const components = kind === 'teste' ? [] : [{ type: 'body', parameters: [
    { type: 'text', text: String(customer.nome).slice(0, 256) },
    { type: 'text', text: Number(customer.divida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
    { type: 'text', text: customer.data_vencimento || 'sem vencimento definido' },
  ] }];
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient,
      type: 'template', template: { name: templateName, language: { code: language }, ...(components.length ? { components } : {}) } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && data.error && data.error.message;
    throw new Error(sanitizedError(message || `WhatsApp Cloud API retornou HTTP ${response.status}`, settings, recipient));
  }
  return { messageId: data.messages && data.messages[0] && data.messages[0].id };
}

async function testConnection() {
  const settings = getSettings();
  if (!settings.configured) throw new Error('Configure a versao da Graph API, o ID do numero e o token.');
  const url = `https://graph.facebook.com/${encodeURIComponent(settings.apiVersion)}/${encodeURIComponent(settings.phoneNumberId)}?fields=id,display_phone_number,verified_name`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${settings.token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(sanitizedError(data.error && data.error.message || `WhatsApp Cloud API retornou HTTP ${response.status}`, settings));
  return { connected: true, displayPhoneNumber: data.display_phone_number || '' };
}

module.exports = { getSettings, publicSettings, saveSettings, interpolate, sendCloudTemplate, phoneDigits, normalizePhone, testConnection };

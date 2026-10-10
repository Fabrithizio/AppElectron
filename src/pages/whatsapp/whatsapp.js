const { ipcRenderer } = require('electron');

let clients = [];
let settings = null;
const byId = (id) => document.getElementById(id);
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem vencimento';
const labels = { atrasado: 'Em atraso', vence_hoje: 'Vence hoje', futuro: 'Futuro', sem_vencimento: 'Sem vencimento' };
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const messageTemplates = {
  atrasado: 'Olá, {nome}! Consta em nosso sistema um saldo pendente de {valor}, com vencimento em {vencimento}. Se já realizou o pagamento, por favor, desconsidere esta mensagem. Caso precise, entre em contato conosco.',
  vence_hoje: 'Olá, {nome}! Hoje é a data prevista para o pagamento de {valor} referente à sua conta na {loja}. Caso já tenha pago, por favor, desconsidere esta mensagem.',
  futuro: 'Olá, {nome}! Passando para lembrar que o pagamento de {valor} está previsto para {vencimento}. Qualquer dúvida, entre em contato com {loja}.',
  sem_vencimento: 'Olá, {nome}! Consta em nosso sistema um saldo pendente de {valor}. Caso precise, entre em contato com {loja}.'
};

function currentMessage(client) {
  const templateKey = client.status === 'atrasado' ? 'atraso' : client.status === 'vence_hoje' ? 'vencimento'
    : client.status === 'futuro' ? 'lembrete' : 'semVencimento';
  const template = (settings && settings.draftTemplates && settings.draftTemplates[templateKey]) || messageTemplates[client.status] || messageTemplates.sem_vencimento;
  const lateDays = client.data_vencimento ? Math.max(0, Math.floor((new Date(`${today()}T00:00:00`) - new Date(`${client.data_vencimento}T00:00:00`)) / 86400000)) : 0;
  return template.replace(/\{(nome|valor|vencimento|loja|dias_atraso)\}/g, (_match, key) => ({
    nome: client.nome, valor: money(client.divida), vencimento: date(client.data_vencimento),
    loja: settings && settings.companyName || 'a loja', dias_atraso: String(lateDays),
  })[key]);
}

function render() {
  const term = byId('search').value.trim().toLocaleLowerCase('pt-BR');
  const state = byId('statusFilter').value;
  const from = byId('dateFrom').value;
  const to = byId('dateTo').value;
  const delay = byId('delayFilter').value;
  const list = clients.filter((client) => {
    const text = `${client.nome} ${client.telefone || ''}`.toLocaleLowerCase('pt-BR');
    const daysLate = client.data_vencimento ? Math.floor((new Date(`${today()}T00:00:00`) - new Date(`${client.data_vencimento}T00:00:00`)) / 86400000) : 0;
    const delayMatch = delay === 'todos' || (daysLate > 0 && (delay === '1-7' ? daysLate <= 7 : delay === '8-30' ? daysLate >= 8 && daysLate <= 30 : daysLate >= 31));
    return (!term || text.includes(term)) && (state === 'todos' || client.status === state)
      && (!from || (client.data_vencimento && client.data_vencimento >= from))
      && (!to || (client.data_vencimento && client.data_vencimento <= to)) && delayMatch;
  });
  const tbody = byId('clientRows');
  tbody.replaceChildren();
  if (!list.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td');
    cell.colSpan = 6; cell.textContent = 'Nenhum cliente para os filtros selecionados.'; row.appendChild(cell); tbody.appendChild(row);
  }
  for (const client of list) {
    const row = document.createElement('tr');
    const select = document.createElement('td'); const checkbox = document.createElement('input');
    checkbox.type = 'radio'; checkbox.name = 'selectedClient'; checkbox.value = String(client.id); checkbox.setAttribute('aria-label', `Selecionar ${client.nome}`); select.appendChild(checkbox);
    const name = document.createElement('td'); name.textContent = client.nome;
    const balance = document.createElement('td'); balance.textContent = money(client.divida);
    const due = document.createElement('td'); due.textContent = date(client.data_vencimento);
    const status = document.createElement('td'); const badge = document.createElement('span'); badge.className = `status ${client.status}`; badge.textContent = labels[client.status]; status.appendChild(badge);
    const phone = document.createElement('td'); phone.textContent = client.telefoneValido ? client.telefone : 'Telefone ausente/inválido';
    const consent = document.createElement('small'); consent.textContent = client.consent ? 'Consentimento registrado' : 'Sem consentimento registrado'; phone.appendChild(consent);
    row.append(select, name, balance, due, status, phone); tbody.appendChild(row);
  }
}

function renderHistory(history) {
  const box = byId('historyRows'); box.replaceChildren();
  for (const item of history.slice(0, 100)) {
    const line = document.createElement('div'); line.className = 'history-item';
    for (const text of [item.cliente, item.tipo, item.status, item.tentativa_em || item.data_prevista || '', item.erro || `Vencimento: ${date(item.data_vencimento)}`]) {
      const span = document.createElement('span'); span.textContent = text || '—'; line.appendChild(span);
    }
    box.appendChild(line);
  }
  if (!history.length) box.textContent = 'Nenhum envio registrado.';
}

function selectedClient() {
  const input = document.querySelector('input[name="selectedClient"]:checked');
  return clients.find((item) => item.id === Number(input && input.value));
}

function populateSettings(value) {
  settings = { ...(settings || {}), ...value };
  byId('apiVersion').value = value.apiVersion || '';
  byId('phoneNumberId').value = value.phoneNumberId || '';
  byId('businessAccountId').value = value.businessAccountId || '';
  byId('templateLanguage').value = value.templateLanguage || 'pt_BR';
  byId('testNumber').value = value.authorizedTestNumber || '';
  byId('templateReminder').value = value.templates.lembrete || '';
  byId('templateDue').value = value.templates.vencimento || '';
  byId('templateOverdue').value = value.templates.atraso || '';
  byId('templateTest').value = value.templates.teste || '';
  byId('draftReminder').value = value.draftTemplates.lembrete || '';
  byId('draftDue').value = value.draftTemplates.vencimento || '';
  byId('draftOverdue').value = value.draftTemplates.atraso || '';
  byId('draftNoDue').value = value.draftTemplates.semVencimento || '';
  byId('beforeDays').value = value.beforeDays ?? 3;
  byId('intervalDays').value = value.intervalDays ?? 7;
  byId('sendStart').value = value.sendStart || '09:00';
  byId('sendEnd').value = value.sendEnd || '18:00';
  byId('dailyLimit').value = value.dailyLimit ?? 20;
  byId('apiEnabled').checked = value.enabled === true;
  byId('testMode').checked = value.testMode !== false;
  byId('automationEnabled').checked = value.automationEnabled === true;
}

async function load() {
  const data = await ipcRenderer.invoke('whatsapp:dashboard');
  settings = data.settings;
  clients = data.clients;
  byId('clientCount').textContent = String(data.totals.clients);
  byId('debtTotal').textContent = money(data.totals.debt);
  byId('dueToday').textContent = String(data.totals.today);
  byId('overdue').textContent = String(data.totals.overdue);
  render(); renderHistory(data.history);
  const session = await ipcRenderer.invoke('auth:status');
  if (session.authenticated && session.user.role === 'owner') {
    byId('adminSettings').hidden = false;
    populateSettings(await ipcRenderer.invoke('whatsapp:settings'));
  }
  byId('notice').textContent = data.settings.testMode ? 'Modo de teste ativo. Nenhum envio automático será realizado.' : 'Envios pela Cloud API estão disponíveis conforme a configuração.';
}

byId('refreshButton').addEventListener('click', () => load().catch(showError));
['search', 'statusFilter', 'dateFrom', 'dateTo', 'delayFilter'].forEach((id) => byId(id).addEventListener('input', render));
byId('previewButton').addEventListener('click', () => {
  const client = selectedClient(); if (!client) return setNotice('Selecione um cliente primeiro.');
  byId('previewText').textContent = currentMessage(client); byId('previewDialog').showModal();
});
byId('closePreview').addEventListener('click', () => byId('previewDialog').close());
byId('draftButton').addEventListener('click', async () => {
  const client = selectedClient(); if (!client) return setNotice('Selecione um cliente primeiro.');
  if (!client.telefoneValido) return setNotice('Este cliente não possui um telefone válido.');
  try { await ipcRenderer.invoke('whatsapp:open-draft', { phone: client.telefone, message: currentMessage(client) }); setNotice('Conversa aberta com rascunho. A mensagem ainda não foi enviada.'); }
  catch (error) { showError(error); }
});
byId('integrationButton').addEventListener('click', async () => {
  if (!settings || !settings.configured || settings.testMode) return setNotice('Integração Cloud API não configurada ou em modo de teste.');
  try { const result = await ipcRenderer.invoke('whatsapp:test-connection'); setNotice(`Conexão com a Cloud API validada${result.displayPhoneNumber ? ` (${result.displayPhoneNumber})` : ''}.`); }
  catch (error) { showError(error); }
});
byId('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = {
    apiVersion: byId('apiVersion').value, phoneNumberId: byId('phoneNumberId').value,
    businessAccountId: byId('businessAccountId').value, token: byId('apiToken').value,
    templateLanguage: byId('templateLanguage').value, authorizedTestNumber: byId('testNumber').value,
    templates: { lembrete: byId('templateReminder').value, vencimento: byId('templateDue').value,
      atraso: byId('templateOverdue').value, teste: byId('templateTest').value },
    draftTemplates: { lembrete: byId('draftReminder').value, vencimento: byId('draftDue').value,
      atraso: byId('draftOverdue').value, semVencimento: byId('draftNoDue').value },
    beforeDays: byId('beforeDays').value, intervalDays: byId('intervalDays').value,
    sendStart: byId('sendStart').value, sendEnd: byId('sendEnd').value, dailyLimit: byId('dailyLimit').value,
    enabled: byId('apiEnabled').checked, testMode: byId('testMode').checked,
    clearToken: byId('clearToken').checked,
    automationEnabled: byId('automationEnabled').checked,
  };
  try { populateSettings(await ipcRenderer.invoke('whatsapp:settings-save', input)); byId('apiToken').value = ''; setNotice('Configurações salvas com segurança.'); }
  catch (error) { showError(error); }
});
byId('connectionButton').addEventListener('click', async () => { try { const r = await ipcRenderer.invoke('whatsapp:test-connection'); setNotice(`Conexão validada${r.displayPhoneNumber ? ` (${r.displayPhoneNumber})` : ''}.`); } catch (error) { showError(error); } });
byId('authorizedTestButton').addEventListener('click', async () => { try { const r = await ipcRenderer.invoke('whatsapp:send-test'); setNotice(`API aceitou o teste${r.messageId ? ` (${r.messageId})` : ''}; isso não confirma entrega.`); await load(); } catch (error) { showError(error); } });
byId('manualRunButton').addEventListener('click', async () => { try { const result = await ipcRenderer.invoke('whatsapp:run-manual'); setNotice(result.message || 'Verificação concluída.'); await load(); } catch (error) { showError(error); } });

function setNotice(text) { byId('notice').textContent = text; }
function showError(error) { setNotice(error && error.message ? error.message : 'Ocorreu um erro.'); }
load().catch(showError);

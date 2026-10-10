const { listClientesWithPaymentStatus, createWhatsAppEvent, getWhatsAppEvent,
  countWhatsAppAttemptsToday, beginWhatsAppAttempt, finishWhatsAppAttempt } = require('./database');
const whatsapp = require('./whatsapp');
const { eventForDueDate, isEligible, canSendAutomatically } = require('./whatsapp-rules');

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function withinWindow(settings) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = settings.sendStart.split(':').map(Number);
  const [endHour, endMinute] = settings.sendEnd.split(':').map(Number);
  return current >= startHour * 60 + startMinute && current <= endHour * 60 + endMinute;
}

let running = false;

async function runVerification({ manual = false } = {}) {
  if (running) return { checked: 0, sent: 0, skipped: 0, message: 'Verificação já está em andamento.' };
  running = true;
  let sent = 0; let skipped = 0; let checked = 0; let simulated = 0;
  try {
    const settings = whatsapp.getSettings();
    const dryRun = manual && settings.testMode;
    if ((!canSendAutomatically(settings) && !dryRun) || (!manual && !settings.automationEnabled)) {
      return { checked: 0, sent: 0, skipped: 0, message: 'Envio real ou automação está desativado; nenhuma mensagem foi enviada.' };
    }
    if ((!settings.configured || !withinWindow(settings)) && !dryRun) {
      return { checked: 0, sent: 0, skipped: 0, message: 'Configuração incompleta ou fora do horário permitido.' };
    }
    const today = todayLocal();
    let dailyAttempts = dryRun ? 0 : await countWhatsAppAttemptsToday(today);
    if (dailyAttempts >= settings.dailyLimit) return { checked: 0, sent: 0, skipped: 0, message: 'Limite diário de tentativas atingido.' };
    const customers = await listClientesWithPaymentStatus();
    for (const customer of customers) {
      if (dailyAttempts >= settings.dailyLimit) break;
      checked += 1;
      if (!isEligible(customer)) { skipped += 1; continue; }
      const kind = eventForDueDate(customer.data_vencimento, today, settings.beforeDays, settings.intervalDays);
      if (!kind) continue;
      if (dryRun) { simulated += 1; dailyAttempts += 1; continue; }
      const template = settings.templates[kind];
      if (!template) { skipped += 1; continue; }
      const eventDate = kind === 'atraso' ? today : customer.data_vencimento;
      const existing = await getWhatsAppEvent(customer.id, kind, eventDate);
      if (existing) {
        const age = existing.tentativa_em ? Date.now() - new Date(existing.tentativa_em).getTime() : Infinity;
        if (existing.status !== 'falha' || existing.tentativas >= 3 || age < 60 * 60 * 1000) { skipped += 1; continue; }
      }
      await createWhatsAppEvent(customer.id, kind, eventDate, customer.data_vencimento);
      await beginWhatsAppAttempt({ clienteId: customer.id, tipo: kind, dataPrevista: eventDate, dataVencimento: customer.data_vencimento });
      try {
        const response = await whatsapp.sendCloudTemplate(customer, kind, template, settings.templateLanguage);
        await finishWhatsAppAttempt({ clienteId: customer.id, tipo: kind, dataPrevista: eventDate,
          status: 'aceito_api', messageId: response.messageId });
        sent += 1;
      } catch (error) {
        await finishWhatsAppAttempt({ clienteId: customer.id, tipo: kind, dataPrevista: eventDate,
          status: 'falha', error: String(error.message || 'Falha desconhecida').slice(0, 500) });
      }
      dailyAttempts += 1;
    }
    if (dryRun) return { checked, sent: 0, simulated, skipped, message: `Simulação concluída: ${checked} avaliados, ${simulated} elegíveis; nenhuma mensagem foi enviada.` };
    return { checked, sent, skipped, message: `Verificação concluída: ${checked} avaliados, ${sent} aceitos pela API, ${skipped} ignorados. Aceitação não confirma entrega.` };
  } finally {
    running = false;
  }
}

function startAutomation() {
  const timer = setInterval(() => runVerification().catch(() => {}), 30 * 60 * 1000);
  timer.unref();
  runVerification().catch(() => {});
}

module.exports = { runVerification, startAutomation };

function statusForDueDate(dueDate, today) {
  if (!dueDate) return 'sem_vencimento';
  if (dueDate === today) return 'vence_hoje';
  return dueDate < today ? 'atrasado' : 'futuro';
}

function eventForDueDate(dueDate, today, beforeDays = 3, intervalDays = 7) {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  const current = new Date(`${today}T00:00:00`);
  const diff = Math.round((due - current) / 86400000);
  if (diff === 0) return 'vencimento';
  if (diff > 0 && diff <= beforeDays) return 'lembrete';
  if (diff < 0 && Math.abs(diff) % Math.max(Number(intervalDays) || 7, 1) === 0) return 'atraso';
  return null;
}

function isEligible(customer) {
  return Number(customer.divida) > 0 && Boolean(customer.data_vencimento)
    && Number(customer.whatsapp_opt_in) === 1 && Number(customer.ativo ?? 1) === 1;
}

function isValidPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function canSendAutomatically(settings) {
  return settings.enabled === true && settings.testMode === false && settings.configured === true;
}

module.exports = { statusForDueDate, eventForDueDate, isEligible, isValidPhone, normalizePhone, canSendAutomatically };

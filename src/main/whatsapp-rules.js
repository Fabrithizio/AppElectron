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

function overdueEventForDueDate(dueDate, today, intervalDays = 7) {
  if (!dueDate || dueDate >= today) return null;
  const kind = eventForDueDate(dueDate, today, 0, intervalDays);
  return kind === 'atraso' ? kind : null;
}

const OVERDUE_AFTER_DAYS = 45;
const ATTENTION_AFTER_DAYS = 30;

function validReferenceDate(value, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) || value > today) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function latestCollectionReference(customer, today) {
  return [customer.ultima_data_pagamento, customer.ultima_compra_fiado]
    .filter((value) => validReferenceDate(value, today))
    .sort()
    .at(-1) || null;
}

function collectionStatus(customer, today) {
  if (Number(customer.divida) <= 0) return { status: 'sem_divida', referenceDate: null, daysSinceReference: null };
  const referenceDate = latestCollectionReference(customer, today);
  if (!referenceDate) return { status: 'sem_data', referenceDate: null, daysSinceReference: null };
  const daysSinceReference = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / 86400000);
  const status = daysSinceReference >= OVERDUE_AFTER_DAYS ? 'atrasado'
    : daysSinceReference >= ATTENTION_AFTER_DAYS ? 'atencao' : 'em_dia';
  return { status, referenceDate, daysSinceReference };
}

function overdueEventForCollection(customer, today, intervalDays = 7) {
  const result = collectionStatus(customer, today);
  if (result.status !== 'atrasado') return null;
  const daysOverdue = result.daysSinceReference - OVERDUE_AFTER_DAYS;
  return daysOverdue % Math.max(Number(intervalDays) || 7, 1) === 0 ? 'atraso' : null;
}

function isEligible(customer) {
  return Number(customer.divida) > 0
    && Number(customer.whatsapp_opt_in) === 1 && Number(customer.ativo ?? 1) === 1
    && isValidPhone(customer.telefone);
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

module.exports = { statusForDueDate, eventForDueDate, overdueEventForDueDate, collectionStatus,
  latestCollectionReference, overdueEventForCollection, OVERDUE_AFTER_DAYS, ATTENTION_AFTER_DAYS,
  isEligible, isValidPhone, normalizePhone, canSendAutomatically };

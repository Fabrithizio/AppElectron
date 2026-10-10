const { ipcRenderer } = require('electron');
let companyName = 'a loja';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function emptyMessage(text) {
  const item = document.createElement('div');
  item.className = 'empty';
  item.textContent = text;
  return item;
}

function statusLabel(status) {
  return ({ atrasado: 'Atrasado', atencao: 'Atenção', sem_data: 'Sem data clara', em_dia: 'Em dia' })[status] || status;
}

function hasValidPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function collectionMessage(row) {
  return `Olá, *${row.nome}*! 😊\n\nAqui é da *${companyName}*.\n\nIdentificamos um saldo pendente de *${formatCurrency(row.divida)}* em nosso sistema. Você poderia, por gentileza, confirmar se o pagamento já foi realizado?\n\nCaso já tenha pago, por favor, desconsidere esta mensagem. Se precisar, estamos à disposição! 🤝`;
}

function birthdayMessage(cliente) {
  return `Olá, *${cliente.nome}*! 🎉\n\nA equipe da *${companyName}* deseja a você um feliz aniversário, com muita saúde e alegria. Aproveite muito o seu dia! 🥳`;
}

function addMessageEditor(item, { name, phone, message, noticeId }) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Ver e editar mensagem';
  const editor = document.createElement('textarea');
  editor.className = 'message-editor';
  editor.setAttribute('aria-label', `Mensagem para ${name}`);
  editor.value = message;
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secondary';
  copyButton.textContent = 'Copiar mensagem';
  copyButton.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('hoje:copy-collection-message', editor.value);
      setText(noticeId, `Mensagem de ${name} copiada. Revise antes de enviar.`);
    } catch (error) {
      setText(noticeId, error.message || 'Não foi possível copiar a mensagem.');
    }
  });
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.textContent = 'Abrir WhatsApp';
  openButton.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('hoje:open-collection-draft', { phone, message: editor.value });
      setText(noticeId, `Conversa de ${name} aberta com o texto pronto. Confira e envie pelo WhatsApp.`);
    } catch (error) {
      setText(noticeId, error.message || 'Não foi possível abrir o WhatsApp.');
    }
  });
  actions.append(copyButton, openButton);
  details.append(summary, editor, actions);
  item.appendChild(details);
}

function renderSentConfirmation(item, row, sentThisMonth) {
  const container = document.createElement('div');
  container.className = 'sent-confirmation';
  const sent = sentThisMonth[row.id];

  if (sent) {
    const status = document.createElement('span');
    status.className = 'sent-badge';
    status.textContent = `✓ Enviada este mês · ${formatDate(sent.enviado_em)}${sent.usuario ? ` · ${sent.usuario}` : ''}`;
    container.appendChild(status);
    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'secondary';
    undoButton.textContent = 'Corrigir confirmação';
    undoButton.addEventListener('click', async () => {
      if (!window.confirm(`Remover a confirmação de envio da cobrança de ${row.nome} neste mês?`)) return;
      try {
        await ipcRenderer.invoke('hoje:unmark-collection-sent', row.id);
        await loadToday();
        setText('collectionNotice', `Confirmação de ${row.nome} removida.`);
      } catch (error) {
        setText('collectionNotice', error.message || 'Não foi possível corrigir a confirmação.');
      }
    });
    container.appendChild(undoButton);
  } else {
    const hint = document.createElement('span');
    hint.textContent = 'Depois de enviar pelo WhatsApp, confirme aqui:';
    const markButton = document.createElement('button');
    markButton.type = 'button';
    markButton.className = 'secondary';
    markButton.textContent = 'Marcar enviada este mês';
    markButton.addEventListener('click', async () => {
      if (!window.confirm(`Você enviou a cobrança de ${row.nome} pelo WhatsApp neste mês?`)) return;
      markButton.disabled = true;
      try {
        await ipcRenderer.invoke('hoje:mark-collection-sent', row.id);
        await loadToday();
        setText('collectionNotice', `Cobrança de ${row.nome} registrada como enviada neste mês.`);
      } catch (error) {
        markButton.disabled = false;
        setText('collectionNotice', error.message || 'Não foi possível registrar o envio.');
      }
    });
    container.append(hint, markButton);
  }
  item.appendChild(container);
}

function renderOverdue(rows, sentThisMonth = {}) {
  const box = document.getElementById('overdueList');
  box.replaceChildren();
  setText('overdueMessageCount', String(rows.length));
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum cliente em atraso.'));
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item danger';
    const title = document.createElement('strong');
    title.textContent = row.nome;
    const meta = document.createElement('span');
    meta.textContent = `${formatCurrency(row.divida)} | ${row.atrasoTexto} | referência ${formatDate(row.referencia)}`;
    const phoneLabel = document.createElement('span');
    phoneLabel.textContent = row.telefone ? `Telefone: ${row.telefone}` : 'Sem telefone cadastrado';
    item.append(title, meta, phoneLabel);
    renderSentConfirmation(item, row, sentThisMonth);

    if (Number(row.whatsapp_opt_in) === 1 && hasValidPhone(row.telefone)) {
      addMessageEditor(item, {
        name: row.nome,
        phone: row.telefone,
        message: collectionMessage(row),
        noticeId: 'collectionNotice',
      });
    } else {
      const notice = document.createElement('span');
      notice.className = 'consent-notice';
      notice.textContent = !hasValidPhone(row.telefone)
        ? 'Cadastre um telefone válido para preparar o WhatsApp.'
        : 'Sem autorização de WhatsApp registrada. Confirme a autorização no cadastro antes de enviar.';
      item.appendChild(notice);
    }
    box.appendChild(item);
  });
}

function renderAttention(rows) {
  const box = document.getElementById('attentionList');
  box.replaceChildren();
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum cliente precisa de atenção agora.'));
    return;
  }
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = `item ${row.statusCobranca === 'atencao' ? 'warning' : ''}`;
    const title = document.createElement('strong');
    title.textContent = `${row.nome} - ${statusLabel(row.statusCobranca)}`;
    const meta = document.createElement('span');
    meta.textContent = `${formatCurrency(row.divida)} | referência ${formatDate(row.referencia)} | ${row.atrasoTexto}`;
    item.append(title, meta);
    box.appendChild(item);
  });
}

function renderBirthdays(rows) {
  const box = document.getElementById('birthdayList');
  box.replaceChildren();
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum aniversariante hoje.'));
    return;
  }
  rows.forEach((cliente) => {
    const item = document.createElement('div');
    item.className = 'item';
    const title = document.createElement('strong');
    title.textContent = cliente.nome;
    const phone = document.createElement('span');
    phone.textContent = cliente.telefone || 'Sem telefone';
    item.append(title, phone);
    if (Number(cliente.whatsapp_opt_in) === 1 && hasValidPhone(cliente.telefone)) {
      addMessageEditor(item, {
        name: cliente.nome,
        phone: cliente.telefone,
        message: birthdayMessage(cliente),
        noticeId: 'collectionNotice',
      });
    }
    box.appendChild(item);
  });
}

function renderStock(rows) {
  const box = document.getElementById('stockList');
  box.replaceChildren();
  if (!rows.length) {
    box.appendChild(emptyMessage('Nenhum produto abaixo do mínimo.'));
    return;
  }
  rows.forEach((produto) => {
    const item = document.createElement('div');
    item.className = 'item danger';
    const title = document.createElement('strong');
    title.textContent = produto.nome;
    const meta = document.createElement('span');
    meta.textContent = `Qtd. ${produto.quantidade} | mínimo ${produto.estoque_minimo || 0}`;
    item.append(title, meta);
    box.appendChild(item);
  });
}

function getLocalDateInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function renderTaskCard(task, context, names) {
  const item = document.createElement('article');
  const today = getLocalDateInputValue();
  const isComplete = task.status === 'concluida';
  item.className = `task-item${isComplete ? ' is-complete' : ''}${!isComplete && task.data_prevista < today ? ' is-overdue' : ''}`;
  const title = document.createElement('strong');
  title.textContent = task.titulo;
  const due = document.createElement('span');
  due.textContent = `Responsável: ${names[task.responsavel_username] || task.responsavel_username} · ${isComplete ? 'Concluída' : task.data_prevista < today ? 'Atrasada' : 'Prazo'}: ${formatDate(isComplete ? task.concluido_em : task.data_prevista)}`;
  item.append(title, due);

  if (task.detalhes) {
    const details = document.createElement('span');
    details.className = 'task-details';
    details.textContent = task.detalhes;
    item.appendChild(details);
  }

  if (isComplete) {
    const completedBy = document.createElement('span');
    completedBy.textContent = `Concluída por ${names[task.concluido_por] || task.concluido_por || 'usuário'}`;
    item.appendChild(completedBy);
  }

  if (!isComplete || context.isOwner) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'secondary';
    action.textContent = isComplete ? 'Reabrir tarefa' : 'Marcar como concluída';
    action.addEventListener('click', async () => {
      const confirmText = isComplete
        ? `Reabrir a tarefa “${task.titulo}”?`
        : `Confirmar que a tarefa “${task.titulo}” foi concluída?`;
      if (!window.confirm(confirmText)) return;
      action.disabled = true;
      try {
        await ipcRenderer.invoke(isComplete ? 'hoje:tasks-reopen' : 'hoje:tasks-complete', task.id);
        await loadTasks();
        setText('tasksNotice', isComplete ? 'Tarefa reaberta.' : 'Conclusão registrada.');
      } catch (error) {
        action.disabled = false;
        setText('tasksNotice', error.message || 'Não foi possível atualizar a tarefa.');
      }
    });
    item.appendChild(action);
  }
  return item;
}

async function loadTasks() {
  const [context, tasks] = await Promise.all([
    ipcRenderer.invoke('hoje:tasks-context'),
    ipcRenderer.invoke('hoje:tasks-list'),
  ]);
  const form = document.getElementById('taskForm');
  form.hidden = !context.isOwner;

  if (context.isOwner) {
    const assigneeSelect = document.getElementById('taskAssignee');
    const current = context.user;
    assigneeSelect.replaceChildren();
    const selfOption = document.createElement('option');
    selfOption.value = '__self';
    selfOption.textContent = `Para mim (${current.name})`;
    assigneeSelect.appendChild(selfOption);
    context.users
      .filter((user) => user.username !== current.username)
      .forEach((user) => {
        const option = document.createElement('option');
        option.value = user.username;
        option.textContent = `${user.name} · ${user.role === 'owner' ? 'Administrador(a)' : 'Funcionário(a)'}`;
        assigneeSelect.appendChild(option);
      });
    if (!document.getElementById('taskDueDate').value) {
      document.getElementById('taskDueDate').value = getLocalDateInputValue();
    }
  }

  const list = document.getElementById('taskList');
  list.replaceChildren();
  if (!tasks.length) {
    list.appendChild(emptyMessage(context.isOwner
      ? 'Nenhuma tarefa pendente para hoje. Use os modelos acima para atribuir uma.'
      : 'Você não tem tarefas pendentes para hoje.'));
    return;
  }
  const names = Object.fromEntries(context.users.map((user) => [user.username, user.name]));
  names[context.user.username] = context.user.name;
  tasks.forEach((task) => list.appendChild(renderTaskCard(task, context, names)));
}

document.getElementById('taskPreset').addEventListener('change', (event) => {
  const isCustom = event.currentTarget.value === '__custom';
  const customWrap = document.getElementById('customTaskTitleWrap');
  customWrap.hidden = !isCustom;
  document.getElementById('customTaskTitle').required = isCustom;
});

document.getElementById('taskForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const preset = document.getElementById('taskPreset').value;
  const titulo = preset === '__custom'
    ? document.getElementById('customTaskTitle').value.trim()
    : preset;
  submit.disabled = true;
  try {
    await ipcRenderer.invoke('hoje:tasks-create', {
      titulo,
      detalhes: document.getElementById('taskDetails').value,
      responsavelUsername: document.getElementById('taskAssignee').value,
      dataPrevista: document.getElementById('taskDueDate').value,
    });
    form.reset();
    document.getElementById('taskDueDate').value = getLocalDateInputValue();
    document.getElementById('customTaskTitleWrap').hidden = true;
    document.getElementById('customTaskTitle').required = false;
    await loadTasks();
    setText('tasksNotice', 'Tarefa criada e atribuída.');
  } catch (error) {
    setText('tasksNotice', error.message || 'Não foi possível criar a tarefa.');
  } finally {
    submit.disabled = false;
  }
});

async function loadToday() {
  const gate = document.getElementById('cashGate');
  const main = document.getElementById('todayContent');
  const form = document.getElementById('openCashGateForm');
  const notice = document.getElementById('cashGateNotice');
  gate.hidden = false;
  main.hidden = true;
  form.hidden = false;
  notice.textContent = '';

  let cashStatus;
  try {
    cashStatus = await ipcRenderer.invoke('caixa:status');
  } catch (error) {
    form.hidden = true;
    notice.textContent = error.message || 'Seu usuário não tem permissão para abrir ou consultar o caixa. Peça ao administrador para abrir o expediente.';
    return;
  }
  if (!cashStatus.open) return;

  gate.hidden = true;
  main.hidden = false;
  setText('cashStatus', 'Aberto');
  const config = await ipcRenderer.invoke('app:config');
  companyName = config.company.name || 'a loja';
  const data = await ipcRenderer.invoke('hoje:resumo');
  setText('salesToday', String(data.quantidadeVendasHoje || 0));
  setText('lateCount', String(data.totalAtrasados || 0));
  setText('attentionCount', String(data.totalAtencao || 0));
  renderOverdue(data.clientesEmAtraso || [], data.cobrancasEnviadasEsteMes || {});
  renderAttention(data.clientesParaAcompanhar || []);
  renderBirthdays(data.aniversariantes || []);
  renderStock(data.estoqueBaixo || []);
  await loadTasks();
  setText('cashPanelTitle', 'Caixa aberto');
  setText('cashPanelText', 'No fim do expediente, confira e feche o caixa pela tela completa.');
  const cashLink = document.getElementById('cashPageLink');
  cashLink.textContent = 'Conferir caixa';
  cashLink.style.display = 'inline-flex';
}

document.getElementById('refreshButton').addEventListener('click', () => {
  loadToday().catch((err) => {
    console.error(err);
    alert('Não foi possível atualizar a tela Hoje.');
  });
});

document.getElementById('openCashGateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  setText('cashGateNotice', 'Abrindo o caixa...');
  try {
    const result = await ipcRenderer.invoke('caixa:abrir', {
      valorInicial: document.getElementById('gateInitialValue').value,
    });
    if (result.cancelled) {
      setText('cashGateNotice', 'A abertura foi cancelada.');
      return;
    }
    await loadToday();
  } catch (error) {
    console.error(error);
    setText('cashGateNotice', error.message || 'Não foi possível abrir o caixa.');
  } finally {
    submit.disabled = false;
  }
});

loadToday().catch((error) => {
  console.error(error);
  alert('Não foi possível carregar a tela Hoje.');
});

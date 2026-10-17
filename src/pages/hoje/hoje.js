const { ipcRenderer } = require('electron');
let companyName = 'a loja';
let collectionTemplate = 'Olá, *{nome}*! 😊\n\nAqui é da *{loja}*.\n\nNo nosso controle, consta um saldo pendente de *{valor}*. Você poderia, por gentileza, confirmar se já realizou o pagamento?\n\nCaso já tenha pago, por favor, desconsidere esta mensagem. Ficamos à disposição para ajudar! 🤝';
let collectionTemplateLoaded = false;
let taskFilter = 'pending';
let currentTasks = [];
let currentTaskContext = null;
let isOwner = false;
const expandedLists = new Set();
const initialListSize = 5;

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

function renderExpandableList(box, rows, createItem, emptyText) {
  box.replaceChildren();
  if (!rows.length) {
    box.appendChild(emptyMessage(emptyText));
    return;
  }
  const expanded = expandedLists.has(box.id);
  const visibleRows = expanded ? rows : rows.slice(0, initialListSize);
  visibleRows.forEach((row) => box.appendChild(createItem(row)));
  if (rows.length > initialListSize) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary show-more-button';
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Mostrar menos' : `Mostrar mais (${rows.length - initialListSize})`;
    button.addEventListener('click', () => {
      if (expandedLists.has(box.id)) expandedLists.delete(box.id);
      else expandedLists.add(box.id);
      renderExpandableList(box, rows, createItem, emptyText);
    });
    box.appendChild(button);
  }
}

function statusLabel(status) {
  return ({ atrasado: 'Atrasado', atencao: 'Atenção', sem_data: 'Sem data clara', em_dia: 'Em dia' })[status] || status;
}

function hasValidPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function collectionMessage(row) {
  return String(collectionTemplate).replace(/\{(nome|loja|valor|dias_atraso|data_referencia)\}/g, (_match, key) => ({
    nome: row.nome,
    loja: companyName,
    valor: formatCurrency(row.divida),
    dias_atraso: String(row.atrasoDias === null ? '' : Math.max(0, row.atrasoDias - 44)),
    data_referencia: row.referencia ? formatDate(row.referencia) : 'não disponível',
  })[key]);
}

function reusableCollectionTemplate(message, row) {
  const values = [
    [formatCurrency(row.divida), '{valor}'],
    [row.referencia ? formatDate(row.referencia) : '', '{data_referencia}'],
    [String(row.atrasoDias === null ? '' : Math.max(0, row.atrasoDias - 44)), '{dias_atraso}'],
    [companyName, '{loja}'],
    [row.nome, '{nome}'],
  ];
  return values.reduce((template, [value, placeholder]) => value ? template.split(value).join(placeholder) : template, String(message));
}

function birthdayMessage(cliente) {
  return `Olá, *${cliente.nome}*! 🎉\n\nA equipe da *${companyName}* deseja a você um feliz aniversário, com muita saúde e alegria. Aproveite muito o seu dia! 🥳`;
}

function addMessageEditor(item, { clientId, name, message, noticeId, row = null }) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Ver e editar mensagem';
  const editor = document.createElement('textarea');
  editor.className = 'message-editor';
  editor.maxLength = 1500;
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
      await ipcRenderer.invoke('hoje:copy-collection-message', { clientId, message: editor.value });
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
      await ipcRenderer.invoke('hoje:open-collection-draft', { clientId, message: editor.value });
      setText(noticeId, `Conversa de ${name} aberta com o texto pronto. Confira e envie pelo WhatsApp.`);
    } catch (error) {
      setText(noticeId, error.message || 'Não foi possível abrir o WhatsApp.');
    }
  });
  actions.append(copyButton, openButton);
  if (isOwner && row) {
    const saveDefaultButton = document.createElement('button');
    saveDefaultButton.type = 'button';
    saveDefaultButton.className = 'secondary';
    saveDefaultButton.textContent = 'Salvar edição como padrão';
    saveDefaultButton.addEventListener('click', async () => {
      saveDefaultButton.disabled = true;
      try {
        collectionTemplate = await ipcRenderer.invoke('hoje:collection-template-save', reusableCollectionTemplate(editor.value, row));
        document.getElementById('collectionTemplateInput').value = collectionTemplate;
        setText(noticeId, 'Mensagem salva como padrão. Nome, saldo e referência serão preenchidos para cada cliente.');
      } catch (error) {
        setText(noticeId, error.message || 'Não foi possível salvar a mensagem padrão.');
      } finally {
        saveDefaultButton.disabled = false;
      }
    });
    actions.appendChild(saveDefaultButton);
  }
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
  setText('overdueMessageCount', String(rows.length));
  renderExpandableList(box, rows, (row) => {
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
        clientId: row.id,
        name: row.nome,
        message: collectionMessage(row),
        noticeId: 'collectionNotice',
        row,
      });
    } else {
      const notice = document.createElement('span');
      notice.className = 'consent-notice';
      notice.textContent = !hasValidPhone(row.telefone)
        ? 'Cadastre um telefone válido para preparar o WhatsApp.'
        : 'Sem autorização de WhatsApp registrada. Confirme a autorização no cadastro antes de enviar.';
      item.appendChild(notice);
    }
    return item;
  }, 'Nenhum cliente em atraso.');
}

function renderAttention(rows) {
  const box = document.getElementById('attentionList');
  renderExpandableList(box, rows, (row) => {
    const item = document.createElement('div');
    item.className = `item ${row.statusCobranca === 'atencao' ? 'warning' : ''}`;
    const title = document.createElement('strong');
    title.textContent = `${row.nome} - ${statusLabel(row.statusCobranca)}`;
    const meta = document.createElement('span');
    meta.textContent = `${formatCurrency(row.divida)} | referência ${formatDate(row.referencia)} | ${row.atrasoTexto}`;
    item.append(title, meta);
    return item;
  }, 'Nenhum cliente precisa de atenção agora.');
}

function renderBirthdays(rows) {
  const box = document.getElementById('birthdayList');
  renderExpandableList(box, rows, (cliente) => {
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
    return item;
  }, 'Nenhum aniversariante hoje.');
}

function renderStock(rows) {
  const box = document.getElementById('stockList');
  renderExpandableList(box, rows, (produto) => {
    const item = document.createElement('div');
    item.className = 'item danger';
    const title = document.createElement('strong');
    title.textContent = produto.nome;
    const meta = document.createElement('span');
    meta.textContent = `Qtd. ${produto.quantidade} | mínimo ${produto.estoque_minimo || 0}`;
    item.append(title, meta);
    return item;
  }, 'Nenhum produto abaixo do mínimo.');
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
  due.textContent = `Responsável: ${names[task.responsavel_username] || task.responsavel_username} · Prazo: ${formatDate(task.data_prevista)}${isComplete ? ` · Concluída em ${formatDate(task.concluido_em)}` : task.data_prevista < today ? ' · Atrasada' : ''}`;
  item.append(title, due);

  if (task.rotina_frequencia) {
    const routineLabel = document.createElement('span');
    routineLabel.textContent = `Rotina ${({ daily: 'diária', weekdays: 'em dias úteis', weekly: 'semanal' })[task.rotina_frequencia] || ''}`;
    item.appendChild(routineLabel);
  }

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

  if (context.isOwner && task.rotina_id && task.rotina_ativa) {
    const pauseButton = document.createElement('button');
    pauseButton.type = 'button';
    pauseButton.className = 'secondary task-pause-button';
    pauseButton.textContent = 'Pausar rotina';
    pauseButton.addEventListener('click', async () => {
      if (!window.confirm(`Pausar a rotina “${task.titulo}”? As próximas ocorrências serão canceladas.`)) return;
      pauseButton.disabled = true;
      try {
        await ipcRenderer.invoke('hoje:tasks-pause-routine', task.rotina_id);
        await loadTasks();
        setText('tasksNotice', 'Rotina pausada. As tarefas já concluídas foram mantidas.');
      } catch (error) {
        pauseButton.disabled = false;
        setText('tasksNotice', error.message || 'Não foi possível pausar a rotina.');
      }
    });
    item.appendChild(pauseButton);
  }
  return item;
}

function renderTaskList() {
  const list = document.getElementById('taskList');
  const allCount = currentTasks.length;
  const pendingCount = currentTasks.filter((task) => task.status === 'pendente').length;
  const completedCount = allCount - pendingCount;
  const today = getLocalDateInputValue();
  const overdueCount = currentTasks.filter((task) => task.status === 'pendente' && task.data_prevista < today).length;
  setText('taskCount', `${pendingCount} pendente(s) · ${overdueCount} atrasada(s) · ${completedCount} concluída(s)`);

  const tasks = currentTasks.filter((task) => {
    if (taskFilter === 'pending') return task.status === 'pendente';
    if (taskFilter === 'completed') return task.status === 'concluida';
    return true;
  });
  if (!tasks.length) {
    list.replaceChildren();
    const messages = {
      pending: currentTaskContext.isOwner
        ? 'Nenhuma tarefa pendente. As tarefas dos próximos dias também aparecem aqui.'
        : 'Você não tem tarefas pendentes ou próximas.',
      completed: 'Nenhuma tarefa concluída para mostrar.',
      all: 'Nenhuma tarefa cadastrada ainda.',
    };
    list.appendChild(emptyMessage(messages[taskFilter]));
    return;
  }
  const names = Object.fromEntries(currentTaskContext.users.map((user) => [user.username, user.name]));
  names[currentTaskContext.user.username] = currentTaskContext.user.name;
  renderExpandableList(list, tasks, (task) => renderTaskCard(task, currentTaskContext, names), 'Nenhuma tarefa cadastrada ainda.');
}

async function loadTasks() {
  const [context, tasks] = await Promise.all([
    ipcRenderer.invoke('hoje:tasks-context'),
    ipcRenderer.invoke('hoje:tasks-list'),
  ]);
  const form = document.getElementById('taskForm');
  form.hidden = !context.isOwner;
  currentTasks = tasks;
  currentTaskContext = context;

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

  renderTaskList();
}

document.querySelectorAll('[data-task-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    taskFilter = button.dataset.taskFilter;
    document.querySelectorAll('[data-task-filter]').forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', String(selected));
    });
    renderTaskList();
  });
});

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
      frequencia: document.getElementById('taskFrequency').value,
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
  const taskContext = await ipcRenderer.invoke('hoje:tasks-context');
  isOwner = Boolean(taskContext.isOwner);
  document.getElementById('collectionTemplatePanel').hidden = !taskContext.isOwner;
  try {
    collectionTemplate = await ipcRenderer.invoke('hoje:collection-template') || collectionTemplate;
  } catch (error) {
    console.error('Não foi possível carregar a mensagem padrão de cobrança:', error);
  }
  if (taskContext.isOwner && !collectionTemplateLoaded) {
    document.getElementById('collectionTemplateInput').value = collectionTemplate;
    collectionTemplateLoaded = true;
  }
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

document.getElementById('saveCollectionTemplate').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    collectionTemplate = await ipcRenderer.invoke(
      'hoje:collection-template-save',
      document.getElementById('collectionTemplateInput').value,
    );
    await loadToday();
    setText('collectionNotice', 'Mensagem padrão salva. Os próximos rascunhos usarão este texto.');
  } catch (error) {
    setText('collectionNotice', error.message || 'Não foi possível salvar a mensagem padrão.');
  } finally {
    button.disabled = false;
  }
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

const { ipcRenderer } = require('electron');

let clienteId = null;

const form = document.querySelector('.clientes');
const resultsDiv = document.getElementById('results');
const editingStatus = document.getElementById('editingStatus');

function showModal(message) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-text').textContent = message;
  modal.style.display = 'block';
}

function hideModal() {
  document.getElementById('modal').style.display = 'none';
}

function moneyToNumber(value) {
  const number = Number(String(value || 0).replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function getFormData() {
  return {
    id: clienteId,
    nome: document.getElementById('nome').value.trim(),
    DataNascimento: document.getElementById('dataNascimento').value,
    cpf: document.getElementById('cpf').value.trim(),
    rg: document.getElementById('rg').value.trim(),
    endereco: document.getElementById('endereco').value.trim(),
    telefone: document.getElementById('telefone').value.trim(),
    email: document.getElementById('email').value.trim(),
    divida: moneyToNumber(document.getElementById('divida').value),
    dataPagamento: document.getElementById('dataPagamento').value,
  };
}

function fillForm(cliente) {
  clienteId = cliente.id;
  document.getElementById('nome').value = cliente.nome || '';
  document.getElementById('dataNascimento').value = cliente.DataNascimento || '';
  document.getElementById('cpf').value = cliente.cpf || '';
  document.getElementById('rg').value = cliente.rg || '';
  document.getElementById('endereco').value = cliente.endereco || '';
  document.getElementById('telefone').value = cliente.telefone || '';
  document.getElementById('email').value = cliente.email || '';
  document.getElementById('divida').value = Number(cliente.divida || 0).toFixed(2);
  document.getElementById('dataPagamento').value = cliente.dataPagamento || '';
  updateEditingStatus(cliente);
}

function clearForm() {
  clienteId = null;
  form.reset();
  document.getElementById('search').value = '';
  resultsDiv.innerHTML = '';
  updateEditingStatus(null);
}

function updateEditingStatus(cliente) {
  const title = editingStatus.querySelector('strong');
  const description = editingStatus.querySelector('span');
  if (!cliente) {
    title.textContent = 'Novo cliente';
    description.textContent = 'Nenhum cadastro selecionado.';
    return;
  }

  title.textContent = 'Editando cadastro';
  description.textContent = `${cliente.nome} | ID ${cliente.id}`;
}

function applyMasks() {
  document.getElementById('telefone').addEventListener('input', (event) => {
    event.target.value = event.target.value
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/g, '($1) $2')
      .replace(/(\d)(\d{4})$/, '$1-$2');
  });

  document.getElementById('cpf').addEventListener('input', (event) => {
    event.target.value = event.target.value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{2})$/, '$1-$2');
  });

  document.getElementById('rg').addEventListener('input', (event) => {
    event.target.value = event.target.value
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/g, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1-$2');
  });

  document.getElementById('divida').addEventListener('change', (event) => {
    event.target.value = moneyToNumber(event.target.value).toFixed(2);
  });
}

async function loadAutocomplete(nome) {
  resultsDiv.innerHTML = '';
  if (!nome) {
    return;
  }

  const clientes = await ipcRenderer.invoke('clientes:autocomplete', nome, 5);
  clientes.forEach((cliente) => {
    const item = document.createElement('div');
    item.textContent = cliente.nome;
    item.addEventListener('click', async () => {
      const clienteData = await ipcRenderer.invoke('clientes:get-by-name', cliente.nome);
      document.getElementById('search').value = cliente.nome;
      resultsDiv.innerHTML = '';
      fillForm(clienteData);
    });
    resultsDiv.appendChild(item);
  });
}

document.getElementById('search').addEventListener('input', (event) => {
  loadAutocomplete(event.target.value.trim()).catch((err) => {
    console.error(err);
    showModal('Nao foi possivel buscar clientes.');
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const cliente = getFormData();

  if (!cliente.nome || !cliente.telefone) {
    showModal('Preencha nome e telefone.');
    return;
  }

  await ipcRenderer.invoke('clientes:create', cliente);
  clearForm();
  showModal('Cliente cadastrado.');
});

document.getElementById('updateButton').addEventListener('click', async () => {
  if (!clienteId) {
    showModal('Selecione um cliente antes de atualizar.');
    return;
  }

  await ipcRenderer.invoke('clientes:update', getFormData());
  showModal('Cliente atualizado.');
});

document.getElementById('clearButton').addEventListener('click', clearForm);

document.querySelector('.close-button').addEventListener('click', hideModal);
window.addEventListener('click', (event) => {
  if (event.target === document.getElementById('modal')) {
    hideModal();
  }
});

applyMasks();

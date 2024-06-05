const { ipcRenderer } = require('electron');
document.addEventListener('DOMContentLoaded', (event) => {


  const form = document.querySelector('.clientes');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      // Obtém os valores do formulário de clientes
      const nome = document.getElementById('nome').value;
      const DataNascimento = document.getElementById('dataNascimento').value;
      const cpf = document.getElementById('cpf').value;
      const rg = document.getElementById('rg').value;
      const endereco = document.getElementById('endereco').value;
      const telefone = document.getElementById('telefone').value;
      const email = document.getElementById('email').value;
      const divida = document.getElementById('divida').value;
      const dataPagamento = document.getElementById('dataPagamento').value;

      // Verifica se todos os campos obrigatórios estão preenchidos
      if (!nome || !telefone) {
        showModal('Por favor, preencha todos os campos obrigatórios.');
        return; // Impede o envio do formulário
      }

      // Envia um evento IPC com os valores do formulário de clientes
      ipcRenderer.send('submit-cliente', { nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento });

      // Exibe uma mensagem de sucesso
      showModal('Cliente Cadastrado');

      // Limpa o formulário
      form.reset();
    });
  }




  // Função para exibir a janela modal
  function showModal(message) {
    const modal = document.getElementById('modal');
    const span = document.getElementsByClassName('close-button')[0];
    document.getElementById('modal-text').textContent = message;
    modal.style.display = 'block';
    span.onclick = function () {
      modal.style.display = 'none';
    }
    window.onclick = function (event) {
      if (event.target == modal) {
        modal.style.display = 'none';
      }
    }
  }



  // form vendas ↓↓↓
  function getDataHoraLocal() {
    const agora = new Date();

    // Retorna apenas a parte da data no formato 'YYYY-MM-DD'
    const dataISO = agora.toISOString().split('T')[0];
    return dataISO;
  }


  const vendaForm = document.querySelector('#vendaForm');
  if (vendaForm) {
    vendaForm.addEventListener('submit', (event) => {
      event.preventDefault();

      // Obtém os valores do formulário das vendas
      const cliente = document.getElementById('cliente').value;
      const descricao = document.getElementById('descricao').value;
      const preco = parseFloat(document.getElementById('preco').value);
      const dataVenda = getDataHoraLocal();
      const metodoPagamento = document.getElementById('metodo_pagamento').value;

      // Verifica se todos os campos estão preenchidos
      if (!cliente || !preco) {
        showModal('Por favor, preencha todos os campos.');
        return; // Impede o envio do formulário
      }

      let dados;

      dados = { cliente, metodoPagamento, descricao, preco, dataVenda };


      // Se o pagamento for a prazo (Fiado), adiciona o valor da venda à dívida do cliente
      if (metodoPagamento === 'Fiado') {
        // Envia um evento IPC para adicionar o valor da venda à dívida do cliente
        ipcRenderer.send('registrar-divida', { cliente: cliente, divida: preco });
      }

      // Envia um evento IPC com os valores do formulário
      ipcRenderer.send('submit-venda', dados);
      function limparCampos() {
        document.getElementById('cliente').value = '';
        document.getElementById('descricao').value = '';
        document.getElementById('preco').value = '';
        document.getElementById('metodo_pagamento').value = '';
        itens = [];

        // Adicione aqui todos os outros campos que você deseja limpar
      }
      limparCampos();
      // Limpa os campos após o envio
      // Exibe uma mensagem de sucesso
      showModal('Venda Realizada');
    });

    // Função para exibir a janela modal
    function showModal(message) {
      const modal = document.getElementById('modal');
      const span = document.getElementsByClassName('close-button')[0];
      document.getElementById('modal-text').textContent = message;
      modal.style.display = 'block';
      span.onclick = function () {
        modal.style.display = 'none';
      }
      window.onclick = function (event) {
        if (event.target == modal) {
          modal.style.display = 'none';
        }
      }
    }
  }
});



ipcRenderer.send('getTotalVendas');

ipcRenderer.on('getTotalVendasResponse', (event, totalVendas) => {
  document.getElementById('totalVendas').textContent = `A soma total das vendas dos últimos 30 dias é: ${totalVendas}`;
});

let metodosPagamento = ['Pix', 'Especie', 'Fiado', 'Debito', 'Credito'];

metodosPagamento.forEach(metodoPagamento => {
  ipcRenderer.send('getTotalVendasPorMetodoPagamento', metodoPagamento);

  ipcRenderer.on('getTotalVendasPorMetodoPagamentoResponse', (event, data) => {
    if (data.metodoPagamento === metodoPagamento) {
      document.getElementById(`totalVendas${metodoPagamento}`).textContent = `A soma total das vendas por ${metodoPagamento} é: ${data.totalVendas}`;
    }
  });
});
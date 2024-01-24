const { ipcRenderer } = require('electron');

  document.addEventListener('DOMContentLoaded', (event) => {
    const form = document.querySelector('.clientes');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();

        // Obtém os valores do formulário de clientes
        const nome = document.getElementById('nome').value;
        const cpf = document.getElementById('cpf').value;
        const rg = document.getElementById('rg').value;
        const endereco = document.getElementById('endereco').value;
        const telefone = document.getElementById('telefone').value;
        const email = document.getElementById('email').value;
        const divida = document.getElementById('divida').value;

        // Verifica se todos os campos obrigatórios estão preenchidos
        if (!nome || !telefone) {
          showModal('Por favor, preencha todos os campos obrigatórios.');
          return; // Impede o envio do formulário
        }

        // Envia um evento IPC com os valores do formulário de clientes
        ipcRenderer.send('submit-cliente', { nome, cpf, rg, endereco, telefone, email, divida });

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
      span.onclick = function() {
        modal.style.display = 'none';
      }
      window.onclick = function(event) {
        if (event.target == modal) {
          modal.style.display = 'none';
        }
      }
    }


  

  
  // data local
  function getDataHoraLocal() {
    const agora = new Date();
    return agora.toISOString();
}

// form vendas ↓↓↓
const vendaForm = document.querySelector('#vendaForm');
if (vendaForm) 
{
    vendaForm.addEventListener('submit', (event) => 
{
  event.preventDefault();

  // Obtém os valores do formulário das vendas
  const cliente = document.getElementById('cliente').value;
  const tipo = document.getElementById('tipo').value;
  const descricao = document.getElementById('descricao').value;
  const preco = parseFloat(document.getElementById('preco').value); 
  const quantidade = document.getElementById('quantidade').value;
  const dataVenda = getDataHoraLocal(); 
  const tipos = document.getElementById('tipo').value;
  const metodoPagamento = document.getElementById('pagamento').value;

  // Verifica se todos os campos estão preenchidos
  if (!cliente || !tipo || !pagamento || !preco || !quantidade) {
    showModal('Por favor, preencha todos os campos.');
    return; // Impede o envio do formulário
  } else if (tipos === 'roupa') {
    const genero = document.getElementById('genero').value;
    const marca = document.getElementById('marca').value;
    const categoria = document.getElementById('categoria').value;
    if (!genero || !categoria || !marca) {
      showModal('Por favor, preencha todos os campos para a venda de roupas.');
      return; // Impede o envio do formulário
    }
  } else if (tipos === 'objeto' && !descricao) {
    showModal('Por favor, preencha todos os campos para a venda de objetos.');
    return; // Impede o envio do formulário
  }

  let dados;
  if (tipos === 'roupa') {
    const genero = document.getElementById('genero').value;
    const marca = document.getElementById('marca').value;
    const categoria = document.getElementById('categoria').value;
    // Inclui genero e marca nos dados enviados
    dados = { cliente, tipo, genero, categoria, marca, metodoPagamento, descricao, preco, quantidade, dataVenda };
  } else if (tipos === 'objeto') {
    // Exclui genero e marca dos dados enviados
    dados = { cliente, tipo, descricao, metodoPagamento, preco, quantidade, dataVenda };
  }

  // Se o pagamento for a prazo (Fiado), adiciona o valor da venda à dívida do cliente
  if (metodoPagamento === 'Fiado') {
    // Envia um evento IPC para adicionar o valor da venda à dívida do cliente
    ipcRenderer.send('registrar-divida', { cliente: cliente, divida: preco });
  }

  // Envia um evento IPC com os valores do formulário
  ipcRenderer.send('submit-venda', dados);

    // Exibe uma mensagem de sucesso
    showModal('Venda Realizada');
  });

  // Função para exibir a janela modal
  function showModal(message) {
    const modal = document.getElementById('modal');
    const span = document.getElementsByClassName('close-button')[0];
    document.getElementById('modal-text').textContent = message;
    modal.style.display = 'block';
    span.onclick = function() {
      modal.style.display = 'none';
    }
    window.onclick = function(event) {
      if (event.target == modal) {
        modal.style.display = 'none';
      }
    }
  }
  }

  
  

});



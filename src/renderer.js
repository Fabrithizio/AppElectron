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

      // Envia um evento IPC com os valores do formulário de clientes
      ipcRenderer.send('submit-cliente', { nome, cpf, rg, endereco, telefone, email, divida });
    });
  }

  //fomulario de vendas  ↓  ↓  ↓

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
      const preco = document.getElementById('preco').value;
      const quantidade = document.getElementById('quantidade').value;
      const dataVenda = new Date().toISOString(); 
      const tipos = document.getElementById('tipo').value;
      const metodoPagamento = document.getElementById('pagamento').value;

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
      // Envia um evento IPC com os valores do formulário
      ipcRenderer.send('submit-venda', dados);
    });
  }

  
});


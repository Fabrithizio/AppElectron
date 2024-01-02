// vendas.js
const { ipcRenderer } = require('electron');

module.exports = {
  handleVendaEvents: function() {
    const vendaForm = document.querySelector('#vendaForm');
    if (vendaForm) {
      vendaForm.addEventListener('submit', (event) => {
        event.preventDefault();

        // Obtém os valores do formulário das vendas
        const cliente = document.getElementById('cliente').value;
        const tipo = document.getElementById('tipo').value;
        const descricao = document.getElementById('descricao').value;
        const preco = document.getElementById('preco').value;
        const quantidade = document.getElementById('quantidade').value;
        const dataVenda = new Date().toISOString(); 
        const tipos = document.getElementById('tipo').value;

        let dados;
        if (tipos === 'roupa') {
          const genero = document.getElementById('genero').value;
          const marca = document.getElementById('marca').value;
          const categoria = document.getElementById('categoria').value;
          // Inclui genero e marca nos dados enviados
          dados = { cliente, tipo, genero, categoria, marca, descricao, preco, quantidade, dataVenda };
        } else if (tipos === 'objeto') {
          // Exclui genero e marca dos dados enviados
          dados = { cliente, tipo, descricao, preco, quantidade, dataVenda };
        }

        // Envia um evento IPC com os valores do formulário
        ipcRenderer.send('submit-venda', dados);
      });
    }
  }
};

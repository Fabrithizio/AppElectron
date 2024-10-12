// Importa o módulo ipcRenderer do Electron
const { ipcRenderer } = require('electron');

function historico() {
  // Obtém o termo de pesquisa do campo de entrada
  var searchTerm = document.getElementById('search').value;
  // Envia o termo de pesquisa para o processo principal para obter o histórico de vendas e pagamentos do cliente
  ipcRenderer.send('historico-vendas', searchTerm);
  ipcRenderer.send('historico-pagamentos', searchTerm);
}





function verClientes() {
  ipcRenderer.send('buscar-clientes');
}

ipcRenderer.on('clientes-dados', (event, clientes) => {
  const modal = document.getElementById('modal');
  const modalText = document.getElementById('modal-text');
  modalText.innerHTML = clientes.map(cliente => `
      <p>Nome: ${cliente.nome}</p>
      <p>CPF: ${cliente.cpf}</p>
      <p>Endereço: ${cliente.endereco}</p>
      <hr>
  `).join('');
  modal.style.display = 'block';
});

document.querySelector('.close-button').addEventListener('click', () => {
  document.getElementById('modal').style.display = 'none';
});



ipcRenderer.on('historico-vendas-results', (event, rows) => {
  var results = document.getElementById('historico-div');
  results.innerHTML = '';

  // Cria um novo elemento de título e adiciona ao início dos resultados de vendas
  var tituloVendas = document.createElement('h2');
  tituloVendas.textContent = 'Compras do Cliente';
  results.appendChild(tituloVendas);

  // Cria a tabela e o cabeçalho
  var table = document.createElement('table');
  var header = table.createTHead();
  var row = header.insertRow(0);
  var cell1 = row.insertCell(0);
  var cell2 = row.insertCell(1);
  var cell3 = row.insertCell(2);
  cell1.innerHTML = "<b>Descrição da Venda</b>";
  cell2.innerHTML = "<b>Preço</b>";
  cell3.innerHTML = "<b>Data da Compra</b>"; 

 // Adiciona os dados à tabela
for (var i = rows.length - 1; i >= 0; i--) {
  var row = table.insertRow(-1);
  var cell1 = row.insertCell(0);
  var cell2 = row.insertCell(1);
  var cell3 = row.insertCell(2);
  cell1.textContent = rows[i].descricao;
  cell2.textContent = 'R$ ' + rows[i].preco.toLocaleString('pt-BR', {minimumFractionDigits: 2});
  var dataCompra = new Date(rows[i].dataVenda); // Usa dataVenda em vez de data_compra
  var dia = dataCompra.getUTCDate(); // Usa getUTCDate em vez de getDate
  var mes = dataCompra.getUTCMonth() + 1; // Usa getUTCMonth em vez de getMonth
  var ano = dataCompra.getUTCFullYear(); // Usa getUTCFullYear em vez de getFullYear
  cell3.textContent = dia + '/' + mes + '/' + ano; // Adiciona a data da compra
}


  // Adiciona a tabela aos resultados
  results.appendChild(table);

  // Torna a div visível
  results.style.display = 'block';
});

document.addEventListener('click', function(event) {
  var historicoDiv = document.getElementById('historico-div');
  var isClickInside = historicoDiv.contains(event.target);

  if (!isClickInside) {
    // O usuário clicou fora da div, esconde a div
    historicoDiv.style.display = 'none';
  }
});

ipcRenderer.on('historico-pagamentos-results', (event, rows) => {
  var results = document.getElementById('historico-div');

  // Cria um novo elemento de título e adiciona ao início dos resultados de pagamentos
  var tituloPagamentos = document.createElement('h2');
  tituloPagamentos.textContent = 'Pagamentos Feitos pelo Cliente';
  results.appendChild(tituloPagamentos);

  // Cria a tabela e o cabeçalho
  var table = document.createElement('table');
  var header = table.createTHead();
  var row = header.insertRow(0);
  var cell1 = row.insertCell(0);
  var cell2 = row.insertCell(1);
  var cell3 = row.insertCell(2);
  var cell4 = row.insertCell(3);
  var cell5 = row.insertCell(4); // Adiciona a coluna para a descrição do pagamento
  cell1.innerHTML = "<b>Valor Pago</b>";
  cell2.innerHTML = "<b>Dívida Anterior</b>";
  cell3.innerHTML = "<b>Dívida Restante</b>";
  cell4.innerHTML = "<b>Data de Pagamento</b>";
  cell5.innerHTML = "<b>Descrição</b>"; 

  // Adiciona os dados à tabela
  for (var i = rows.length - 1; i >= 0; i--) {
      var row = table.insertRow(-1);
      var cell1 = row.insertCell(0);
      var cell2 = row.insertCell(1);
      var cell3 = row.insertCell(2);
      var cell4 = row.insertCell(3);
      var cell5 = row.insertCell(4); // Adiciona a célula para a descrição do pagamento
      cell1.textContent = 'R$ ' + rows[i].valor_pago.toLocaleString('pt-BR', {minimumFractionDigits: 2}); // Formata o valor pago
      cell2.textContent = 'R$ ' + rows[i].divida_anterior.toLocaleString('pt-BR', {minimumFractionDigits: 2}); // Formata a dívida anterior
      cell3.textContent = 'R$ ' + rows[i].divida_restante.toLocaleString('pt-BR', {minimumFractionDigits: 2}); // Formata a dívida restante
      var dataPagamento = new Date(rows[i].data_pagamento);
      var dia = dataPagamento.getUTCDate();
      var mes = dataPagamento.getUTCMonth() + 1;
      var ano = dataPagamento.getUTCFullYear();
      cell4.textContent = dia + '/' + mes + '/' + ano;

  }

  // Adiciona a tabela aos resultados
  results.appendChild(table);

  // Torna a div visível
  results.style.display = 'block';
});

// Função para lidar com a funcionalidade de auto-completar
function autocomplete() {
    // Obtém o termo de pesquisa do campo de entrada
    var searchTerm = document.getElementById('search').value;
    // Se o termo de pesquisa estiver vazio, limpa os resultados e retorna
    if (searchTerm === '') {
        document.getElementById('results').innerHTML = '';
        return;
    }
    // Envia o termo de pesquisa para o processo principal para obter os resultados de auto-completar
    ipcRenderer.send('autocomplete-pesquisa', searchTerm);
}

// Quando a janela é carregada, adiciona os ouvintes de eventos
window.onload = function() {
    // Obtém o campo de entrada de pesquisa
    var searchInput = document.getElementById('search');
    // Adiciona um ouvinte de evento para chamar a função de auto-completar sempre que o valor do campo de entrada muda
    searchInput.addEventListener('input', autocomplete);
    // Adiciona um ouvinte de evento para chamar a função de pesquisa quando o botão "Pesquisar" é clicado
    document.getElementById('pesquisar').addEventListener('click', search);
}

// Função para lidar com a funcionalidade de pesquisa
function search() { 
    // Obtém o termo de pesquisa do campo de entrada
    var searchTerm = document.getElementById('search').value;
    // Envia o termo de pesquisa para o processo principal para obter os resultados da pesquisa
    ipcRenderer.send('search', searchTerm);
}

// Ouvinte de evento para lidar com os resultados de auto-completar
ipcRenderer.on('autocomplete-results', (event, rows) => {
    // Obtém o elemento de resultados
    var results = document.getElementById('results');
    // Limpa os resultados existentes
    results.innerHTML = '';
    // Itera sobre os resultados de auto-completar
    for (var i = 0; i < rows.length; i++) {
        // Cria um novo elemento para cada resultado
        var result = document.createElement('div');
        // Define o texto do elemento para o nome do resultado
        result.textContent = rows[i].nome;
        // Adiciona um ouvinte de evento para preencher o campo de entrada com o nome quando o resultado é clicado
        result.addEventListener('click', function() {
            document.getElementById('search').value = this.textContent;
        });
        // Adiciona o elemento de resultado ao elemento de resultados
        results.appendChild(result);
    }
});

function criarCallbackPagamento(row, pagamento) {
  return function() {
    var valorPagamento = parseFloat(pagamento.value);
    var dividaAnterior = row.divida;
    
    if (isNaN(valorPagamento) || valorPagamento <= 0) {
      showModal('Por favor, insira um valor de pagamento válido.');
      return;
    }
    
    // Verifica se o valor do pagamento é maior do que a dívida
    if (valorPagamento > dividaAnterior) {
      showModal('O valor do pagamento não pode ser maior do que a dívida.');
      return;
    }
    
    var dividaRestante = dividaAnterior - valorPagamento;
    var nomePagador = row.nome;


    // Obtém a data atual no formato 'DD/MM/YYYY'
var dataPagamento = new Date().toLocaleDateString('pt-BR');


    // Envia um evento IPC com os detalhes do pagamento
    ipcRenderer.send('registrar-pagamento', { nomePagador, dividaAnterior, valorPagamento, dividaRestante, dataPagamento });

    // Exibe uma mensagem de sucesso
    showModal('Pagamento Efetuado');

    // Limpa o campo de entrada
    pagamento.value = '';
  };
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

  
    //ouvinte para mostrar os dados do cliente
ipcRenderer.on('search-results', (event, rows) => {
    var results = document.getElementById('results-dados');
    results.innerHTML = '';

    for (var i = 0; i < rows.length; i++) {
        var result = document.createElement('div');

         // Cria um novo elemento de título e adiciona ao início do resultado
        var titulo = document.createElement('h2');
        titulo.textContent = 'Dados do Cliente';
        result.appendChild(titulo);

        // Cria um novo elemento para cada campo do resultado
        var nome = document.createElement('p');
        nome.textContent = 'Nome: ' + rows[i].nome;
        nome.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(nome);

        var dataNascimento = document.createElement('p');
        var data = new Date(rows[i].DataNascimento + 'T00:00:00');
        var dia = ("0" + data.getDate()).slice(-2); // Adiciona um zero à esquerda se o dia for menor que 10
        var mes = ("0" + (data.getMonth() + 1)).slice(-2); // Adiciona um zero à esquerda se o mês for menor que 10
        var ano = data.getFullYear();
        dataNascimento.textContent = 'Data de Nascimento: ' + dia + '/' + mes + '/' + ano;
        dataNascimento.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(dataNascimento);
        

        var cpf = document.createElement('p');
        cpf.textContent = 'CPF: ' + rows[i].cpf;
        cpf.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(cpf);

        var rg = document.createElement('p');
        rg.textContent = 'RG: ' + rows[i].rg;
        rg.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(rg);

        var endereco = document.createElement('p');
        endereco.textContent = 'Endereço: ' + rows[i].endereco;
        endereco.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(endereco);

        var telefone = document.createElement('p');
        telefone.textContent = 'Telefone: ' + rows[i].telefone;
        telefone.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(telefone);

        var email = document.createElement('p');
        email.textContent = 'Email: ' + rows[i].email;
        email.className = 'field'; // Adiciona uma classe ao elemento do campo
        result.appendChild(email);

        
        var divida = document.createElement('p');
        divida.textContent = 'Dívida Atual: ' + rows[i].divida;
        divida.className = 'field';
        result.appendChild(divida);

        var DataPagamento = document.createElement('p');
        var data = new Date(rows[i].dataPagamento + 'T00:00:00');
        var dia = ("0" + data.getDate()).slice(-2); // Adiciona um zero à esquerda se o dia for menor que 10
        var mes = ("0" + (data.getMonth() + 1)).slice(-2); // Adiciona um zero à esquerda se o mês for menor que 10
        var ano = data.getFullYear();
        DataPagamento.textContent = 'Data de Pagamento: ' + dia + '/' + mes + '/' + ano;
        DataPagamento.className = 'field';
        result.appendChild(DataPagamento);


        var titoloPagamento = document.createElement('h2');
        titoloPagamento.textContent = 'Pagamento do Cliente';
        result.appendChild(titoloPagamento);
       
        var pagamento = document.createElement('input');
        pagamento.type = 'number';
        pagamento.placeholder = 'Valor do pagamento';
        result.appendChild(pagamento);

        var botaoPagamento = document.createElement('button');
        botaoPagamento.textContent = 'Pagar';
        result.appendChild(botaoPagamento);

        botaoPagamento.addEventListener('click', criarCallbackPagamento(rows[i], pagamento));
        // Adiciona o elemento de resultado ao elemento de resultados
        results.appendChild(result);

        //botao que remover o cliente do banco de dados

        for (var i = 0; i < rows.length; i++) {
          var botaoRemover = document.createElement('button');
          botaoRemover.className = 'ButomDeletDadosCliente'
          botaoRemover.textContent = 'Remover';
          botaoRemover.dataset.id = rows[i].id;
          result.appendChild(botaoRemover);
      
          botaoRemover.addEventListener('click', function(e) {
            var idCliente = this.dataset.id;
            ipcRenderer.send('confirm-remove-cliente', idCliente);
            console.log(idCliente)
        });
        
        ipcRenderer.on('cliente-removido', (event, idCliente) => {
          console.log('Cliente removido:', idCliente);
          location.reload(); // Atualiza a página
        });
        
      }
      
      
  }



});

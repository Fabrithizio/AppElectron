// Importa o módulo ipcRenderer do Electron
const { ipcRenderer } = require('electron');

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

function criarCallbackPagamento(row,pagamento) {
    return function() {
        var valorPagamento = parseFloat(pagamento.value);
        var novaDivida = row.divida - valorPagamento;

        // Envia um evento IPC com o novo valor da dívida
        ipcRenderer.send('registrar-pagamento', { id: row.id, divida: novaDivida, pagamento: valorPagamento });
    };
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
    }
});
(function() {
    const { ipcRenderer } = require('electron');

    // Função para lidar com a funcionalidade de auto-completar o nome do cliente
    function autocompleteClientName() {
        // Obtém o nome do cliente do campo de entrada
        var clientName = document.getElementById('cliente').value;
        // Se o nome do cliente estiver vazio, limpa os resultados e retorna
        if (clientName === '') {
            document.getElementById('autocomplete-list').innerHTML = '';
            return;
        }
        // Envia o nome do cliente para o processo principal para obter os resultados de auto-completar
        ipcRenderer.send('autocomplete-client-name', clientName);
    }

    // Quando a janela é carregada, adiciona os ouvintes de eventos
    window.onload = function() {
        // Obtém o campo de entrada do nome do cliente
        var clientNameInput = document.getElementById('cliente');
        // Adiciona um ouvinte de evento para chamar a função de auto-completar sempre que o valor do campo de entrada muda
        clientNameInput.addEventListener('input', autocompleteClientName);
        // Mantém os outros ouvintes de eventos existentes
        // ...
    }

    // Ouvinte de evento para lidar com os resultados de auto-completar o nome do cliente
    ipcRenderer.on('autocomplete-client-name-results', (event, rows) => {
        // Obtém o elemento de resultados
        var results = document.getElementById('autocomplete-list');
        // Limpa os resultados existentes
        results.innerHTML = '';
        // Itera sobre os resultados de auto-completar
        for (var i = 0; i < rows.length; i++) {
            // Cria um novo elemento para cada resultado
            var result = document.createElement('div');
            // Adiciona uma classe ao elemento
            result.className = 'autocomplete-item';
            // Define o texto do elemento para o nome do resultado
            result.textContent = rows[i].nome;
            // Adiciona um ouvinte de evento para preencher o campo de entrada com o nome quando o resultado é clicado
            result.addEventListener('click', function() {
                document.getElementById('cliente').value = this.textContent;
                // Limpa o conteúdo do elemento 'autocomplete-list'
                document.getElementById('autocomplete-list').innerHTML = '';
            });
            // Adiciona o elemento de resultado ao elemento de resultados
            results.appendChild(result);
        }
    });
})();

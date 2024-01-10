// Inicialmente, não há transações
var transacoes = [];

// Função para adicionar uma transação

function adicionarTransacao(transacao) {
    // Adicione a transação ao array de transações
    transacoes.push(transacao);

    // Atualize a exibição do histórico
    atualizarHistorico();

    // Aqui você pode adicionar o código para salvar a transação no banco de dados
    // Por exemplo:
     db.run(`INSERT INTO Historico (NomeCliente, DataHora, TipoTransacao, ValorPago, DividaAnterior, DividaAtual) VALUES (?, ?, ?, ?, ?, ?)`,
         [transacao.NomeCliente, transacao.DataHora, transacao.TipoTransacao, transacao.ValorPago, transacao.DividaAnterior, transacao.DividaAtual]);
}


// Função para atualizar o histórico de transações na página
function atualizarHistorico() {
    var divHistorico = document.getElementById('historico');
    divHistorico.innerHTML = ''; // Limpa o histórico atual

    for (let transacao of transacoes) {
        var div = document.createElement('div');
        div.textContent = JSON.stringify(transacao);
        divHistorico.appendChild(div);
    }
}

// Aqui você pode adicionar o código para ouvir os eventos de pagamento e venda
// e chamar a função adicionarTransacao para cada um

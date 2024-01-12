const { ipcRenderer } = require('electron');

function inserirDadosNaTabela(dadosVendas) {
  const tabelaHistoricoVendas = document.getElementById('tabela-historico').getElementsByTagName('tbody')[0];
  tabelaHistoricoVendas.innerHTML = ''; // Limpa a tabela antes de adicionar novos dados

  dadosVendas.forEach(venda => {
    const linha = tabelaHistoricoVendas.insertRow(0);
    linha.insertCell(0).textContent = venda.id;
    linha.insertCell(1).textContent = venda.cliente;
    linha.insertCell(2).textContent = venda.tipo;
    linha.insertCell(3).textContent = venda.genero;
    linha.insertCell(4).textContent = venda.categoria;
    linha.insertCell(5).textContent = venda.marca;
    linha.insertCell(6).textContent = venda.descricao;
    linha.insertCell(7).textContent = venda.preco.toFixed(2);
    linha.insertCell(8).textContent = venda.quantidade;
    linha.insertCell(9).textContent = venda.dataVenda;
    linha.insertCell(10).textContent = venda.metodoPagamento;
  });
}

document.addEventListener('DOMContentLoaded', (event) => {
  const botaoCarregar = document.getElementById('carregarHistorico');
  if (botaoCarregar) {
    botaoCarregar.addEventListener('click', () => {
      ipcRenderer.send('carregar-dados-historico-vendas');
    });
  }

  ipcRenderer.on('dados-historico-vendas', (event, dadosVendas) => {
    inserirDadosNaTabela(dadosVendas);
  });

  const botaoFiltrar = document.getElementById('filtrarPorData');
  const inputFiltroData = document.getElementById('filtroData');

  botaoFiltrar.addEventListener('click', () => {
    const dataSelecionada = inputFiltroData.value;
    ipcRenderer.send('filtrar-vendas-por-data', dataSelecionada);
  });

  ipcRenderer.on('resultado-filtro-data', (event, dadosVendasFiltradas) => {
    inserirDadosNaTabela(dadosVendasFiltradas);
  });
});






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


  
  // historico de pagamentos ↓↓↓
  const botaoCarregarPagamentos = document.getElementById('carregarHistoricoPagamentos');
  if (botaoCarregarPagamentos) {
    botaoCarregarPagamentos.addEventListener('click', () => {
      ipcRenderer.send('carregar-dados-historico-pagamentos');
    });
  }

  function inserirDadosNaTabelaPagamentos(dadosPagamentos) {
    const tabelaHistoricoPagamentos = document.getElementById('tabela-historico-pagamentos').getElementsByTagName('tbody')[0];
    tabelaHistoricoPagamentos.innerHTML = ''; // Limpa a tabela antes de adicionar novos dados
  
    dadosPagamentos.forEach(pagamento => {
      const linha = tabelaHistoricoPagamentos.insertRow(0);
      linha.insertCell(0).textContent = pagamento.nome_pagador;
      linha.insertCell(1).textContent = pagamento.divida_anterior.toFixed(2);
      linha.insertCell(2).textContent = pagamento.valor_pago.toFixed(2);
      linha.insertCell(3).textContent = pagamento.divida_restante.toFixed(2);
      linha.insertCell(4).textContent = pagamento.data_pagamento;
    });
  }
  // envia uma chamada para o main 
  ipcRenderer.on('dados-historico-pagamentos', (event, dadosPagamentos) => {
    inserirDadosNaTabelaPagamentos(dadosPagamentos);
  });

  //lida com o sistema de filtro para pagamentos

  const botaoFiltrarPagamentos = document.getElementById('filtrarPorDataPagamentos');
  const inputFiltroDataPagamentos = document.getElementById('filtroDataPagamentos');

  botaoFiltrarPagamentos.addEventListener('click', () => {
    const dataSelecionada = inputFiltroDataPagamentos.value;
    ipcRenderer.send('filtrar-pagamentos-por-data', dataSelecionada);
  });

  ipcRenderer.on('resultado-filtro-data-pagamentos', (event, dadosPagamentosFiltrados) => {
    inserirDadosNaTabelaPagamentos(dadosPagamentosFiltrados);
  });

});

document.addEventListener('DOMContentLoaded', (event) => {
  // Esconde os elementos específicos inicialmente
  const tabelaHistorico = document.getElementById('tabela-historico');
  const filtroData = document.getElementById('filtroData');
  const filtrarPorData = document.getElementById('filtrarPorData');
  const filtroImgHistorico = document.querySelector('.mid-bar > div:first-child .filtro');
  
  const tabelaHistoricoPagamentos = document.getElementById('tabela-historico-pagamentos');
  const filtroDataPagamentos = document.getElementById('filtroDataPagamentos');
  const filtrarPorDataPagamentos = document.getElementById('filtrarPorDataPagamentos');
  const filtroImgPagamentos = document.querySelector('.mid-bar > div:last-child .filtro');

  // Inicialmente, esconde todos os elementos de ambas as tabelas
  tabelaHistorico.style.display = 'none';
  filtroData.style.display = 'none';
  filtrarPorData.style.display = 'none';
  filtroImgHistorico.style.display = 'none';
  
  tabelaHistoricoPagamentos.style.display = 'none';
  filtroDataPagamentos.style.display = 'none';
  filtrarPorDataPagamentos.style.display = 'none';
  filtroImgPagamentos.style.display = 'none';

  // Função para mostrar o histórico de vendas e ocultar o histórico de pagamentos
  document.getElementById('carregarHistorico').addEventListener('click', () => {
    tabelaHistorico.style.display = 'block';
    filtroData.style.display = 'block';
    filtrarPorData.style.display = 'block';
    filtroImgHistorico.style.display = 'block';
    
    tabelaHistoricoPagamentos.style.display = 'none';
    filtroDataPagamentos.style.display = 'none';
    filtrarPorDataPagamentos.style.display = 'none';
    filtroImgPagamentos.style.display = 'none';
  });

  // Função para mostrar o histórico de pagamentos e ocultar o histórico de vendas
  document.getElementById('carregarHistoricoPagamentos').addEventListener('click', () => {
    tabelaHistorico.style.display = 'none';
    filtroData.style.display = 'none';
    filtrarPorData.style.display = 'none';
    filtroImgHistorico.style.display = 'none';
    
    tabelaHistoricoPagamentos.style.display = 'block';
    filtroDataPagamentos.style.display = 'block';
    filtrarPorDataPagamentos.style.display = 'block';
    filtroImgPagamentos.style.display = 'block';
  });
});








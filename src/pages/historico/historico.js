const { ipcRenderer } = require('electron');

function inserirDadosNaTabela(dadosVendas) {
  const tabelaHistoricoVendas = document.getElementById('tabela-historico').getElementsByTagName('tbody')[0];
  tabelaHistoricoVendas.innerHTML = ''; 

  dadosVendas.forEach(venda => {
    const linha = tabelaHistoricoVendas.insertRow(0);
    linha.insertCell(0).textContent = venda.id;
    linha.insertCell(1).textContent = venda.cliente;
    linha.insertCell(2).textContent = venda.descricao;
    linha.insertCell(3).textContent = venda.preco.toFixed(2);

    // Converte a data do formato ISO para o formato local
    const dataVenda = new Date(venda.dataVenda);
    const dataVendaLocal = dataVenda.toLocaleDateString('pt-BR');
    linha.insertCell(4).textContent = dataVendaLocal;
    linha.insertCell(5).textContent = venda.metodoPagamento;
    const deleteCell = linha.insertCell(6);
  deleteCell.innerHTML = `<button class="delete-button" data-id="${venda.id}">X</button>`;
});

let deleteButtons = document.querySelectorAll('.delete-button');
deleteButtons.forEach(button => {
  let newButton = button.cloneNode(true);
  button.parentNode.replaceChild(newButton, button);
});

deleteButtons = document.querySelectorAll('.delete-button');
deleteButtons.forEach(button => {
  button.addEventListener('click', (event) => {
    const id = event.target.getAttribute('data-id');
    ipcRenderer.send('confirm-delete', id);
  });
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
      
      const celulaDividaAnterior = linha.insertCell(1);
      celulaDividaAnterior.textContent = pagamento.divida_anterior.toFixed(2);
      celulaDividaAnterior.classList.add('divida-anterior');
    
      const celulaValorPago = linha.insertCell(2);
      celulaValorPago.textContent = pagamento.valor_pago.toFixed(2);
      celulaValorPago.classList.add('valor-pago');
    
      const celulaDividaRestante = linha.insertCell(3);
      celulaDividaRestante.textContent = pagamento.divida_restante.toFixed(2);
      celulaDividaRestante.classList.add('divida-restante');
    
      // Converte a data do formato ISO para o formato local
      const dataPagamento = new Date(pagamento.data_pagamento);
      const dataPagamentoLocal = dataPagamento.toLocaleDateString('pt-BR');
      linha.insertCell(4).textContent = dataPagamentoLocal;
    });
    
  }
  // envia uma chamada para o main 
  ipcRenderer.on('dados-historico-pagamentos', (event, dadosPagamentos) => {
    inserirDadosNaTabelaPagamentos(dadosPagamentos);
  });

  //lida com o sistema de filtro para pagamentos

// No arquivo historico.js
const botaoFiltrarPagamentos = document.getElementById('filtrarPorDataPagamentos');
botaoFiltrarPagamentos.addEventListener('click', () => {
  const dataSelecionada = new Date(document.getElementById('filtroDataPagamentos').value).toISOString().split('T')[0];
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








const { ipcRenderer } = require('electron');
const moment = require('moment');

// Função para inserir dados na tabela de vendas
function inserirDadosNaTabela(dadosVendas) {
  const tabelaHistoricoVendas = document.getElementById('tabela-historico').getElementsByTagName('tbody')[0];
  tabelaHistoricoVendas.innerHTML = ''; 

  dadosVendas.forEach(venda => {
    const linha = tabelaHistoricoVendas.insertRow(0);
    linha.insertCell(0).textContent = venda.id;
    linha.insertCell(1).textContent = venda.cliente;
    var descricao = venda.descricao.split('\n');
    var descricaoFormatada = '';
    for (var i = 0; i < descricao.length; i++) {
      descricao[i] = descricao[i].replace('Item:', '<span style="color: maroon; font-weight: bold;">Item:</span>');
      descricao[i] = descricao[i].replace('Quant:', '<span style="color: blue; font-weight: bold;">Quant:</span>');
      descricao[i] = descricao[i].replace('Valor: R$', '<span style="color: green; font-weight: bold;">Valor: R$ </span>');
      descricaoFormatada += descricao[i] + '<br>';
    }
    linha.insertCell(2).innerHTML = descricaoFormatada;
    linha.insertCell(3).textContent = 'R$ ' + venda.preco.toFixed(2);
  
    const dataVenda = venda.dataVenda;
    const partesData = dataVenda.split('-');
    const dataFormatada = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;
    linha.insertCell(4).textContent = dataFormatada;
    
    linha.insertCell(5).textContent = venda.metodoPagamento;
    const deleteCell = linha.insertCell(6);
    deleteCell.innerHTML = `<button class="delete-button" data-id="${venda.id}">X</button>`;
  });

  // Adiciona eventos de clique aos botões de exclusão de vendas
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

// Função para inserir dados na tabela de pagamentos
function inserirDadosNaTabelaPagamentos(dadosPagamentos) {
  const tabelaHistoricoPagamentos = document.getElementById('tabela-historico-pagamentos').getElementsByTagName('tbody')[0];
  tabelaHistoricoPagamentos.innerHTML = ''; 

  dadosPagamentos.forEach(pagamento => {
    const linha = tabelaHistoricoPagamentos.insertRow(0);
    linha.insertCell(0).textContent = pagamento.nome_pagador;
    
    const celulaDividaAnterior = linha.insertCell(1);
    celulaDividaAnterior.textContent = 'R$ ' + pagamento.divida_anterior.toFixed(2);
    celulaDividaAnterior.classList.add('divida-anterior');
  
    const celulaValorPago = linha.insertCell(2);
    celulaValorPago.textContent = 'R$ ' + pagamento.valor_pago.toFixed(2);
    celulaValorPago.classList.add('valor-pago');
  
    const celulaDividaRestante = linha.insertCell(3);
    celulaDividaRestante.textContent = 'R$ ' + pagamento.divida_restante.toFixed(2);
    celulaDividaRestante.classList.add('divida-restante');
  
    const dataPagamento = pagamento.data_pagamento;
    const dataFormatada = moment(dataPagamento).format('DD/MM/YYYY');
    linha.insertCell(4).textContent = dataFormatada;

    const deleteCell = linha.insertCell(5);
    deleteCell.innerHTML = `<button class="delete-button" data-id="${pagamento.id}">X</button>`;
  });

  // Adiciona eventos de clique aos botões de exclusão de pagamentos
  let deleteButtons = document.querySelectorAll('.delete-button');
  deleteButtons.forEach(button => {
    let newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
  });

  deleteButtons = document.querySelectorAll('.delete-button');
  deleteButtons.forEach(button => {
    button.addEventListener('click', (event) => {
      const id = event.target.getAttribute('data-id');
      ipcRenderer.send('confirm-delete-payment', id);
    });
  });
}

document.addEventListener('DOMContentLoaded', (event) => {
  // Carregar histórico de vendas
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

  // Carregar histórico de pagamentos
  const botaoCarregarPagamentos = document.getElementById('carregarHistoricoPagamentos');
  if (botaoCarregarPagamentos) {
    botaoCarregarPagamentos.addEventListener('click', () => {
      ipcRenderer.send('carregar-dados-historico-pagamentos');
    });
  }

  ipcRenderer.on('dados-historico-pagamentos', (event, dadosPagamentos) => {
    inserirDadosNaTabelaPagamentos(dadosPagamentos);
  });

  const botaoFiltrarPagamentos = document.getElementById('filtrarPorDataPagamentos');
  const inputFiltroDataPagamentos = document.getElementById('filtroDataPagamentos');

  botaoFiltrarPagamentos.addEventListener('click', () => {
    const dataSelecionada = new Date(inputFiltroDataPagamentos.value).toISOString().split('T')[0];
    ipcRenderer.send('filtrar-pagamentos-por-data', dataSelecionada);
  });

  ipcRenderer.on('resultado-filtro-data-pagamentos', (event, dadosPagamentosFiltrados) => {
    inserirDadosNaTabelaPagamentos(dadosPagamentosFiltrados);
  });

  // Atualiza a interface após a exclusão de um pagamento
  ipcRenderer.on('delete-payment-success', (event, id) => {
    const rowToDelete = document.querySelector(`button[data-id="${id}"]`).closest('tr');
    rowToDelete.remove();
  });

  // Calcula e exibe o total de pagamentos filtrados
  ipcRenderer.on('resultado-filtro-data-pagamentos', (event, dadosPagamentosFiltrados) => {
    const totalPagamentos = dadosPagamentosFiltrados.reduce((total, pagamento) => total + pagamento.valor_pago, 0);
    const totalFormatado = totalPagamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const divTotalPagamentos = document.getElementById('totalPagamentos');
    divTotalPagamentos.textContent = `Total: R$ ${totalFormatado}`;
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








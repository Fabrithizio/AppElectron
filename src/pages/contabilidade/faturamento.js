const { ipcRenderer } = require('electron');

let metodosPagamento = ['Pix', 'Especie', 'Fiado', 'Debito', 'Credito'];
let vendas = [];
let totalVendas;
let dataInicio, dataFim; // Defina as variáveis aqui

ipcRenderer.on('getTotalVendasPorMetodoPagamentoResponse', (event, data) => {
  vendas.push({metodo: data.metodoPagamento, valor: data.totalVendas});
  if (vendas.length === metodosPagamento.length) {
    exibirBaloes();
  }
});

ipcRenderer.on('getTotalVendasResponse', (event, data) => {
  totalVendas = data;
  metodosPagamento.forEach(metodoPagamento => {
    ipcRenderer.send('getTotalVendasPorMetodoPagamento', metodoPagamento, dataInicio, dataFim);
  });
});

function buscarDados() {
  vendas = []; // Limpa o array de vendas

  dataInicio = document.getElementById('dataInicio').value; // Atualize as variáveis aqui
  dataFim = document.getElementById('dataFim').value; // Atualize as variáveis aqui

  if (!dataInicio || !dataFim) {
    // As datas de início ou fim não são válidas
    console.error('Por favor, insira datas de início e fim válidas.');
    return;
  }

  ipcRenderer.send('getTotalVendas', dataInicio, dataFim);

  metodosPagamento.forEach(metodoPagamento => {
    ipcRenderer.send('getTotalVendasPorMetodoPagamento', metodoPagamento, dataInicio, dataFim);
  });
}


function exibirBaloes() {
  
  let baloesDiv = document.getElementById('baloes');
  baloesDiv.innerHTML = ''; // Limpa o conteúdo da div
  vendas.forEach(venda => {
    if (venda.valor != null && totalVendas != null) {
      let porcentagem = ((venda.valor / totalVendas) * 100).toFixed(2);
      baloesDiv.innerHTML += `
        <div class="balao ${venda.metodo.toLowerCase()}">
          <div class="metodo">${venda.metodo}</div>
          <div class="valor">R$ ${venda.valor.toFixed(2)}</div>
          <div class="porcentagem">${porcentagem}% do total</div>
        </div>
      `;
    }
  });
  // Exibir o valor total
  if (totalVendas != null) {
    baloesDiv.innerHTML += `
      <div class="balao total">
        <div class="metodo">Total</div>
        <div class="valor">R$ ${totalVendas.toFixed(2)}</div>
        <div class="porcentagem">100% do total</div>
      </div>
    `;
  }
}



const botaoBuscar = document.querySelector('.buscar');
const divTotalIntervaloPagamentos = document.getElementById('totalIntervaloPagamentos');

botaoBuscar.addEventListener('click', () => {
  const dataInicio = new Date(document.getElementById('dataInicio').value).toISOString().split('T')[0];
  const dataFim = new Date(document.getElementById('dataFim').value).toISOString().split('T')[0];
  ipcRenderer.send('filtrar-pagamentos-por-intervalo', { dataInicio, dataFim });
});

ipcRenderer.on('resultado-filtro-intervalo-pagamentos', (event, dadosPagamentosFiltrados) => {
  const totalPagamentos = dadosPagamentosFiltrados.reduce((total, pagamento) => total + pagamento.valor_pago, 0);
  const totalFormatado = totalPagamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  divTotalIntervaloPagamentos.textContent = `Total no intervalo: R$ ${totalFormatado}`;
});

const { ipcRenderer } = require('electron');

let metodosPagamento = ['Pix', 'Especie', 'Fiado', 'Debito', 'Credito'];
let vendas = [];
let totalVendas;

ipcRenderer.on('getTotalVendasPorMetodoPagamentoResponse', (event, data) => {
  vendas.push({metodo: data.metodoPagamento, valor: data.totalVendas});
  if (vendas.length === metodosPagamento.length) {
    exibirBaloes();
  }
});

ipcRenderer.on('getTotalVendasResponse', (event, data) => {
  totalVendas = data;
  metodosPagamento.forEach(metodo => {
    ipcRenderer.send('getTotalVendasPorMetodoPagamento', metodo);
  });
});

ipcRenderer.send('getTotalVendas');

function exibirBaloes() {
    let baloesDiv = document.getElementById('baloes');
    vendas.forEach(venda => {
      let porcentagem = ((venda.valor / totalVendas) * 100).toFixed(2);
      baloesDiv.innerHTML += `
        <div class="balao ${venda.metodo.toLowerCase()}">
          <div class="metodo">${venda.metodo}</div>
          <div class="valor">R$ ${venda.valor.toFixed(2)}</div>
          <div class="porcentagem">${porcentagem}% do total</div>
        </div>
      `;
    });
    // Exibir o valor total
    baloesDiv.innerHTML += `
      <div class="balao total">
        <div class="metodo">Total</div>
        <div class="valor">R$ ${totalVendas.toFixed(2)}</div>
        <div class="porcentagem">100% do total</div>
      </div>
    `;
  }
  
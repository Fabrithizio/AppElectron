const { ipcRenderer } = require('electron');

// No processo principal
function insertVenda({ cliente, tipo, genero = '', categoria = '', marca = '', metodoPagamento, descricao, preco, quantidade, dataVenda }) {
  db.serialize(() => {
    // Cria a tabela vendas se não existir
    db.run('CREATE TABLE IF NOT EXISTS vendas (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente TEXT, tipo TEXT, genero TEXT, categoria TEXT, marca TEXT,metodoPagamento TEXT, descricao TEXT, preco REAL, quantidade INTEGER, dataVenda TEXT)');

    // Insere os valores no banco de dados
    db.run('INSERT INTO vendas (cliente, tipo, genero, categoria, marca, metodoPagamento, descricao, preco, quantidade, dataVenda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [cliente, tipo, genero, categoria, marca, metodoPagamento, descricao, preco, quantidade, dataVenda], (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Venda inserida com sucesso.');
        // Emite um evento IPC com os detalhes da venda
        mainWindow.webContents.send('venda-inserida', { cliente, tipo, genero, categoria, marca, metodoPagamento, descricao, preco, quantidade, dataVenda });
      }
    });
  });
}

// No processo de renderização
ipcRenderer.on('venda-inserida', (event, venda) => {
  // Adiciona a venda ao histórico de vendas
  const vendaDiv = document.createElement('div');
  vendaDiv.className = 'historico';

  const titulo = document.createElement('h2');
  titulo.textContent = 'Venda para ' + venda.cliente;
  vendaDiv.appendChild(titulo);

  const tipoP = document.createElement('p');
  tipoP.textContent = 'Tipo: ' + venda.tipo;
  vendaDiv.appendChild(tipoP);

  // Adicione mais campos conforme necessário...

  historicoVendas.prepend(vendaDiv);  // Adiciona a venda no topo do histórico
});


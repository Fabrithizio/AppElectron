# AppElectron
App feito em electron para gerenciar uma pequena loja de roupase artigos
voce deve instalar o electron e o sqlite3 no seu projeto e adicionar o npm start ao seu arquivo packae.json


o sistemas que voce forneceu esta muit bom, agora eu gostaria de fazer o mesmo com o sitema de pagamentos. voce precisa de algo para poder mandar os codigo para isso ? ele tambem deve ser mostrado aqui no mesmo lugar e o que voce acha mais correto ter outro butao para mostra os dados dos pagamentos e outro para vendas ou voce sabe como fazer para mostra os 2 jusntos 









ipcMain.on('carregar-dados-historico-vendas', (event) => {
  db.all('SELECT * FROM vendas', [], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('dados-historico-vendas', rows);
  });
});




ipcMain.on('carregar-dados-historico-pagamentos', (event) => {
  db.all('SELECT * FROM Pagamentos', [], (err, rows) => {
    if (err) {
      event.sender.send('erro', 'Não foi possível carregar o histórico de pagamentos.');
    } else {
      event.sender.send('dados-historico-pagamentos', rows);
    }
  });
});


ipcMain.on('filtrar-vendas-por-data', (event, dataSelecionada) => {
  db.all('SELECT * FROM vendas WHERE dataVenda LIKE ?', [`${dataSelecionada}%`], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('resultado-filtro-data', rows);
  });
});


ipcMain.on('filtrar-pagamentos-por-data', (event, dataSelecionada) => {
  const dataISO = new Date(dataSelecionada).toISOString().split('T')[0];
  db.all('SELECT * FROM Pagamentos WHERE DATE(data_pagamento) = ?', [dataISO], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('resultado-filtro-data-pagamentos', rows);
  });
});




ipcMain.on('registrar-divida', (event, { cliente, divida }) => {
  db.serialize(() => {
      // Adiciona o valor da dívida à dívida atual do cliente na tabela Clientes
      db.run('UPDATE Clientes SET divida = divida + ? WHERE nome = ?', [divida, cliente]);
  });
});

ipcMain.on('registrar-pagamento', (event, { nomePagador, dividaAnterior, valorPagamento, dataHoraPagamento }) => {
  const dividaRestante = dividaAnterior - valorPagamento;

  db.serialize(() => {
    // Atualiza a dívida do cliente na tabela Clientes
    db.run('UPDATE Clientes SET divida = ? WHERE nome = ?', [dividaRestante, nomePagador], function(err) {
      if (err) {
        event.sender.send('erro', 'Erro ao atualizar a dívida do cliente: ' + err.message);
        return;
      }

     
      db.run('INSERT INTO Pagamentos (nome_pagador, divida_anterior, valor_pago, divida_restante, data_pagamento) VALUES (?, ?, ?, ?, ?)', [nomePagador, dividaAnterior, valorPagamento, dividaRestante, dataHoraPagamento], function(err) {
        if (err) {
          event.sender.send('erro', 'Erro ao registrar o pagamento: ' + err.message);
          return;
        }

        
        event.sender.send('pagamento-registrado', 'Pagamento registrado com sucesso.');
      });
    });
  });
});

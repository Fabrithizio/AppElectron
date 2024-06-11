const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { db, insertCliente, insertVenda, updateCliente, somaVendas,somaVendasPorMetodoPagamento } = require('./database.js');
const moment = require('moment');


// sistema pesquisar historico do sitema de pesquisa 
ipcMain.on('historico-vendas', (event, searchTerm) => {
  db.all('SELECT * FROM vendas WHERE cliente = ?', [searchTerm], function (err, rows) {
      if (err) {
          console.error(err);
          return;
      }
      event.sender.send('historico-vendas-results', rows);
  });
});
//sistems para pesquisar pagamentso do sitema de pesquisa 
ipcMain.on('historico-pagamentos', (event, searchTerm) => {
  db.all('SELECT * FROM pagamentos WHERE nome_pagador = ?', [searchTerm], function (err, rows) {
      if (err) {
          console.error(err);
          return;
      }
      event.sender.send('historico-pagamentos-results', rows);
  });
});






app.on('ready', () => {
  let dataAtual = new Date();
  let dia = ("0" + dataAtual.getDate()).slice(-2); // Adiciona um zero à esquerda se o dia for menor que 10
  let mes = ("0" + (dataAtual.getMonth() + 1)).slice(-2); // Adiciona um zero à esquerda se o mês for menor que 10

  db.all("SELECT * FROM clientes WHERE strftime('%m-%d', DataNascimento) = ?", [mes + '-' + dia], (err, rows) => {
    if (err) {
      throw err;
    }
    rows.forEach((row) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Aniversário do Cliente',
        message: `Hoje é o aniversário do cliente ${row.nome.toUpperCase()}.`
      });
    });
  });
});

ipcMain.on('verificar-pagamentos', (event) => {
  // Obtém a data atual do sistema e define a hora para meia-noite
  let dataAtual = new Date();
  dataAtual.setHours(0, 0, 0, 0);
  let diaAtual = dataAtual.getDate();

  db.all("SELECT * FROM clientes", (err, rows) => {
    if (err) {
      throw err;
    }

    if (rows.length === 0) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Verificação de Pagamentos',
        message: 'Não há pagamentos para hoje.'
      });
    } else {
      let encontrouPagamento = false;
      let clientesComPagamento = [];
      rows.forEach((row) => {
        // Converte a data de pagamento do cliente para o formato de data padrão do sistema e define a hora para meia-noite
        let partesData = row.dataPagamento.split('-');
        let dataPagamento = new Date(partesData[0], partesData[1] - 1, partesData[2]);
        dataPagamento.setHours(0, 0, 0, 0);
        let diaPagamento = dataPagamento.getDate();

        // Compara a data de pagamento com a data atual
        let dataIgual = diaAtual === diaPagamento;

        if (dataIgual) {
          encontrouPagamento = true;
          clientesComPagamento.push(row.nome.toUpperCase());
        }
      });

      if (!encontrouPagamento) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Verificação de Pagamentos',
          message: 'Não há clientes com pagamentos a vencer hoje.'
        });
      } else {
        dialog.showMessageBox({
          type: 'warning',
          title: `Alerta de Pagamento`,
          message: `//Clientes Na Data de Pagamento// \n > ${clientesComPagamento.join('\n >')}.`
        });
      }
    }
  });
});




// envia o comando para remover o cliente cadastrado do banco de dados 
ipcMain.on('confirm-remove-cliente', (event, idCliente) => {
  var options = {
    type: 'question',
    buttons: ['Cancelar', 'Excluir'],
    defaultId: 1,
    title: 'Confirmação',
    message: 'Tem certeza de que deseja remover o cliente com ID ' + idCliente + '?',
  };

  dialog.showMessageBox(null, options).then((response) => {
      if (response.response === 1) {
          db.serialize(() => {
            db.run('DELETE FROM Clientes WHERE id = ?', idCliente, (err) => {
              if (err) {
                console.error(err);
              } else {
                console.log('Cliente removido com sucesso.');
                event.sender.send('cliente-removido', idCliente); // Envia um evento de volta para o processo de renderização
              }
            });
          });
      }
  });
});






// Cria um pop-up para o sistema de exclusão das vendas no histórico
ipcMain.on('confirm-delete', (event, id) => {
  const options = {
    type: 'question',
    buttons: ['Cancelar', 'Excluir'],
    defaultId: 0,
    title: 'Confirmar exclusão',
    message: 'Tem certeza de que deseja excluir esta venda?',
  };

  dialog.showMessageBox(options).then((response) => {
    if (response.response === 1) {
      // Se o usuário clicou em 'Excluir', obtenha os detalhes da venda primeiro
      db.get('SELECT * FROM vendas WHERE id = ?', id, (err, venda) => {
        if (err) {
          console.error(err.message);
        } else {
          // Se a venda foi feita a crédito, abata o valor da venda da dívida do cliente
          if (venda.metodoPagamento === 'Fiado') {
            db.run('UPDATE Clientes SET divida = divida - ? WHERE nome = ?', [venda.preco, venda.cliente], (err) => {
              if (err) {
                console.error(err.message);
              } else {
                console.log('Dívida do cliente atualizada com sucesso.');

                // Agora exclua a venda
                db.run('DELETE FROM vendas WHERE id = ?', id, (err) => {
                  if (err) {
                    console.error(err.message);
                  } else {
                    console.log('Venda excluída com sucesso.');
                  }
                });
              }
            });
          } else {
            // Se a venda não foi feita a crédito, apenas exclua a venda
            db.run('DELETE FROM vendas WHERE id = ?', id, (err) => {
              if (err) {
                console.error(err.message);
              } else {
                console.log('Venda excluída com sucesso.');
              }
            });
          }
        }
      });
    }
  });
});


// responsavel pr pegar dos dados do historico de pagamentos
ipcMain.on('carregar-dados-historico-vendas', (event) => {
  db.all('SELECT * FROM vendas', [], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('dados-historico-vendas', rows);
  });
});

// lida com o sistema de remover do banco uma venda que foi realizada
ipcMain.on('delete-venda', (event, id) => {
  db.run('DELETE FROM vendas WHERE id = ?', id, (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log('Venda excluída com sucesso.');
      event.sender.send('carregar-dados-historico-vendas');
    }
  });
});


// historico de pagamentos
ipcMain.on('carregar-dados-historico-pagamentos', (event) => {
  db.all('SELECT * FROM Pagamentos', [], (err, rows) => {
    if (err) {
      event.sender.send('erro', 'Não foi possível carregar o histórico de pagamentos.');
    } else {
      event.sender.send('dados-historico-pagamentos', rows);
    }
  });
});

//responsavel por filtra o  hstorico de vendas
ipcMain.on('filtrar-vendas-por-data', (event, dataSelecionada) => {
  db.all('SELECT * FROM vendas WHERE DATE(dataVenda) = ?', [dataSelecionada], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('resultado-filtro-data', rows);
  });
});

// Use a função formatarData ao filtrar pagamentos por data
ipcMain.on('filtrar-pagamentos-por-data', (event, dataSelecionada) => {
  // Verifica se a data está no formato correto
  const regexData = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexData.test(dataSelecionada)) {
    console.error('Data inválida. A data deve estar no formato AAAA-MM-DD.');
    return;
  }

  const dataISO = new Date(dataSelecionada).toISOString().split('T')[0];
  db.all('SELECT * FROM Pagamentos WHERE DATE(data_pagamento) = ?', [dataISO], (err, rows) => {
    if (err) {
      throw err;
    }
    event.sender.send('resultado-filtro-data-pagamentos', rows);
  });
});



// lida com o sistema de vendas a fiado
ipcMain.on('registrar-divida', (event, { cliente, divida }) => {
  db.serialize(() => {
    // Adiciona o valor da dívida à dívida atual do cliente na tabela Clientes
    db.run('UPDATE Clientes SET divida = divida + ? WHERE nome = ?', [divida, cliente]);
  });
});
ipcMain.on('registrar-pagamento', (event, { nomePagador, dividaAnterior, valorPagamento }) => {
  const dividaRestante = dividaAnterior - valorPagamento;
  // Obtém a data atual no formato 'YYYY-MM-DD'
  const dataPagamento = moment().format('YYYY-MM-DD');


  db.serialize(() => {
    // Atualiza a dívida do cliente na tabela Clientes
    db.run('UPDATE Clientes SET divida = ? WHERE nome = ?', [dividaRestante, nomePagador], function (err) {
      if (err) {
        event.sender.send('erro', 'Erro ao atualizar a dívida do cliente: ' + err.message);
        return;
      }

      // Registra o pagamento na tabela Pagamentos com as novas colunas
      db.run('INSERT INTO Pagamentos (nome_pagador, divida_anterior, valor_pago, divida_restante, data_pagamento) VALUES (?, ?, ?, ?, ?)', [nomePagador, dividaAnterior, valorPagamento, dividaRestante, dataPagamento], function (err) {
        if (err) {
          event.sender.send('erro', 'Erro ao registrar o pagamento: ' + err.message);
          return;
        }

        // Envia uma confirmação de volta ao processo de renderização
        event.sender.send('pagamento-registrado', 'Pagamento registrado com sucesso.');
      });
    });
  });
});





// confirmação de envio do cadastro de clientes para o banco
ipcMain.on('submit-cliente', (event, data) => {
  insertCliente(data);
});

ipcMain.on('update-cliente', (event, data) => {
  // Atualiza os dados
  updateCliente(data);

  // Mostra um alerta indicando que as alterações foram realizadas
  dialog.showMessageBox({
    type: 'info',
    title: 'Atualização de Dados',
    message: 'As alterações foram realizadas com sucesso!',
  });
});


// confirmação de envio dos dados para o banco  do sistema de vendas
ipcMain.on('submit-venda', (event, data) => {
  insertVenda(data);
});

ipcMain.on('getTotalVendas', (event, dataInicio, dataFim) => {
  somaVendas(new Date(dataInicio), new Date(dataFim))
    .then(totalVendas => {
      event.reply('getTotalVendasResponse', totalVendas);
    })
    .catch(err => {
      console.error(err);
    });
});

ipcMain.on('getTotalVendasPorMetodoPagamento', (event, metodoPagamento, dataInicio, dataFim) => {
  somaVendasPorMetodoPagamento(metodoPagamento, new Date(dataInicio), new Date(dataFim))
    .then(totalVendas => {
      event.reply('getTotalVendasPorMetodoPagamentoResponse', {metodoPagamento, totalVendas});
    })
    .catch(err => {
      console.error(err);
    });
});



//sistema para lidar com a busca de clientes no banco para a vendas
ipcMain.on('search', (event, searchTerm) => {
  console.log('Evento search recebido:', searchTerm);
  db.all('SELECT * FROM Clientes WHERE nome = ?', [searchTerm], function (err, rows) {
    if (err) {
      console.error(err);
      return;
    }
    event.sender.send('search-results', rows);
  });
});

// lida com o sistema de alto complete da parte esqueda do pesquisar
ipcMain.on('autocomplete-pesquisa', (event, searchTerm) => {
  db.all('SELECT nome FROM Clientes WHERE nome LIKE ? LIMIT 10', [searchTerm + '%'], function (err, rows) {
    if (err) {
      console.error(err);
      return;
    }
    event.sender.send('autocomplete-results', rows);
  });
});

// Lida com o sistema de auto-completar o nome do cliente
ipcMain.on('autocomplete-client-name', (event, clientName) => {
  db.all('SELECT nome FROM Clientes WHERE nome LIKE ? LIMIT 5', [clientName + '%'], function (err, rows) {
    if (err) {
      console.error(err);
      return;
    }
    event.sender.send('autocomplete-client-name-results', rows);
  });
});






//responsavel pelos sistema de historio 
ipcMain.on('get-activities-by-date', (event, date) => {
  getActivitiesByDate(date, function (rows) {
    event.sender.send('activities-by-date-results', rows);
  });
});

ipcMain.on('get-activities-by-client', (event, clientName) => {
  getActivitiesByClient(clientName, function (rows) {
    event.sender.send('activities-by-client-results', rows);
  });
});


//controle do sistema electron
function createWindow() {
  const win = new BrowserWindow({
    width: 880,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Habilita o 'require' no processo de renderização
      contextIsolation: false // Desabilita o isolamento de contexto
    }
  });

  win.loadFile('src/index.html');
}

app.whenReady().then(() => createWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Fecha a conexão com o banco de dados SQLite quando todas as janelas são fechadas
    db.close();
    app.quit();
  }
});

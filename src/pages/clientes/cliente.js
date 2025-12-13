(function() {
const {db} = require('../../database.js')
const { ipcRenderer } = require('electron');


function getClientes(nome, callback) {
  db.all("SELECT nome FROM clientes WHERE nome LIKE ? LIMIT 5", [nome + '%'], function(err, rows) {
    if (err) {
      callback(err);
    } else {
      callback(null, rows.map(r => r.nome));
    }
  });
}

function getCliente(nome, callback) {
  db.get("SELECT * FROM clientes WHERE nome = ?", [nome], function(err, row) {
    if (err) {
      callback(err);
    } else {
      callback(null, row);
    }
  });
}
var clienteId; // Variável para armazenar o ID do cliente

document.getElementById('search').addEventListener('input', function(e) {
  var nomeCliente = e.target.value;

  getClientes(nomeCliente, function(err, clientes) {
    if (err) {
      console.error(err);
    } else {
      var resultsDiv = document.getElementById('results');
      resultsDiv.innerHTML = ''; // Limpar os resultados anteriores

      clientes.forEach(function(cliente) {
        var div = document.createElement('div');
        div.textContent = cliente;
        div.addEventListener('click', function() {
          document.getElementById('search').value = cliente;
          resultsDiv.innerHTML = ''; // Limpar os resultados quando um cliente for selecionado

          getCliente(cliente, function(err, clienteData) {
            if (err) {
              console.error(err);
            } else {
              clienteId = clienteData.id; // Armazenar o ID do cliente
              document.getElementById('nome').value = clienteData.nome;
              if (clienteData.DataNascimento) {
                // Converte a data de nascimento para o formato "yyyy-MM-dd"
                var dataNascimento = new Date(clienteData.DataNascimento);
                var ano = dataNascimento.getUTCFullYear();
                var mes = ('0' + (dataNascimento.getUTCMonth() + 1)).slice(-2); // Adiciona um zero à esquerda se o mês for menor que 10
                var dia = ('0' + dataNascimento.getUTCDate()).slice(-2); // Adiciona um zero à esquerda se o dia for menor que 10
                document.getElementById('dataNascimento').value = ano + '-' + mes + '-' + dia;
              }
              document.getElementById('cpf').value = clienteData.cpf;
              document.getElementById('rg').value = clienteData.rg;
              document.getElementById('endereco').value = clienteData.endereco;
              document.getElementById('telefone').value = clienteData.telefone;
              document.getElementById('email').value = clienteData.email;
              document.getElementById('divida').value = clienteData.divida;
              document.getElementById('dataPagamento').value = clienteData.dataPagamento;
            }
          });
        });
        resultsDiv.appendChild(div);
      });
    }
  });
});
document.getElementById('updateButton').addEventListener('click', function() {
  // Obtém os valores do formulário de clientes
  const nome = document.getElementById('nome').value;
  const DataNascimento = document.getElementById('dataNascimento').value;
  const cpf = document.getElementById('cpf').value;
  const rg = document.getElementById('rg').value;
  const endereco = document.getElementById('endereco').value;
  const telefone = document.getElementById('telefone').value;
  const email = document.getElementById('email').value;
  const divida = document.getElementById('divida').value;
  const dataPagamento = document.getElementById('dataPagamento').value;

  // Prepara os dados do cliente
  const clienteData = { id: clienteId, nome, DataNascimento, cpf, rg, endereco, telefone, email, divida, dataPagamento };

  // Envia um evento IPC com os valores do formulário de clientes
  ipcRenderer.send('update-cliente', clienteData);
});


})();
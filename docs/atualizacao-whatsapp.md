# Atualização do WhatsApp

O botão de rascunho da tela Hoje agora encaminha o ID do cliente e o texto
editado sem acessar uma variável inexistente. O telefone continua sendo
buscado no banco pelo processo principal. Na pesquisa, uma janela WhatsApp
já aberta carrega a nova conversa selecionada.

Na primeira inicialização desta versão, a migração marca todos os clientes
existentes para receber mensagens, inclusive cadastros anteriormente desmarcados.
O banco é copiado e verificado antes da migração. A conversão ocorre uma única
vez por banco: desmarcações posteriores são preservadas nos próximos reinícios.
Novos cadastros começam marcados. Para interromper mensagens, desmarque a opção
de recebimento no cadastro e salve. Essa preferência não comprova autorização
expressa do cliente.

## Instalar na loja

1. Feche o aplicativo e faça backup da instalação e do banco da loja.
2. Atualize o código preservando o `Banco_dados.db` da loja. Não substitua esse
   arquivo pelo banco incluído no GitHub ou por um banco de teste.
3. Se usa um executável empacotado, gere novamente o aplicativo com o código
   atualizado; atualizar apenas o repositório não modifica um executável antigo.
4. Abra o app e teste um rascunho com um cadastro de teste e telefone próprio.
   Confira o destinatário e o texto. Repita na pesquisa com a janela WhatsApp
   já aberta para verificar a troca de conversa.

## Verificação

```sh
node scripts/check-js.js
node --test tests/whatsapp-navigation.test.js tests/whatsapp-preference.test.js tests/whatsapp-rules.test.js
```

Os testes usam dados fictícios e simulações de Electron/IPC. Não enviam mensagens.
Uma sessão real do WhatsApp e o banco da loja ainda precisam ser validados no
computador de destino. O modo automático continua dependendo da configuração
existente da API.

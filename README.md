# AppElectron

Aplicativo desktop em Electron para controle de uma pequena loja. O app gerencia clientes, vendas, pagamentos de dividas, historico, faturamento por periodo e backup do banco SQLite.

## Requisitos

- Node.js instalado.
- Dependencias instaladas com `npm install`.

## Como executar

```powershell
npm start
```

## Scripts

- `npm start`: inicia o aplicativo Electron.
- `npm run check`: valida a sintaxe dos arquivos JavaScript do projeto.

## Estrutura

- `src/main`: processo principal do Electron, banco de dados, IPC, backup e janela.
- `src/pages`: telas do aplicativo.
- `src/renderer`: scripts de renderer compartilhados pela tela inicial.
- `src/assets/imgs`: imagens usadas na interface.
- `config/app-config.json`: identidade da empresa, tema e modulos ativos.
- `Banco_dados.db`: banco SQLite local do app.

## Perfis de uso

O sistema foi preparado para atender lojas simples e tambem empresas que queiram crescer em organizacao.

- `simple`: venda manual livre, ideal para lojas com pecas variadas, produtos unicos ou sem controle rigido de estoque.
- `catalog`: permite manter catalogo de produtos, mas ainda aceita venda manual.
- `stock`: pensado para empresas que querem controlar quantidade, custo, estoque baixo e produtos repetidos.

No arquivo `config/app-config.json`, os modulos podem ser ligados ou desligados sem alterar codigo. Exemplos:

- `manualSales`: venda manual.
- `clients`: cadastro e pesquisa de clientes.
- `payments`: pagamentos, fiado e historico.
- `finance`: tela financeira.
- `simpleProducts`: catalogo simples de produtos.
- `stockControl`: controle de estoque.
- `barcode`: suporte para codigo de barras via leitor USB/teclado.

## Administracao

A tela inicial nao mostra valores de dinheiro para proteger informacoes administrativas quando funcionarios usam o app. Os detalhes financeiros ficam na Administracao, protegida por usuario e senha.

Usuarios iniciais:

```
usuario: admin
senha: 1234

usuario: funcionario
senha: 0000
```

Somente usuarios com `role: "owner"` acessam a Administracao. As senhas ficam armazenadas como hash em `config/app-config.json`.

Troque essas senhas antes de usar o app em uma loja real. Na Administracao, o sistema mostra entradas reais, saidas, saldo, vendas por forma de pagamento, auditoria e permite registrar despesas.

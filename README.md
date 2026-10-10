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

## Cobranças WhatsApp

O módulo fica no atalho **Cobranças WhatsApp**. O cadastro do cliente permite guardar um próximo vencimento fixo e registrar se ele autorizou lembretes. Os campos antigos `dataPagamento` e `Pagamentos.data_pagamento` são datas do último pagamento; o módulo não os interpreta como vencimento.

Uma migração aditiva adiciona `Clientes.data_vencimento`, `Clientes.whatsapp_opt_in` e `WhatsAppEnvios`, sem reescrever dívidas ou pagamentos. Antes da migração, o app verifica o banco e cria uma cópia SHA-256 verificada em `backups/schema-migrations/`. A pasta é ignorada pelo Git porque pode conter dados pessoais.

### Modo manual e API

- Por padrão o modo de teste está ligado e a automação fica desligada.
- A lista usa apenas clientes ativos com saldo positivo; automação exige data de vencimento e consentimento registrado.
- “Abrir rascunho no WhatsApp” abre `wa.me` com a mensagem para conferência. Isso não envia automaticamente.
- Mensagens reais usam a WhatsApp Business Platform Cloud API e modelos aprovados. Defina os nomes reais de modelos e idioma aprovados pela Meta; os modelos de cobrança devem conter três parâmetros no corpo, na ordem nome, valor e vencimento. O modelo de teste pode não ter parâmetros.
- Tokens são criptografados com `safeStorage` do Electron no perfil local do usuário Windows, fora do repositório. A API só pode ser configurada por administrador.
- Para habilitar envio real, a empresa precisa configurar uma Meta Business Account e WhatsApp Business Account, registrar/verificar um número, obter o Phone Number ID e token com permissões válidas, cadastrar e aprovar modelos, obter consentimento dos clientes e atender às regras de mensagens da Meta. Informe no painel uma versão atual suportada da Graph API; versões não são presumidas pelo aplicativo.
- Consulte a [visão geral da WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/overview) e as [informações oficiais do WhatsApp Business](https://business.whatsapp.com/).
- “Testar conexão” consulta os dados do número comercial; “Enviar mensagem de teste” envia o modelo aprovado ao número autorizado configurado. Essa ação envia uma mensagem real ao número de teste escolhido; o modo de teste continua bloqueando cobranças automáticas para clientes.
- “Executar verificação manual” simula a lista elegível enquanto o modo de teste estiver ligado. A simulação não chama a API e não cria eventos de envio.

### Regras e limites

O processo verifica clientes a cada 30 minutos enquanto o app está aberto. O envio automático só considera vencimentos anteriores à data de hoje; não envia lembretes antes nem no próprio dia do vencimento. Depois do vencimento, respeita a janela horária local, limite diário, saldo, consentimento e intervalo configurado. O identificador único do evento impede duplicatas por cliente, tipo e data; um evento que ficou em estado “enviando” após fechamento inesperado não é repetido automaticamente, para evitar uma possível duplicidade. Falhas tentam novamente até três vezes, separadas por uma hora.

O histórico registra tentativas, falhas e IDs de mensagem. `aceito_api` significa apenas que a API aceitou a solicitação; sem webhooks configurados, o app não confirma entrega. O aplicativo precisa estar aberto e o computador conectado durante a janela para processar cobranças. Não há serviço Windows separado.

O campo de vencimento é apenas informativo e não define atraso. Em **Hoje** e no painel WhatsApp, um cliente com saldo fica regular até 29 dias, aparece em atenção entre 30 e 44 dias, e entra em atraso no 45º dia desde a compra fiada mais recente ou o último pagamento real, o que tiver ocorrido por último. A data digitada no cadastro não participa dessa contagem. A automação respeita essa mesma regra e só considera clientes com telefone válido e autorização registrada. Não há recebimento de solicitações de descadastro por webhook; remova o consentimento no cadastro quando o cliente pedir para parar.

### Executar e testar

No diretório do repositório, com Node.js e npm instalados. O script de testes também precisa de Node.js 22.5 ou superior (`node:sqlite`):

```powershell
npm install
npm start
```

Verificações automatizadas:

```powershell
npm run check
npm run test:whatsapp
```

Os testes WhatsApp usam `node:sqlite` em banco em memória e dados fictícios. Não fazem chamadas à API nem enviam mensagens.

### Backup e restauração

Use **Realizar Backup** na tela inicial para escolher uma pasta; o banco é salvo como `Banco_dados.db` dentro de uma pasta datada. Para restaurar, feche o aplicativo, copie o banco atual para uma pasta segura, substitua `Banco_dados.db` na pasta usada pelo app pela cópia de backup e reabra o app. Não restaure o `Banco_dados.db` incluído no repositório sobre um banco de loja.

Neste código, `src/main/database.js` localiza o banco em `Banco_dados.db` na raiz do projeto. A rotina de migração atua no banco localizado pela instalação em que o aplicativo está aberto; ela não acessa cópias em outros diretórios.

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

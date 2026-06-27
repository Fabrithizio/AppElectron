# Plano do Controle Empresarial

Objetivo: transformar o app em um sistema modular para pequenas empresas, mantendo uso simples no caixa e recursos completos para administracao.

## Principios

- Funcionario ve operacao: vendas, clientes, pagamentos e historico operacional.
- Administrador ve dinheiro consolidado, auditoria, configuracoes e acoes perigosas.
- Nada financeiro deve ser apagado definitivamente: cancelar, inativar e auditar.
- Toda acao importante deve guardar usuario, data, entidade e detalhe legivel.
- Cada empresa pode ligar/desligar modulos, trocar nome, logo, cores e modo de uso.

## Modulos

### Caixa e vendas

- Venda por produto cadastrado, codigo de barras ou item livre.
- Fechamento diario de caixa por funcionario.
- Sangria e suprimento de caixa com confirmacao administrativa.
- Cancelamento de venda apenas por administrador.

### Financeiro

- Entradas, saidas, saldo e formas de pagamento somente na Administracao.
- Contas a pagar.
- Contas a receber.
- Fluxo de caixa por periodo.
- Categorias financeiras.

### Clientes e cobranca

- Cadastro e historico do cliente.
- Divida em aberto.
- Atrasado apenas quando ha divida e passaram 90 dias ou mais desde o ultimo pagamento.
- Qualquer pagamento parcial reinicia a contagem de atraso.
- Lista de atraso ordenada do maior atraso para o menor.
- Mensagem de cobranca por WhatsApp.

### Produtos e estoque

- Produtos cadastrados com codigo, categoria, fornecedor, custo, venda e estoque minimo.
- Item livre para lojas pequenas ou pecas unicas.
- Transformar item livre em produto cadastrado quando ele comecar a repetir.
- Entrada e ajuste de estoque com motivo e auditoria.
- Alerta de estoque baixo.

### Usuarios e permissoes

- Um perfil por funcionario.
- Administradores separados dos funcionarios.
- Permissoes por modulo.
- Auditoria por usuario para vendas, pagamentos, cadastros, cancelamentos e configuracoes.

### Administracao

- Identidade da empresa: nome, logo, cores, WhatsApp e titulo do app.
- Modos de uso: simples, catalogo, estoque controlado.
- Modulos ativados/desativados por empresa.
- Auditoria legivel.
- Backup e restauracao.

## Ordem Recomendada

1. Fechamento diario de caixa.
2. Contas a pagar e contas a receber.
3. Cobranca com WhatsApp e lista de atraso detalhada.
4. Permissoes por funcionario.
5. Ajuste/entrada de estoque com auditoria.
6. Tela de personalizacao visual da empresa.

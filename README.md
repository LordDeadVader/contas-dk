# Contas DK 💰

Web app (PWA) de controle financeiro mensal, de uso pessoal do **Davi** e da **Kauane**.

## O que faz

- **Login por PIN** (sem cadastro): escolhe o usuário e digita `1234`.
- **Painel do mês**: navegue entre meses com as setas.
- **Resumo**: ↑ Entradas e ↓ Saídas lado a lado, e o Saldo do mês em destaque embaixo (verde/vermelho).
- **Entradas**: várias fontes por mês — dinheiro em espécie e/ou conta bancária (com nome do banco) — cada uma soma/exclui independente; o card mostra a soma de tudo.
- **Lista de contas (Saídas)**: adicione (com vencimento e observação opcionais, só pra registro), marque como paga (fica riscada) ou exclua. Toque na conta pra ver os detalhes completos (valor, vencimento, observação, quem cadastrou). O resumo atualiza sozinho. Conta vencida e ainda não paga aparece destacada em vermelho.
- **Conta parcelada ou recorrente**: ao criar a conta, escolha "Parcelada" (informa a parcela atual e o total, ex.: 1/48 — o app mostra o valor total da compra) ou "Recorrente" (mensalidade sem fim definido, tipo assinatura). Em ambos os casos, a partir do mês seguinte a próxima ocorrência é lançada sozinha quando você abre aquele mês — sem recadastrar nada. Dá pra parar a repetição a qualquer momento pelo modal de detalhes. (Ver limitação abaixo.)
- **Desconto por pagamento adiantado**: ao marcar uma conta como paga pelo modal de detalhes, dá pra informar um desconto — o valor pago (já descontado) é o que entra nos totais e no histórico; o checkbox rápido da lista continua marcando sem desconto, pro dia a dia.
- **Relatórios** (aba própria): resumo do período (Entradas, Saídas pagas/pendentes e Saldo) para 6 meses, 12 meses ou tudo, gráfico de barras por mês (pago x pendente), quanto cada um (Davi/Kauane) cadastrou, e histórico de meses — toque em um mês do histórico pra abrir ele na aba Início.
- **Quem fez o quê**: toda conta e toda entrada guarda, discretamente, quem cadastrou (Davi ou Kauane).
- **Offline**: funciona sem internet e pode ser **instalado na tela inicial** do celular.

### ⚠️ Os dados NÃO sincronizam entre aparelhos

Tudo fica salvo no `localStorage` do navegador — **local a cada combinação de aparelho + navegador**, nada vai para servidor. Isso significa que o que o Davi lança no celular dele **não aparece** no celular da Kauane (nem no computador, nem numa aba anônima, nem depois de limpar os dados do site). Cada um só vê o que foi lançado *ali* — hoje o app ainda não tem uma conta compartilhada de verdade entre os dois.

### Limitação da repetição (parcelada/recorrente)

Como é um app estático (sem servidor/backend), ele não consegue "acordar sozinho" todo mês pra lançar a próxima ocorrência — ela só é criada quando **alguém abre aquele mês específico no app** (a navegação é sequencial: se você pular vários meses de uma vez, ela só aparece quando você efetivamente visitar cada mês em ordem). Dá pra parar a repetição pelo modal de detalhes ("Parar de repetir"); antes disso, excluir só a ocorrência de um mês específico não é definitivo — se aquele mês for reaberto depois, ela é relançada.

## Estrutura

```
index.html
css/style.css
js/auth.js      -> login por PIN
js/app.js       -> Store, painel, modais, PWA
manifest.json
sw.js           -> cache offline
icons/          -> ícones do app
```

## Rodar localmente

Precisa de um servidor HTTP (o service worker não roda via `file://`):

```bash
python -m http.server 8080
# abre http://localhost:8080
```

## Deploy

Hospedado no GitHub Pages a partir da branch `main`.

## Observação sobre segurança

O PIN é apenas uma barreira leve de acesso — o código roda 100% no navegador,
então **não** trate isso como proteção real. É adequado para uso doméstico.

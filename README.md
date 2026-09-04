# Contas DK 💰

Web app (PWA) de controle financeiro mensal, de uso pessoal do **Davi** e da **Kauane**.

## O que faz

- **Login por PIN** (sem cadastro): escolhe o usuário e digita `1234`.
- **Painel do mês**: navegue entre meses com as setas.
- **Resumo**: Dinheiro disponível (editável), Total a pagar e Saldo restante (verde/vermelho).
- **Lista de contas**: adicione, marque como paga (fica riscada) ou exclua. O resumo atualiza sozinho.
- **Offline**: funciona sem internet e pode ser **instalado na tela inicial** do celular.
- Os dados ficam no `localStorage` do próprio aparelho (nada vai para servidor).

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

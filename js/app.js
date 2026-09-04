/* ============================================================
   app.js — Contas DK
   Organização:
     1. Store      -> leitura/escrita no localStorage
     2. Formato    -> helpers de dinheiro e datas
     3. UI         -> seletores e toast
     4. Login      -> Tela 1
     5. Painel     -> Tela 2 (resumo + lista de contas)
     6. Modais     -> nova conta / renda / confirmação
     7. PWA        -> service worker + botão instalar
     8. Início     -> amarra tudo
   ============================================================ */

/* ---------- 1. STORE ------------------------------------------------ */

const Store = (() => {
  const CHAVE = 'contasdk_dados';

  function _lerTudo() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE)) || {};
    } catch (e) {
      return {};
    }
  }

  function _salvarTudo(dados) {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  }

  /** Retorna o mês (cria vazio se não existir). Chave no formato "AAAA-MM". */
  function mes(chave) {
    const dados = _lerTudo();
    if (!dados[chave]) dados[chave] = { renda: 0, contas: [] };
    return dados[chave];
  }

  function definirRenda(chave, valor) {
    const dados = _lerTudo();
    if (!dados[chave]) dados[chave] = { renda: 0, contas: [] };
    dados[chave].renda = Math.max(0, Number(valor) || 0);
    _salvarTudo(dados);
  }

  function adicionarConta(chave, nome, valor) {
    const dados = _lerTudo();
    if (!dados[chave]) dados[chave] = { renda: 0, contas: [] };
    dados[chave].contas.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nome: nome.trim(),
      valor: Math.max(0, Number(valor) || 0),
      paga: false,
    });
    _salvarTudo(dados);
  }

  function alternarPaga(chave, id) {
    const dados = _lerTudo();
    const conta = (dados[chave]?.contas || []).find((c) => c.id === id);
    if (conta) conta.paga = !conta.paga;
    _salvarTudo(dados);
  }

  function excluirConta(chave, id) {
    const dados = _lerTudo();
    if (!dados[chave]) return;
    dados[chave].contas = dados[chave].contas.filter((c) => c.id !== id);
    _salvarTudo(dados);
  }

  return { mes, definirRenda, adicionarConta, alternarPaga, excluirConta };
})();


/* ---------- 2. FORMATO -------------------------------------------- */

const Formato = (() => {
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function dinheiro(valor) {
    return brl.format(Number(valor) || 0);
  }

  /** "12,50" ou "1.234,56" ou "1234.56" -> número */
  function paraNumero(texto) {
    if (typeof texto === 'number') return texto;
    let t = String(texto).trim().replace(/\s/g, '').replace(/R\$/gi, '');
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.'); // formato pt-BR
    }
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  function chaveMes(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  }

  function rotuloMes(data) {
    const s = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return { dinheiro, paraNumero, chaveMes, rotuloMes };
})();


/* ---------- 3. UI ------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(mensagem) {
  const existente = $('.toast');
  if (existente) existente.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = mensagem;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function mostrarTela(id) {
  $$('.tela').forEach((t) => (t.hidden = t.id !== id));
}


/* ---------- 4. LOGIN (Tela 1) ----------------------------------- */

const Login = (() => {
  let usuarioSelecionado = null;

  function init() {
    // botões de usuário
    $$('.btn-usuario').forEach((btn) => {
      btn.addEventListener('click', () => selecionar(btn.dataset.usuario));
    });

    $('#btn-voltar-usuario').addEventListener('click', voltar);

    $('#form-login').addEventListener('submit', (e) => {
      e.preventDefault();
      tentarEntrar();
    });

    // some com o erro ao digitar
    $('#input-pin').addEventListener('input', () => {
      $('#login-erro').hidden = true;
    });
  }

  function selecionar(usuario) {
    usuarioSelecionado = usuario;
    $('#login-nome-selecionado').textContent = usuario;
    $('.login-usuarios').hidden = true;
    $('.login-titulo').hidden = true;
    $('#form-login').hidden = false;
    $('#input-pin').value = '';
    $('#login-erro').hidden = true;
    setTimeout(() => $('#input-pin').focus(), 50);
  }

  function voltar() {
    usuarioSelecionado = null;
    $('.login-usuarios').hidden = false;
    $('.login-titulo').hidden = false;
    $('#form-login').hidden = true;
  }

  function tentarEntrar() {
    const pin = $('#input-pin').value;
    if (Auth.validar(usuarioSelecionado, pin)) {
      Auth.entrar(usuarioSelecionado);
      Painel.abrir();
    } else {
      $('#login-erro').hidden = false;
      $('#input-pin').value = '';
      $('#input-pin').focus();
    }
  }

  return { init, voltar };
})();


/* ---------- 5. PAINEL (Tela 2) --------------------------------- */

const Painel = (() => {
  let dataAtual = new Date();

  function init() {
    $('#btn-sair').addEventListener('click', sair);
    $('#btn-mes-anterior').addEventListener('click', () => navegarMes(-1));
    $('#btn-mes-proximo').addEventListener('click', () => navegarMes(1));
    $('#btn-nova-conta').addEventListener('click', () => Modais.abrirConta());
    $('#card-disponivel').addEventListener('click', () => Modais.abrirRenda(chave()));
  }

  function chave() {
    return Formato.chaveMes(dataAtual);
  }

  function abrir() {
    const sessao = Auth.sessaoAtual();
    if (!sessao) {
      mostrarTela('tela-login');
      return;
    }
    $('#painel-usuario').textContent = sessao.usuario;
    dataAtual = new Date();
    mostrarTela('tela-painel');
    render();
  }

  function sair() {
    Auth.sair();
    Login.voltar();
    mostrarTela('tela-login');
  }

  function navegarMes(delta) {
    dataAtual = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + delta, 1);
    render();
  }

  function render() {
    const mesDados = Store.mes(chave());
    $('#mes-titulo').textContent = Formato.rotuloMes(dataAtual);

    const totalPagar = mesDados.contas.reduce((s, c) => s + c.valor, 0);
    const totalPago = mesDados.contas.filter((c) => c.paga).reduce((s, c) => s + c.valor, 0);
    const saldo = mesDados.renda - totalPagar;

    $('#valor-disponivel').textContent = Formato.dinheiro(mesDados.renda);
    $('#valor-total').textContent = Formato.dinheiro(totalPagar);

    const elSaldo = $('#valor-saldo');
    elSaldo.textContent = Formato.dinheiro(saldo);
    elSaldo.classList.toggle('card__valor--positivo', saldo >= 0);
    elSaldo.classList.toggle('card__valor--negativo', saldo < 0);

    // progresso de pagamento
    const pct = totalPagar > 0 ? Math.round((totalPago / totalPagar) * 100) : 0;
    $('#progresso-barra').style.width = pct + '%';
    $('#progresso-texto').textContent =
      mesDados.contas.length === 0
        ? 'Nenhuma conta neste mês'
        : `${Formato.dinheiro(totalPago)} pagos de ${Formato.dinheiro(totalPagar)} · ${pct}%`;

    renderLista(mesDados.contas);
  }

  function renderLista(contas) {
    const ul = $('#lista-contas');
    ul.innerHTML = '';
    $('#contador-contas').textContent = contas.length;
    $('#lista-vazia').hidden = contas.length > 0;

    // não pagas primeiro, depois pagas
    const ordenadas = [...contas].sort((a, b) => Number(a.paga) - Number(b.paga));

    for (const conta of ordenadas) {
      const li = document.createElement('li');
      li.className = 'conta' + (conta.paga ? ' conta--paga' : '');
      li.innerHTML = `
        <input type="checkbox" class="conta__check" ${conta.paga ? 'checked' : ''}
               aria-label="Marcar ${conta.nome} como paga" />
        <div class="conta__info">
          <div class="conta__nome">${escapar(conta.nome)}</div>
          <div class="conta__valor">${Formato.dinheiro(conta.valor)}</div>
        </div>
        <button class="conta__excluir" type="button" aria-label="Excluir ${escapar(conta.nome)}">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>
        </button>`;

      li.querySelector('.conta__check').addEventListener('change', () => {
        Store.alternarPaga(chave(), conta.id);
        render();
      });
      li.querySelector('.conta__excluir').addEventListener('click', () => {
        Modais.confirmarExclusao(conta, () => {
          Store.excluirConta(chave(), conta.id);
          render();
          toast('Conta excluída');
        });
      });

      ul.appendChild(li);
    }
  }

  function escapar(txt) {
    const d = document.createElement('div');
    d.textContent = txt;
    return d.innerHTML;
  }

  return { init, abrir, render, chave };
})();


/* ---------- 6. MODAIS ------------------------------------------ */

const Modais = (() => {
  let alvoExclusao = null;

  function init() {
    // fechar ao clicar no fundo ou nos botões marcados
    $$('[data-fechar-modal]').forEach((el) => {
      el.addEventListener('click', fecharTodos);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fecharTodos();
    });

    $('#form-conta').addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = $('#conta-nome').value.trim();
      const valor = Formato.paraNumero($('#conta-valor').value);
      if (!nome) return;
      Store.adicionarConta(Painel.chave(), nome, valor);
      fecharTodos();
      Painel.render();
      toast('Conta adicionada');
    });

    $('#form-renda').addEventListener('submit', (e) => {
      e.preventDefault();
      const valor = Formato.paraNumero($('#renda-valor').value);
      Store.definirRenda(Painel.chave(), valor);
      fecharTodos();
      Painel.render();
      toast('Valor atualizado');
    });

    $('#btn-confirma-excluir').addEventListener('click', () => {
      if (typeof alvoExclusao === 'function') alvoExclusao();
      alvoExclusao = null;
      fecharTodos();
    });
  }

  function abrir(id) {
    $('#' + id).hidden = false;
  }

  function fecharTodos() {
    $$('.modal').forEach((m) => (m.hidden = true));
  }

  function abrirConta() {
    $('#form-conta').reset();
    abrir('modal-conta');
    setTimeout(() => $('#conta-nome').focus(), 50);
  }

  function abrirRenda(chave) {
    const atual = Store.mes(chave).renda;
    $('#renda-valor').value = atual ? String(atual).replace('.', ',') : '';
    abrir('modal-renda');
    setTimeout(() => $('#renda-valor').select(), 50);
  }

  function confirmarExclusao(conta, aoConfirmar) {
    $('#modal-confirma-texto').textContent =
      `"${conta.nome}" (${Formato.dinheiro(conta.valor)}) será removida deste mês.`;
    alvoExclusao = aoConfirmar;
    abrir('modal-confirma');
  }

  return { init, abrirConta, abrirRenda, confirmarExclusao, fecharTodos };
})();


/* ---------- 7. PWA -------------------------------------------- */

const PWA = (() => {
  let promptInstalar = null;

  function init() {
    // registra o service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW falhou:', e));
      });
    }

    const btn = $('#btn-instalar');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptInstalar = e;
      btn.hidden = false;
    });

    btn.addEventListener('click', async () => {
      if (!promptInstalar) {
        toast('Use o menu do navegador → "Instalar app"');
        return;
      }
      promptInstalar.prompt();
      await promptInstalar.userChoice;
      promptInstalar = null;
      btn.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
      btn.hidden = true;
      toast('App instalado! 🎉');
    });
  }

  return { init };
})();


/* ---------- 8. INÍCIO ---------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  Login.init();
  Painel.init();
  Modais.init();
  PWA.init();

  if (Auth.sessaoAtual()) {
    Painel.abrir();
  } else {
    mostrarTela('tela-login');
  }
});

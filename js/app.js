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

  function _gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Retorna o mês (cria vazio se não existir). Chave no formato "AAAA-MM".
   * Também migra meses antigos, que guardavam um único número em "renda",
   * para a lista "rendas" (várias fontes: dinheiro/banco).
   */
  function mes(chave) {
    const dados = _lerTudo();
    let m = dados[chave];
    let mudou = false;

    if (!m) {
      m = { rendas: [], contas: [] };
      dados[chave] = m;
      mudou = true;
    }
    if (!Array.isArray(m.rendas)) {
      m.rendas = m.renda
        ? [{ id: _gerarId(), tipo: 'dinheiro', banco: null, valor: Number(m.renda) || 0 }]
        : [];
      delete m.renda;
      mudou = true;
    }
    if (!Array.isArray(m.contas)) {
      m.contas = [];
      mudou = true;
    }

    if (mudou) _salvarTudo(dados);
    return m;
  }

  function adicionarRenda(chave, tipo, banco, valor, criadoPor) {
    mes(chave); // garante estrutura/migração já salva
    const dados = _lerTudo();
    dados[chave].rendas.push({
      id: _gerarId(),
      tipo: tipo === 'banco' ? 'banco' : 'dinheiro',
      banco: tipo === 'banco' ? (banco || '').trim() : null,
      valor: Math.max(0, Number(valor) || 0),
      criadoPor: criadoPor || null,
    });
    _salvarTudo(dados);
  }

  function excluirRenda(chave, id) {
    const dados = _lerTudo();
    if (!dados[chave]) return;
    dados[chave].rendas = (dados[chave].rendas || []).filter((r) => r.id !== id);
    _salvarTudo(dados);
  }

  function adicionarConta(chave, nome, valor, vencimento, observacao, criadoPor) {
    mes(chave); // garante estrutura/migração já salva
    const dados = _lerTudo();
    dados[chave].contas.push({
      id: _gerarId(),
      nome: nome.trim(),
      valor: Math.max(0, Number(valor) || 0),
      vencimento: vencimento || null, // "AAAA-MM-DD" ou null (opcional, só pra registro)
      observacao: (observacao || '').trim(), // texto livre, opcional
      criadoPor: criadoPor || null, // quem cadastrou (Davi/Kauane), só pra registro
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

  return {
    mes,
    adicionarRenda,
    excluirRenda,
    adicionarConta,
    alternarPaga,
    excluirConta,
  };
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

  /** "AAAA-MM-DD" -> Date local (evita o problema de fuso horário do "new Date(string)") */
  function dataLocal(iso) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    return new Date(ano, mes - 1, dia);
  }

  /** "AAAA-MM-DD" -> "dd/mm" (ou "dd/mm/aaaa" se for de outro ano) */
  function dataCurta(iso) {
    if (!iso) return '';
    const d = dataLocal(iso);
    const hoje = new Date();
    const opcoes = { day: '2-digit', month: '2-digit' };
    if (d.getFullYear() !== hoje.getFullYear()) opcoes.year = 'numeric';
    return d.toLocaleDateString('pt-BR', opcoes);
  }

  /** true se a data (AAAA-MM-DD) já passou em relação a hoje */
  function dataVencida(iso) {
    if (!iso) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return dataLocal(iso) < hoje;
  }

  return { dinheiro, paraNumero, chaveMes, rotuloMes, dataCurta, dataVencida };
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

    const disponivel = mesDados.rendas.reduce((s, r) => s + r.valor, 0);
    const totalPagar = mesDados.contas.reduce((s, c) => s + c.valor, 0);
    const totalPago = mesDados.contas.filter((c) => c.paga).reduce((s, c) => s + c.valor, 0);
    const saldo = disponivel - totalPagar;

    $('#valor-disponivel').textContent = Formato.dinheiro(disponivel);
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
      const atrasada = !conta.paga && Formato.dataVencida(conta.vencimento);
      const li = document.createElement('li');
      li.className = 'conta' + (conta.paga ? ' conta--paga' : '');

      const venc = conta.vencimento
        ? `<span class="conta__vencimento${atrasada ? ' conta__vencimento--atrasada' : ''}">
             ${atrasada ? 'venceu em' : 'vence em'} ${Formato.dataCurta(conta.vencimento)}
           </span>`
        : '';

      const obsMarca = conta.observacao ? '<span class="conta__obs-marca">📝</span>' : '';
      const autor = conta.criadoPor
        ? `<span class="conta__autor">${escapar(conta.criadoPor)}</span>`
        : '';

      li.innerHTML = `
        <input type="checkbox" class="conta__check" ${conta.paga ? 'checked' : ''}
               aria-label="Marcar ${conta.nome} como paga" />
        <button type="button" class="conta__info" aria-label="Ver detalhes de ${escapar(conta.nome)}">
          <span class="conta__textos">
            <span class="conta__nome">${escapar(conta.nome)}${obsMarca}</span>
            <span class="conta__valor">${Formato.dinheiro(conta.valor)}${venc}${autor}</span>
          </span>
          <svg class="conta__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
        </button>
        <button class="conta__excluir" type="button" aria-label="Excluir ${escapar(conta.nome)}">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>
        </button>`;

      li.querySelector('.conta__check').addEventListener('change', () => {
        Store.alternarPaga(chave(), conta.id);
        render();
      });
      li.querySelector('.conta__info').addEventListener('click', () => {
        Modais.abrirDetalhe(conta, chave());
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
  let tipoRendaAtual = 'dinheiro';

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
      const vencimento = $('#conta-vencimento').value || null;
      const observacao = $('#conta-observacao').value;
      if (!nome) return;
      const usuario = Auth.sessaoAtual()?.usuario;
      Store.adicionarConta(Painel.chave(), nome, valor, vencimento, observacao, usuario);
      fecharTodos();
      Painel.render();
      toast('Conta adicionada');
    });

    // alterna entre "Dinheiro" e "Conta bancária" no formulário de renda
    $$('.renda-tipo-btn').forEach((btn) => {
      btn.addEventListener('click', () => selecionarTipoRenda(btn.dataset.tipo));
    });

    $('#form-renda').addEventListener('submit', (e) => {
      e.preventDefault();
      const banco = $('#renda-banco').value.trim();
      const valor = Formato.paraNumero($('#renda-valor').value);

      if (tipoRendaAtual === 'banco' && !banco) {
        $('#renda-banco').focus();
        return;
      }

      const usuario = Auth.sessaoAtual()?.usuario;
      Store.adicionarRenda(Painel.chave(), tipoRendaAtual, banco, valor, usuario);
      $('#renda-valor').value = '';
      $('#renda-banco').value = '';
      renderRendaLista(Painel.chave());
      Painel.render();
      toast('Fonte adicionada');
      $('#renda-valor').focus();
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

  /* ---- Dinheiro disponível (várias fontes: dinheiro / conta bancária) ---- */

  function selecionarTipoRenda(tipo) {
    tipoRendaAtual = tipo;
    $$('.renda-tipo-btn').forEach((btn) => btn.classList.toggle('is-ativo', btn.dataset.tipo === tipo));
    $('#campo-renda-banco').hidden = tipo !== 'banco';
    $('#renda-valor-rotulo').textContent = tipo === 'banco' ? 'Valor na conta (R$)' : 'Valor em espécie (R$)';
  }

  function renderRendaLista(chave) {
    const mesDados = Store.mes(chave);
    const ul = $('#lista-rendas');
    ul.innerHTML = '';
    $('#rendas-vazio').hidden = mesDados.rendas.length > 0;

    for (const r of mesDados.rendas) {
      const li = document.createElement('li');
      li.className = 'renda-item';
      const nome = r.tipo === 'banco' ? (r.banco || 'Conta bancária') : 'Dinheiro em espécie';
      const icone = r.tipo === 'banco' ? '🏦' : '💵';
      li.innerHTML = `
        <span class="renda-item__icone" aria-hidden="true">${icone}</span>
        <span class="renda-item__info">
          <span class="renda-item__nome"></span>
          <span class="renda-item__valor"></span>
        </span>
        <button class="renda-item__excluir" type="button" aria-label="Remover ${nome}">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>
        </button>`;
      // via textContent: sem risco de HTML no nome do banco
      li.querySelector('.renda-item__nome').textContent = nome;
      li.querySelector('.renda-item__valor').textContent =
        Formato.dinheiro(r.valor) + (r.criadoPor ? ` · ${r.criadoPor}` : '');
      li.querySelector('.renda-item__excluir').addEventListener('click', () => {
        Store.excluirRenda(chave, r.id);
        renderRendaLista(chave);
        Painel.render();
        toast('Fonte removida');
      });
      ul.appendChild(li);
    }

    const total = mesDados.rendas.reduce((s, r) => s + r.valor, 0);
    $('#renda-total-valor').textContent = Formato.dinheiro(total);
  }

  function abrirRenda(chave) {
    renderRendaLista(chave);
    $('#renda-valor').value = '';
    $('#renda-banco').value = '';
    selecionarTipoRenda('dinheiro');
    abrir('modal-renda');
    setTimeout(() => $('#renda-valor').focus(), 50);
  }

  /* ---- Detalhes da conta ---- */

  function abrirDetalhe(conta, chave) {
    const atrasada = !conta.paga && Formato.dataVencida(conta.vencimento);

    $('#detalhe-nome').textContent = conta.nome;
    $('#detalhe-valor').textContent = Formato.dinheiro(conta.valor);

    const status = $('#detalhe-status');
    status.textContent = conta.paga ? 'Paga' : atrasada ? 'Atrasada' : 'Pendente';
    status.className =
      'detalhe__status' +
      (conta.paga ? ' detalhe__status--paga' : atrasada ? ' detalhe__status--atrasada' : '');

    $('#detalhe-linha-vencimento').hidden = !conta.vencimento;
    if (conta.vencimento) $('#detalhe-vencimento').textContent = Formato.dataCurta(conta.vencimento);

    $('#detalhe-linha-obs').hidden = !conta.observacao;
    $('#detalhe-observacao').textContent = conta.observacao || '';

    const elAutor = $('#detalhe-autor');
    elAutor.hidden = !conta.criadoPor;
    elAutor.textContent = conta.criadoPor ? `Adicionado por ${conta.criadoPor}` : '';

    const btnPagar = $('#btn-detalhe-pagar');
    btnPagar.textContent = conta.paga ? 'Marcar como não paga' : 'Marcar como paga';
    btnPagar.onclick = () => {
      Store.alternarPaga(chave, conta.id);
      fecharTodos();
      Painel.render();
      toast(conta.paga ? 'Conta reaberta' : 'Conta paga');
    };

    $('#btn-detalhe-excluir').onclick = () => {
      fecharTodos();
      confirmarExclusao(conta, () => {
        Store.excluirConta(chave, conta.id);
        Painel.render();
        toast('Conta excluída');
      });
    };

    abrir('modal-detalhe');
  }

  function confirmarExclusao(conta, aoConfirmar) {
    $('#modal-confirma-texto').textContent =
      `"${conta.nome}" (${Formato.dinheiro(conta.valor)}) será removida deste mês.`;
    alvoExclusao = aoConfirmar;
    abrir('modal-confirma');
  }

  return { init, abrirConta, abrirRenda, abrirDetalhe, confirmarExclusao, fecharTodos };
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

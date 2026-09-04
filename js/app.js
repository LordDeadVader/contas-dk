/* ============================================================
   app.js — Contas DK
   Organização:
     1. Store       -> leitura/escrita no localStorage
     2. Formato     -> helpers de dinheiro e datas
     3. UI          -> seletores e toast
     4. Login       -> Tela 1
     5. Painel      -> Tela 2, aba Início (resumo + lista de contas)
     6. Abas        -> alterna entre Início e Relatórios
     7. Relatórios  -> Tela 2, aba Relatórios (histórico e gráficos)
     8. Modais      -> nova conta / renda / detalhe / confirmação
     9. PWA         -> service worker + botão instalar
    10. Início      -> amarra tudo
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

  /** "AAAA-MM" + n meses -> "AAAA-MM" */
  function _somarMes(chave, n) {
    const [ano, mes] = chave.split('-').map(Number);
    const d = new Date(ano, mes - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** "AAAA-MM-DD" + 1 mês -> "AAAA-MM-DD" (mantém o dia, ajustando se o mês seguinte for mais curto) */
  function _somarMesData(iso) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const ultimoDiaProxMes = new Date(ano, mes + 1, 0).getDate();
    const d = new Date(ano, mes, Math.min(dia, ultimoDiaProxMes));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Lança automaticamente a próxima parcela de compras parceladas, quando o
   * mês seguinte ao da última parcela conhecida é justamente o mês que está
   * sendo aberto agora. Ou seja: a parcela "lembra" de si mesma assim que
   * você chega no mês dela — sem precisar recadastrar nada.
   */
  function _avancarParcelamentos(chaveAlvo, dados) {
    const alvo = dados[chaveAlvo];
    if (!alvo) return false;
    let mudou = false;

    const ultimaPorGrupo = {}; // grupoId -> { chave, conta }
    for (const chaveMes of Object.keys(dados)) {
      for (const c of dados[chaveMes]?.contas || []) {
        if (!c.parcelamento) continue;
        const atual = ultimaPorGrupo[c.parcelamento.grupoId];
        if (!atual || chaveMes > atual.chave) {
          ultimaPorGrupo[c.parcelamento.grupoId] = { chave: chaveMes, conta: c };
        }
      }
    }

    for (const grupoId in ultimaPorGrupo) {
      const { chave: chaveUltima, conta: contaUltima } = ultimaPorGrupo[grupoId];
      const { atual, total } = contaUltima.parcelamento;
      if (atual >= total) continue;
      if (_somarMes(chaveUltima, 1) !== chaveAlvo) continue;

      const jaExiste = alvo.contas.some((c) => c.parcelamento && c.parcelamento.grupoId === grupoId);
      if (jaExiste) continue;

      alvo.contas.push({
        id: _gerarId(),
        nome: contaUltima.nome,
        valor: contaUltima.valor,
        vencimento: contaUltima.vencimento ? _somarMesData(contaUltima.vencimento) : null,
        observacao: contaUltima.observacao,
        criadoPor: contaUltima.criadoPor,
        paga: false,
        desconto: 0,
        parcelamento: { grupoId, atual: atual + 1, total },
      });
      mudou = true;
    }

    return mudou;
  }

  /**
   * Retorna o mês (cria vazio se não existir). Chave no formato "AAAA-MM".
   * Também migra meses antigos, que guardavam um único número em "renda",
   * para a lista "rendas" (várias fontes: dinheiro/banco), e lança a próxima
   * parcela de compras parceladas quando for a vez desse mês.
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

    if (_avancarParcelamentos(chave, dados)) mudou = true;

    if (mudou) _salvarTudo(dados);
    return dados[chave];
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

  function adicionarConta(chave, nome, valor, vencimento, observacao, criadoPor, parcelamento) {
    mes(chave); // garante estrutura/migração já salva
    const dados = _lerTudo();
    const valorNum = Math.max(0, Number(valor) || 0);
    dados[chave].contas.push({
      id: _gerarId(),
      nome: nome.trim(),
      valor: valorNum,
      vencimento: vencimento || null, // "AAAA-MM-DD" ou null (opcional, só pra registro)
      observacao: (observacao || '').trim(), // texto livre, opcional
      criadoPor: criadoPor || null, // quem cadastrou (Davi/Kauane), só pra registro
      paga: false,
      desconto: 0, // desconto por pagamento adiantado, só existe quando paga=true
      parcelamento: parcelamento
        ? { grupoId: _gerarId(), atual: parcelamento.atual, total: parcelamento.total }
        : null,
    });
    _salvarTudo(dados);
  }

  /** Toque rápido no checkbox da lista: só alterna paga/não paga, sem desconto. */
  function alternarPaga(chave, id) {
    const dados = _lerTudo();
    const conta = (dados[chave]?.contas || []).find((c) => c.id === id);
    if (conta) {
      conta.paga = !conta.paga;
      if (!conta.paga) conta.desconto = 0;
    }
    _salvarTudo(dados);
  }

  /** Usado pelo modal de detalhes: confirma pagamento (com desconto opcional) ou reabre a conta. */
  function definirPagamento(chave, id, paga, desconto) {
    const dados = _lerTudo();
    const conta = (dados[chave]?.contas || []).find((c) => c.id === id);
    if (conta) {
      conta.paga = paga;
      conta.desconto = paga ? Math.max(0, Math.min(conta.valor, Number(desconto) || 0)) : 0;
    }
    _salvarTudo(dados);
  }

  function excluirConta(chave, id) {
    const dados = _lerTudo();
    if (!dados[chave]) return;
    dados[chave].contas = dados[chave].contas.filter((c) => c.id !== id);
    _salvarTudo(dados);
  }

  /** Chaves ("AAAA-MM") de todos os meses que já têm algo salvo, em ordem crescente. */
  function chavesExistentes() {
    return Object.keys(_lerTudo()).sort();
  }

  /**
   * Como mes(), mas nunca escreve no localStorage — útil para relatórios,
   * que passeiam por vários meses (inclusive meses vazios) só para ler.
   */
  function obterSomenteLeitura(chave) {
    const m = _lerTudo()[chave];
    if (!m) return { rendas: [], contas: [] };
    if (!Array.isArray(m.rendas)) {
      const rendas = m.renda
        ? [{ id: 'legado', tipo: 'dinheiro', banco: null, valor: Number(m.renda) || 0, criadoPor: null }]
        : [];
      return { rendas, contas: Array.isArray(m.contas) ? m.contas : [] };
    }
    return m;
  }

  return {
    mes,
    adicionarRenda,
    excluirRenda,
    adicionarConta,
    alternarPaga,
    definirPagamento,
    excluirConta,
    chavesExistentes,
    obterSomenteLeitura,
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

  /** "AAAA-MM" -> Date local do primeiro dia daquele mês */
  function dataDaChave(chave) {
    const [ano, mes] = chave.split('-').map(Number);
    return new Date(ano, mes - 1, 1);
  }

  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /** "AAAA-MM" -> "set/26" (rótulo curto pro gráfico e histórico) */
  function rotuloMesCurto(chave) {
    const [ano, mes] = chave.split('-');
    return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
  }

  /** valor -> "R$ 1,2 mil" (compacto, pra caber nas barras do gráfico) */
  function dinheiroCompacto(valor) {
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(Number(valor) || 0);
    } catch (e) {
      return dinheiro(valor);
    }
  }

  return {
    dinheiro,
    dinheiroCompacto,
    paraNumero,
    chaveMes,
    rotuloMes,
    dataCurta,
    dataVencida,
    dataDaChave,
    rotuloMesCurto,
  };
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

/**
 * Valor efetivo de uma conta: se já foi paga, aplica o desconto por
 * pagamento adiantado (quando houver). Se ainda não foi paga, é o valor cheio.
 */
function custoConta(conta) {
  return conta.paga ? Math.max(0, conta.valor - (conta.desconto || 0)) : conta.valor;
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
    Abas.selecionar('inicio');
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

  /** Usado pelo relatório: pula pro mês escolhido e mostra a aba Início. */
  function irParaMes(chaveAlvo) {
    dataAtual = Formato.dataDaChave(chaveAlvo);
    Abas.selecionar('inicio');
    render();
  }

  function render() {
    const mesDados = Store.mes(chave());
    $('#mes-titulo').textContent = Formato.rotuloMes(dataAtual);

    const disponivel = mesDados.rendas.reduce((s, r) => s + r.valor, 0);
    const totalPagar = mesDados.contas.reduce((s, c) => s + custoConta(c), 0);
    const totalPago = mesDados.contas.filter((c) => c.paga).reduce((s, c) => s + custoConta(c), 0);
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
      const parcelaChip = conta.parcelamento
        ? `<span class="conta__parcela">${conta.parcelamento.atual}/${conta.parcelamento.total}</span>`
        : '';
      const temDesconto = conta.paga && conta.desconto > 0;
      const valorTexto = temDesconto
        ? `<s class="conta__valor-original">${Formato.dinheiro(conta.valor)}</s> ${Formato.dinheiro(custoConta(conta))}`
        : Formato.dinheiro(conta.valor);

      li.innerHTML = `
        <input type="checkbox" class="conta__check" ${conta.paga ? 'checked' : ''}
               aria-label="Marcar ${conta.nome} como paga" />
        <button type="button" class="conta__info" aria-label="Ver detalhes de ${escapar(conta.nome)}">
          <span class="conta__textos">
            <span class="conta__nome">${escapar(conta.nome)}${parcelaChip}${obsMarca}</span>
            <span class="conta__valor">${valorTexto}${venc}${autor}</span>
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

  return { init, abrir, render, chave, irParaMes };
})();


/* ---------- 6. ABAS (Início / Relatórios) ----------------------- */

const Abas = (() => {
  function init() {
    $$('.aba-btn').forEach((btn) => {
      btn.addEventListener('click', () => selecionar(btn.dataset.aba));
    });
  }

  function selecionar(aba) {
    $$('.aba-btn').forEach((btn) => btn.classList.toggle('is-ativa', btn.dataset.aba === aba));
    $('#pagina-inicio').hidden = aba !== 'inicio';
    $('#pagina-relatorios').hidden = aba !== 'relatorios';
    $('#rodape-inicio').hidden = aba !== 'inicio';
    $('.mes-nav').hidden = aba !== 'inicio';

    if (aba === 'relatorios') Relatorios.render();
  }

  return { init, selecionar };
})();


/* ---------- 7. RELATÓRIOS ---------------------------------------- */

const Relatorios = (() => {
  let periodoAtual = '6';
  const ALTURA_MAX_GRAFICO = 120; // px

  function init() {
    $$('.periodo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        periodoAtual = btn.dataset.periodo;
        $$('.periodo-btn').forEach((b) => b.classList.toggle('is-ativo', b === btn));
        render();
      });
    });
  }

  /** Chaves "AAAA-MM" do período escolhido, em ordem crescente (mais antigo primeiro). */
  function chavesDoPeriodo() {
    if (periodoAtual === 'todos') return Store.chavesExistentes();
    const n = periodoAtual === '12' ? 12 : 6;
    const hoje = new Date();
    const chaves = [];
    for (let i = n - 1; i >= 0; i--) {
      chaves.push(Formato.chaveMes(new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)));
    }
    return chaves;
  }

  function render() {
    const meses = chavesDoPeriodo().map((chave) => ({ chave, dados: Store.obterSomenteLeitura(chave) }));

    let totalPago = 0;
    let totalPendente = 0;
    let totalDisponivel = 0;
    const porUsuario = {};

    const registrar = (nome) => {
      if (!porUsuario[nome]) porUsuario[nome] = { contasQtd: 0, contasValor: 0, rendasQtd: 0, rendasValor: 0 };
      return porUsuario[nome];
    };

    for (const { dados } of meses) {
      for (const c of dados.contas) {
        if (c.paga) totalPago += custoConta(c);
        else totalPendente += c.valor;
        const u = registrar(c.criadoPor || 'Não informado');
        u.contasQtd++;
        u.contasValor += c.valor;
      }
      for (const r of dados.rendas) {
        totalDisponivel += r.valor;
        const u = registrar(r.criadoPor || 'Não informado');
        u.rendasQtd++;
        u.rendasValor += r.valor;
      }
    }

    $('#rel-total-pago').textContent = Formato.dinheiro(totalPago);
    $('#rel-total-pendente').textContent = Formato.dinheiro(totalPendente);
    $('#rel-total-disponivel').textContent = Formato.dinheiro(totalDisponivel);

    const saldoPeriodo = totalDisponivel - (totalPago + totalPendente);
    const elSaldo = $('#rel-saldo-periodo');
    elSaldo.textContent = Formato.dinheiro(saldoPeriodo);
    elSaldo.classList.toggle('card__valor--positivo', saldoPeriodo >= 0);
    elSaldo.classList.toggle('card__valor--negativo', saldoPeriodo < 0);

    renderGrafico(meses);
    renderPorUsuario(porUsuario);
    renderHistorico(meses);
  }

  function renderGrafico(meses) {
    const el = $('#rel-grafico');
    el.innerHTML = '';

    const maxValor = Math.max(1, ...meses.map(({ dados }) => dados.contas.reduce((s, c) => s + custoConta(c), 0)));
    const mesAtual = Painel.chave();

    for (const { chave, dados } of meses) {
      const pago = dados.contas.filter((c) => c.paga).reduce((s, c) => s + custoConta(c), 0);
      const pendente = dados.contas.filter((c) => !c.paga).reduce((s, c) => s + c.valor, 0);
      const total = pago + pendente;
      const alturaPaga = Math.round((pago / maxValor) * ALTURA_MAX_GRAFICO);
      const alturaPendente = Math.round((pendente / maxValor) * ALTURA_MAX_GRAFICO);

      const col = document.createElement('div');
      col.className = 'grafico-coluna';
      col.innerHTML = `
        <span class="grafico-valor"></span>
        <div class="grafico-trilho">
          <div class="grafico-barra grafico-barra--paga" style="height:${alturaPaga}px"></div>
          <div class="grafico-barra grafico-barra--pendente" style="height:${alturaPendente}px"></div>
        </div>
        <span class="grafico-rotulo"></span>`;
      col.querySelector('.grafico-valor').textContent = total > 0 ? Formato.dinheiroCompacto(total) : '';
      const rotulo = col.querySelector('.grafico-rotulo');
      rotulo.textContent = Formato.rotuloMesCurto(chave);
      rotulo.classList.toggle('grafico-rotulo--atual', chave === mesAtual);

      el.appendChild(col);
    }
  }

  function renderPorUsuario(porUsuario) {
    const el = $('#rel-por-usuario');
    el.innerHTML = '';

    // sempre mostra os usuários cadastrados (mesmo zerados) + qualquer registro antigo sem autor
    const usuarios = Auth.listarUsuarios();
    const nomes = [...usuarios, ...Object.keys(porUsuario).filter((n) => !usuarios.includes(n))];

    for (const nome of nomes) {
      const dado = porUsuario[nome] || { contasQtd: 0, contasValor: 0, rendasQtd: 0, rendasValor: 0 };
      const card = document.createElement('div');
      card.className = 'rel-usuario-card';
      card.innerHTML = `
        <div class="rel-usuario-cabecalho">
          <span class="rel-usuario-inicial"></span>
          <span class="rel-usuario-nome"></span>
        </div>
        <div class="rel-usuario-linha">
          <span>Contas cadastradas</span>
          <strong>${dado.contasQtd} · ${Formato.dinheiro(dado.contasValor)}</strong>
        </div>
        <div class="rel-usuario-linha">
          <span>Dinheiro adicionado</span>
          <strong>${dado.rendasQtd} · ${Formato.dinheiro(dado.rendasValor)}</strong>
        </div>`;
      card.querySelector('.rel-usuario-inicial').textContent = nome.charAt(0).toUpperCase();
      card.querySelector('.rel-usuario-nome').textContent = nome;
      el.appendChild(card);
    }
  }

  function renderHistorico(meses) {
    const ul = $('#rel-historico');
    ul.innerHTML = '';

    // só meses com algo cadastrado, do mais recente pro mais antigo
    const comDados = meses.filter(({ dados }) => dados.contas.length > 0 || dados.rendas.length > 0).reverse();
    $('#rel-historico-vazio').hidden = comDados.length > 0;

    for (const { chave, dados } of comDados) {
      const saldo = dados.rendas.reduce((s, r) => s + r.valor, 0) - dados.contas.reduce((s, c) => s + c.valor, 0);

      const li = document.createElement('li');
      li.innerHTML = `
        <button type="button" class="historico-item">
          <span class="historico-mes"></span>
          <span class="historico-saldo"></span>
        </button>`;
      li.querySelector('.historico-mes').textContent = Formato.rotuloMes(Formato.dataDaChave(chave));
      const elSaldo = li.querySelector('.historico-saldo');
      elSaldo.textContent = Formato.dinheiro(saldo);
      elSaldo.classList.add(saldo >= 0 ? 'card__valor--positivo' : 'card__valor--negativo');
      li.querySelector('.historico-item').addEventListener('click', () => Painel.irParaMes(chave));

      ul.appendChild(li);
    }
  }

  return { init, render };
})();


/* ---------- 8. MODAIS ------------------------------------------ */

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

    // mostra/esconde os campos de parcelamento
    $('#conta-parcelado').addEventListener('change', (e) => {
      $('#campo-parcelamento').hidden = !e.target.checked;
      atualizarValorTotalParcela();
    });
    $('#conta-valor').addEventListener('input', atualizarValorTotalParcela);
    $('#conta-parcela-total').addEventListener('input', atualizarValorTotalParcela);

    $('#form-conta').addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = $('#conta-nome').value.trim();
      const valor = Formato.paraNumero($('#conta-valor').value);
      const vencimento = $('#conta-vencimento').value || null;
      const observacao = $('#conta-observacao').value;
      if (!nome) return;

      let parcelamento = null;
      if ($('#conta-parcelado').checked) {
        const atual = Math.max(1, parseInt($('#conta-parcela-atual').value, 10) || 1);
        const total = Math.max(atual, parseInt($('#conta-parcela-total').value, 10) || 0);
        if (!total) {
          $('#conta-parcela-total').focus();
          return;
        }
        parcelamento = { atual, total };
      }

      const usuario = Auth.sessaoAtual()?.usuario;
      Store.adicionarConta(Painel.chave(), nome, valor, vencimento, observacao, usuario, parcelamento);
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
    $('#campo-parcelamento').hidden = true;
    $('#conta-parcela-atual').value = 1;
    $('#parcela-valor-total').textContent = Formato.dinheiro(0);
    abrir('modal-conta');
    setTimeout(() => $('#conta-nome').focus(), 50);
  }

  function atualizarValorTotalParcela() {
    const valor = Formato.paraNumero($('#conta-valor').value);
    const total = parseInt($('#conta-parcela-total').value, 10) || 0;
    $('#parcela-valor-total').textContent = Formato.dinheiro(valor * total);
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

    const temDesconto = conta.paga && conta.desconto > 0;
    $('#detalhe-linha-desconto').hidden = !temDesconto;
    if (temDesconto) $('#detalhe-desconto-texto').textContent = '− ' + Formato.dinheiro(conta.desconto);

    $('#detalhe-linha-parcela').hidden = !conta.parcelamento;
    if (conta.parcelamento) {
      const totalCompra = conta.valor * conta.parcelamento.total;
      $('#detalhe-parcela-texto').textContent =
        `${conta.parcelamento.atual} de ${conta.parcelamento.total} · total da compra ${Formato.dinheiro(totalCompra)}`;
    }

    $('#detalhe-linha-vencimento').hidden = !conta.vencimento;
    if (conta.vencimento) $('#detalhe-vencimento').textContent = Formato.dataCurta(conta.vencimento);

    $('#detalhe-linha-obs').hidden = !conta.observacao;
    $('#detalhe-observacao').textContent = conta.observacao || '';

    const elAutor = $('#detalhe-autor');
    elAutor.hidden = !conta.criadoPor;
    elAutor.textContent = conta.criadoPor ? `Adicionado por ${conta.criadoPor}` : '';

    // formulário de pagamento (com desconto opcional) começa sempre fechado
    const formPagamento = $('#detalhe-form-pagamento');
    formPagamento.hidden = true;
    $('#detalhe-desconto-input').value = '';
    $('#detalhe-acoes-principais').hidden = false;

    const btnPagar = $('#btn-detalhe-pagar');
    btnPagar.textContent = conta.paga ? 'Marcar como não paga' : 'Marcar como paga';
    btnPagar.onclick = () => {
      if (conta.paga) {
        // reabrir não tem desconto pra pensar: é direto
        Store.definirPagamento(chave, conta.id, false, 0);
        fecharTodos();
        Painel.render();
        toast('Conta reaberta');
      } else {
        // abre o mini-formulário pra registrar (opcionalmente) o desconto
        $('#detalhe-acoes-principais').hidden = true;
        formPagamento.hidden = false;
        atualizarPreviewPagamento(conta.valor);
        setTimeout(() => $('#detalhe-desconto-input').focus(), 50);
      }
    };

    $('#detalhe-desconto-input').oninput = () => atualizarPreviewPagamento(conta.valor);

    $('#btn-cancelar-pagamento').onclick = () => {
      formPagamento.hidden = true;
      $('#detalhe-acoes-principais').hidden = false;
    };

    $('#btn-confirmar-pagamento').onclick = () => {
      const desconto = Formato.paraNumero($('#detalhe-desconto-input').value);
      Store.definirPagamento(chave, conta.id, true, desconto);
      fecharTodos();
      Painel.render();
      toast(desconto > 0 ? `Conta paga com desconto de ${Formato.dinheiro(desconto)}` : 'Conta paga');
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

  function atualizarPreviewPagamento(valorOriginal) {
    const desconto = Formato.paraNumero($('#detalhe-desconto-input').value);
    const efetivo = Math.max(0, valorOriginal - desconto);
    $('#detalhe-valor-pago-preview').textContent = Formato.dinheiro(efetivo);
  }

  function confirmarExclusao(conta, aoConfirmar) {
    $('#modal-confirma-texto').textContent =
      `"${conta.nome}" (${Formato.dinheiro(conta.valor)}) será removida deste mês.`;
    alvoExclusao = aoConfirmar;
    abrir('modal-confirma');
  }

  return { init, abrirConta, abrirRenda, abrirDetalhe, confirmarExclusao, fecharTodos };
})();


/* ---------- 9. PWA -------------------------------------------- */

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


/* ---------- 10. INÍCIO ---------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  Login.init();
  Painel.init();
  Abas.init();
  Relatorios.init();
  Modais.init();
  PWA.init();

  if (Auth.sessaoAtual()) {
    Painel.abrir();
  } else {
    mostrarTela('tela-login');
  }
});

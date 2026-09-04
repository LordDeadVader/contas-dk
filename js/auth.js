/* ============================================================
   auth.js — login simples por PIN (proteção básica de acesso)
   Não é segurança real: é só para separar quem está usando.
   ============================================================ */

const Auth = (() => {
  const CHAVE_SESSAO = 'contasdk_sessao';

  // Usuários permitidos e seus PINs. Uso 100% pessoal.
  const USUARIOS = {
    Davi: '1234',
    Kauane: '1234',
  };

  /** Lista de nomes disponíveis. */
  function listarUsuarios() {
    return Object.keys(USUARIOS);
  }

  /** Confere o PIN de um usuário. */
  function validar(usuario, pin) {
    return USUARIOS[usuario] !== undefined && USUARIOS[usuario] === String(pin);
  }

  /** Salva a sessão no localStorage. */
  function entrar(usuario) {
    const sessao = { usuario, desde: Date.now() };
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    return sessao;
  }

  /** Remove a sessão. */
  function sair() {
    localStorage.removeItem(CHAVE_SESSAO);
  }

  /** Retorna a sessão atual (ou null). */
  function sessaoAtual() {
    try {
      const bruto = localStorage.getItem(CHAVE_SESSAO);
      if (!bruto) return null;
      const sessao = JSON.parse(bruto);
      return USUARIOS[sessao.usuario] !== undefined ? sessao : null;
    } catch (e) {
      return null;
    }
  }

  return { listarUsuarios, validar, entrar, sair, sessaoAtual };
})();

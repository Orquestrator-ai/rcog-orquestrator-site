// As rotas são materializadas no próprio site. A permissão de operação vem de uma única configuração central.
(function iniciarContagem(config) {
  'use strict';
  const api = 'https://orquestrator-contagem.netlify.app';
  if (config.api !== api || location.protocol !== 'https:' || location.hostname !== config.dominio || window.__contagemAtiva) return;
  window.__contagemAtiva = true;
  const configuracao = 'https://orquestrator.ai/assets/contagem/config.json';
  const ttl = 5 * 60 * 1000;
  const rotas = new Set(config.rotas);
  const metas = new Set(['abrir-app', 'baixar-app', 'instalar-app', 'abrir-produto', 'cadastro', 'contato', 'download']);
  let pagina = '', ultimaRota = '', inicio = null, acumulado = 0, rolagem = 0;
  let ligada = false, validade = 0, pedido, alarme;
  const envios = new Set();

  function permitida() {
    try {
      return !navigator.webdriver && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1'
        && !localStorage.getItem('contagem_ignorar')
        && JSON.parse(localStorage.getItem('cookie-consent-v1'))?.analytics === true;
    } catch { return false; }
  }
  function rota() {
    let caminho = location.pathname;
    if (!rotas.has(caminho)) return '';
    if (caminho.endsWith('/index.html')) caminho = caminho.slice(0, -10);
    if (rotas.has(caminho + '/')) caminho += '/';
    return caminho;
  }
  function enviar(tipo, caminho, dados) {
    if (!caminho || !permitida() || !ligada || performance.now() >= validade) return;
    const evento = {id:crypto.randomUUID(), t:tipo, h:config.dominio, s:config.dominio, p:caminho, ...dados};
    const controle = new AbortController();
    envios.add(controle);
    fetch(api + '/api/evento', {method:'POST', body:JSON.stringify(evento), credentials:'omit', signal:controle.signal,
      keepalive:true, referrerPolicy:'no-referrer', headers:{'Content-Type':'text/plain;charset=UTF-8'}})
      .catch(() => {}).finally(() => envios.delete(controle));
  }
  function medir() {
    if (!pagina || inicio === null) return;
    const altura = document.documentElement.scrollHeight;
    rolagem = Math.max(rolagem, altura > 0 ? Math.round(100 * Math.min(1, (scrollY + innerHeight) / altura)) : 0);
  }
  function interromperTempo() {
    if (inicio === null) return;
    acumulado += Math.max(0, Math.min(performance.now(),validade) - inicio);
    inicio = null;
  }
  function finalizar() {
    if (!pagina) return;
    medir();
    interromperTempo();
    enviar('fim',pagina,{d:Math.round(acumulado / 1000),r:rolagem});
    pagina = ''; acumulado = 0;
  }
  function limparVisita() {
    pagina = ''; ultimaRota = ''; inicio = null; acumulado = 0; rolagem = 0;
    for (const envio of envios) envio.abort();
    envios.clear();
  }
  function cancelarConsulta() {
    if (pedido) { pedido.abort(); pedido = undefined; }
    clearTimeout(alarme);
  }
  function consultar() {
    if (pedido) return;
    interromperTempo();
    const controle = new AbortController();
    pedido = controle;
    const limite = setTimeout(() => controle.abort(), 8000);
    async function ler() {
      let habilitada = false;
      try {
        const resposta = await fetch(configuracao,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
          referrerPolicy:'no-referrer',redirect:'error',signal:controle.signal});
        if (resposta.ok) {
          const valor = await resposta.json();
          habilitada = !controle.signal.aborted && valor?.coletaAtiva === true && valor.apiBase === api;
        }
      } catch {} finally { clearTimeout(limite); }
      // Outra aba, a revogação ou a navegação pode ter cancelado a leitura antes desta resposta.
      if (pedido !== controle) return;
      pedido = undefined;
      ligada = habilitada;
      validade = performance.now() + ttl;
      if (!ligada) limparVisita();
      atualizar();
    }
    ler();
  }
  function atualizar() {
    if (!permitida()) {
      cancelarConsulta(); limparVisita(); ligada = false; validade = 0;
      return;
    }
    const visivel = document.visibilityState === 'visible';
    const atual = rota();
    if (!visivel || !atual) {
      finalizar(); cancelarConsulta();
      if (!atual) ultimaRota = '';
      return;
    }
    if (performance.now() >= validade) {
      if (pagina && atual !== pagina) { pagina = ''; inicio = null; acumulado = 0; ultimaRota = ''; }
      consultar();
      return;
    }
    clearTimeout(alarme);
    alarme = setTimeout(atualizar, Math.max(1,validade - performance.now()));
    if (!ligada) return;
    if (atual === pagina) { if (inicio === null) inicio = performance.now(); return; }
    finalizar();
    if (ultimaRota !== atual) {
      let ref = '';
      try { const u = new URL(document.referrer); if (/^https?:$/.test(u.protocol)) ref = u.origin; } catch {}
      enviar('pv', atual, {r:ultimaRota ? location.origin : ref, w:innerWidth});
    }
    pagina = atual; ultimaRota = atual; inicio = performance.now(); acumulado = 0; rolagem = 0;
  }
  for (const metodo of ['pushState', 'replaceState']) {
    const original = history[metodo];
    history[metodo] = function (...args) {
      const retorno = original.apply(this, args);
      atualizar();
      return retorno;
    };
  }
  for (const nome of ['popstate','pageshow','storage','contagem:consentimento']) addEventListener(nome, atualizar);
  addEventListener('pagehide', () => { finalizar(); cancelarConsulta(); });
  addEventListener('scroll', medir, {passive:true});
  document.addEventListener('visibilitychange', atualizar);
  document.addEventListener('click', ev => {
    const meta = ev.target.closest?.('[data-contagem]')?.dataset.contagem;
    if (metas.has(meta) && document.visibilityState === 'visible') enviar('ev',rota(),{e:meta});
  });
  atualizar();
})({"dominio":"rcog.orquestrator.ai","rotas":["/","/anuncios.html","/autoria.html","/index.html","/privacidade.html","/termos.html"],"api":"https://orquestrator-contagem.netlify.app"});

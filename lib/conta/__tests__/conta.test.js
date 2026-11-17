// Testes da conta: rodam com `node --test lib/conta/__tests__/conta.test.js`, sem planilha,
// sem e-mail e sem rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVALO_ENTRE_ENVIOS_MS, JANELA_ENVIOS_MS, MAX_CARACTERES, MAX_ENVIOS_NA_JANELA, MAX_TENTATIVAS, TAMANHO_PARTE,
  VALIDADE_CODIGO_MS, VALIDADE_SESSAO_MS, assinarSessao, conferirCodigo, dividirEmPartes, estadoVazio, gerarCodigo,
  hashCodigo, juntarPartes, lerSessao, podeEnviarCodigo, registrarEnvio, segredoDaConta
} from '../regras.js';
import { tratarConta, tratarDados } from '../handlers.js';

const SEGREDO = 'segredo-de-teste';
const AGORA = 1_800_000_000_000;

// ------------------------------------------------------------------ textos em partes

test('dividir e juntar devolve exatamente o mesmo texto, com acentos e emojis', () => {
  const texto = 'Ação ✨ coração — ' + 'ã'.repeat(TAMANHO_PARTE * 2 + 17);
  const partes = dividirEmPartes(texto);
  assert.equal(partes.length, 3);
  assert.ok(partes.every(p => p.length <= TAMANHO_PARTE));
  assert.equal(juntarPartes(partes), texto);
});

test('texto vazio não gera partes e texto grande demais é recusado', () => {
  assert.deepEqual(dividirEmPartes(''), []);
  assert.throws(() => dividirEmPartes('a'.repeat(MAX_CARACTERES + 1)), /tamanho máximo/);
  assert.equal(dividirEmPartes('a'.repeat(MAX_CARACTERES)).length, 20);
});

// ------------------------------------------------------------------ código

test('o código tem sempre 6 números', () => {
  for (let i = 0; i < 200; i++) assert.match(gerarCodigo(), /^\d{6}$/);
});

test('o código certo confirma uma vez só e depois deixa de valer', () => {
  const estado = registrarEnvio(estadoVazio(), AGORA, hashCodigo('a@a.com', '123456', SEGREDO));
  const ok = conferirCodigo(estado, 'a@a.com', '123456', SEGREDO, AGORA + 1000);
  assert.equal(ok.ok, true);
  const repetido = conferirCodigo(ok.estado, 'a@a.com', '123456', SEGREDO, AGORA + 2000);
  assert.equal(repetido.ok, false);
  assert.equal(repetido.motivo, 'sem_codigo');
});

test('o código de outro e-mail não confirma', () => {
  const estado = registrarEnvio(estadoVazio(), AGORA, hashCodigo('a@a.com', '123456', SEGREDO));
  assert.equal(conferirCodigo(estado, 'b@b.com', '123456', SEGREDO, AGORA + 1000).ok, false);
});

test('código errado conta tentativa e, na quinta, bloqueia mesmo se o próximo estiver certo', () => {
  let estado = registrarEnvio(estadoVazio(), AGORA, hashCodigo('a@a.com', '123456', SEGREDO));
  for (let i = 1; i < MAX_TENTATIVAS; i++) {
    const r = conferirCodigo(estado, 'a@a.com', '000000', SEGREDO, AGORA + 1000);
    assert.equal(r.motivo, 'errado');
    assert.equal(r.restantes, MAX_TENTATIVAS - i);
    estado = r.estado;
  }
  const ultima = conferirCodigo(estado, 'a@a.com', '000000', SEGREDO, AGORA + 1000);
  assert.equal(ultima.motivo, 'bloqueado');
  const depois = conferirCodigo(ultima.estado, 'a@a.com', '123456', SEGREDO, AGORA + 1500);
  assert.equal(depois.ok, false);
});

test('código vencido não confirma', () => {
  const estado = registrarEnvio(estadoVazio(), AGORA, hashCodigo('a@a.com', '123456', SEGREDO));
  const r = conferirCodigo(estado, 'a@a.com', '123456', SEGREDO, AGORA + VALIDADE_CODIGO_MS + 1);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'expirado');
});

test('pedir outro código zera as tentativas e troca o código antigo', () => {
  let estado = registrarEnvio(estadoVazio(), AGORA, hashCodigo('a@a.com', '111111', SEGREDO));
  estado = conferirCodigo(estado, 'a@a.com', '000000', SEGREDO, AGORA + 1000).estado;
  assert.equal(estado.tentativas, 1);
  const novo = registrarEnvio(estado, AGORA + INTERVALO_ENTRE_ENVIOS_MS + 1, hashCodigo('a@a.com', '222222', SEGREDO));
  assert.equal(novo.tentativas, 0);
  assert.equal(conferirCodigo(novo, 'a@a.com', '111111', SEGREDO, AGORA + INTERVALO_ENTRE_ENVIOS_MS + 5).ok, false);
});

test('limite de envios: 1 minuto entre dois códigos e 5 por hora', () => {
  assert.equal(podeEnviarCodigo(estadoVazio(), AGORA).permitido, true);

  let estado = registrarEnvio(estadoVazio(), AGORA, 'h');
  const cedo = podeEnviarCodigo(estado, AGORA + 10_000);
  assert.equal(cedo.permitido, false);
  assert.equal(cedo.motivo, 'muito_cedo');
  assert.equal(cedo.esperaSegundos, 50);

  let t = AGORA;
  for (let i = 1; i < MAX_ENVIOS_NA_JANELA; i++) {
    t += INTERVALO_ENTRE_ENVIOS_MS + 1;
    assert.equal(podeEnviarCodigo(estado, t).permitido, true);
    estado = registrarEnvio(estado, t, 'h');
  }
  t += INTERVALO_ENTRE_ENVIOS_MS + 1;
  const demais = podeEnviarCodigo(estado, t);
  assert.equal(demais.permitido, false);
  assert.equal(demais.motivo, 'muitos_envios');

  // passada uma hora desde o primeiro envio, volta a liberar
  assert.equal(podeEnviarCodigo(estado, AGORA + JANELA_ENVIOS_MS + 1).permitido, true);
});

// ------------------------------------------------------------------ sessão

test('a sessão assinada é aceita e traz o e-mail em minúsculas', () => {
  const { token } = assinarSessao('Ana@Exemplo.com ', SEGREDO, AGORA);
  const lida = lerSessao(token, SEGREDO, AGORA + 1000);
  assert.equal(lida.ok, true);
  assert.equal(lida.email, 'ana@exemplo.com');
});

test('a sessão não vale se foi mexida, se o segredo é outro ou se venceu', () => {
  const { token } = assinarSessao('ana@exemplo.com', SEGREDO, AGORA);
  const [carga, assin] = token.split('.');
  const outraCarga = Buffer.from(JSON.stringify({ e: 'outra@pessoa.com', x: AGORA + VALIDADE_SESSAO_MS, n: 'x' })).toString('base64url');
  assert.equal(lerSessao(outraCarga + '.' + assin, SEGREDO, AGORA).ok, false);
  assert.equal(lerSessao(carga + '.' + assin.slice(0, -2) + 'aa', SEGREDO, AGORA).ok, false);
  assert.equal(lerSessao(token, 'outro-segredo', AGORA).ok, false);
  assert.equal(lerSessao('lixo', SEGREDO, AGORA).ok, false);
  assert.equal(lerSessao('', SEGREDO, AGORA).ok, false);
  const vencida = lerSessao(token, SEGREDO, AGORA + VALIDADE_SESSAO_MS + 1);
  assert.equal(vencida.ok, false);
  assert.equal(vencida.motivo, 'expirada');
});

test('o segredo vem de SESSAO_SEGREDO ou, na falta dele, de USO_SEGREDO', () => {
  assert.equal(segredoDaConta({ SESSAO_SEGREDO: 'a', USO_SEGREDO: 'b' }), 'a');
  assert.equal(segredoDaConta({ USO_SEGREDO: 'b' }), 'b');
  assert.equal(segredoDaConta({}), '');
});

// ------------------------------------------------------------------ rotas

function criarArmazenamentoFalso(aprovados) {
  const contas = new Map();
  return {
    contas,
    async statusCompra(email) { return { existe: aprovados.has(email), aprovado: aprovados.has(email) }; },
    async lerConta(email) { return contas.has(email) ? structuredClone(contas.get(email)) : null; },
    async salvarConta(email, campos) {
      const atual = contas.get(email) || { versao: 0, atualizadoEm: '', estado: estadoVazio(), dados: '' };
      contas.set(email, { ...atual, ...structuredClone(campos) });
    }
  };
}

function ambiente() {
  const emails = [];
  const aprovados = new Set(['ana@exemplo.com', 'bia@exemplo.com']);
  const armazenamento = criarArmazenamentoFalso(aprovados);
  return {
    emails, aprovados, armazenamento,
    env: { USO_SEGREDO: SEGREDO },
    enviarEmail: async dados => { emails.push(dados); },
    conta: (corpo, agora = AGORA, extras = {}) => tratarConta({ metodo: 'POST', corpo, env: { USO_SEGREDO: SEGREDO }, agora, armazenamento, enviarEmail: async d => { emails.push(d); }, ...extras }),
    dados: (metodo, token, corpo, agora = AGORA) => tratarDados({ metodo, corpo, cabecalhos: token ? { authorization: 'Bearer ' + token } : {}, env: { USO_SEGREDO: SEGREDO }, agora, armazenamento })
  };
}

async function entrar(a, email = 'ana@exemplo.com', agora = AGORA) {
  await a.conta({ acao: 'pedir-codigo', email }, agora);
  const codigo = a.emails[a.emails.length - 1].codigo;
  const r = await a.conta({ acao: 'confirmar-codigo', email, codigo }, agora + 5000);
  assert.equal(r.status, 200);
  return r.corpo.token;
}

test('pedir código: quem não comprou não recebe e-mail', async () => {
  const a = ambiente();
  const r = await a.conta({ acao: 'pedir-codigo', email: 'estranha@exemplo.com' });
  assert.equal(r.status, 403);
  assert.equal(a.emails.length, 0);
  assert.equal(a.armazenamento.contas.size, 0);
});

test('pedir código: quem comprou recebe 6 números e o servidor guarda só o resumo, não o código', async () => {
  const a = ambiente();
  const r = await a.conta({ acao: 'pedir-codigo', email: 'Ana@Exemplo.com' });
  assert.equal(r.status, 200);
  assert.equal(a.emails.length, 1);
  assert.equal(a.emails[0].para, 'ana@exemplo.com');
  assert.match(a.emails[0].codigo, /^\d{6}$/);
  const guardado = a.armazenamento.contas.get('ana@exemplo.com');
  assert.ok(guardado.estado.codigoHash);
  assert.ok(!JSON.stringify(guardado).includes(a.emails[0].codigo));
});

test('pedir código duas vezes seguidas: o segundo pedido é recusado e não envia e-mail', async () => {
  const a = ambiente();
  await a.conta({ acao: 'pedir-codigo', email: 'ana@exemplo.com' });
  const segundo = await a.conta({ acao: 'pedir-codigo', email: 'ana@exemplo.com' }, AGORA + 5000);
  assert.equal(segundo.status, 429);
  assert.equal(a.emails.length, 1);
  const depois = await a.conta({ acao: 'pedir-codigo', email: 'ana@exemplo.com' }, AGORA + INTERVALO_ENTRE_ENVIOS_MS + 1);
  assert.equal(depois.status, 200);
  assert.equal(a.emails.length, 2);
});

test('e-mail fora do ar ou sem configuração devolve erro claro', async () => {
  const a = ambiente();
  const semConfig = await a.conta({ acao: 'pedir-codigo', email: 'ana@exemplo.com' }, AGORA, { enviarEmail: async () => { const e = new Error('x'); e.codigo = 'email_nao_configurado'; throw e; } });
  assert.equal(semConfig.status, 503);
  assert.equal(semConfig.corpo.codigo, 'email_nao_configurado');
  const falhou = await a.conta({ acao: 'pedir-codigo', email: 'bia@exemplo.com' }, AGORA, { enviarEmail: async () => { throw new Error('SMTP caiu'); } });
  assert.equal(falhou.status, 502);
});

test('sem segredo configurado o servidor não libera nada', async () => {
  const a = ambiente();
  const conta = await tratarConta({ metodo: 'POST', corpo: { acao: 'pedir-codigo', email: 'ana@exemplo.com' }, env: {}, agora: AGORA, armazenamento: a.armazenamento, enviarEmail: async () => {} });
  assert.equal(conta.status, 503);
  const dados = await tratarDados({ metodo: 'GET', corpo: {}, cabecalhos: { authorization: 'Bearer x' }, env: {}, agora: AGORA, armazenamento: a.armazenamento });
  assert.equal(dados.status, 503);
});

test('confirmar código: errado não entra, certo devolve a sessão', async () => {
  const a = ambiente();
  await a.conta({ acao: 'pedir-codigo', email: 'ana@exemplo.com' });
  const codigoCerto = a.emails[0].codigo;
  const errado = await a.conta({ acao: 'confirmar-codigo', email: 'ana@exemplo.com', codigo: codigoCerto === '000000' ? '111111' : '000000' }, AGORA + 1000);
  assert.equal(errado.status, 400);
  assert.equal(errado.corpo.motivo, 'errado');
  assert.equal(errado.corpo.restantes, MAX_TENTATIVAS - 1);
  assert.ok(!errado.corpo.token);
  const certo = await a.conta({ acao: 'confirmar-codigo', email: 'ana@exemplo.com', codigo: codigoCerto }, AGORA + 2000);
  assert.equal(certo.status, 200);
  assert.ok(certo.corpo.token);
});

test('confirmar código: formato errado e conta sem código pedido', async () => {
  const a = ambiente();
  assert.equal((await a.conta({ acao: 'confirmar-codigo', email: 'ana@exemplo.com', codigo: '12' })).status, 400);
  const semPedido = await a.conta({ acao: 'confirmar-codigo', email: 'ana@exemplo.com', codigo: '123456' });
  assert.equal(semPedido.status, 400);
  assert.equal(semPedido.corpo.motivo, 'sem_codigo');
});

test('confirmar código: cinco erros bloqueiam o código mesmo se depois acertar', async () => {
  const a = ambiente();
  await a.conta({ acao: 'pedir-codigo', email: 'ana@exemplo.com' });
  const certo = a.emails[0].codigo;
  const errado = certo === '000000' ? '111111' : '000000';
  for (let i = 0; i < MAX_TENTATIVAS; i++) await a.conta({ acao: 'confirmar-codigo', email: 'ana@exemplo.com', codigo: errado }, AGORA + 1000 + i);
  const tarde = await a.conta({ acao: 'confirmar-codigo', email: 'ana@exemplo.com', codigo: certo }, AGORA + 9000);
  assert.equal(tarde.status, 400);
  assert.ok(!tarde.corpo.token);
});

test('ação inválida e e-mail inválido', async () => {
  const a = ambiente();
  assert.equal((await a.conta({ acao: 'qualquer', email: 'ana@exemplo.com' })).status, 400);
  assert.equal((await a.conta({ acao: 'pedir-codigo', email: 'sem-arroba' })).status, 400);
  assert.equal((await tratarConta({ metodo: 'GET', corpo: {}, env: { USO_SEGREDO: SEGREDO }, agora: AGORA, armazenamento: a.armazenamento, enviarEmail: async () => {} })).status, 405);
});

test('dados: sem sessão ou com sessão falsa não lê nem grava', async () => {
  const a = ambiente();
  assert.equal((await a.dados('GET', '')).status, 401);
  assert.equal((await a.dados('GET', 'falso.falso')).status, 401);
  assert.equal((await a.dados('PUT', 'falso.falso', { versao: 0, dados: '{"a":1}' })).status, 401);
  assert.equal(a.armazenamento.contas.size, 0);
});

test('dados: conta nova começa vazia, grava, lê de volta e sobe a versão', async () => {
  const a = ambiente();
  const token = await entrar(a);
  const vazio = await a.dados('GET', token);
  assert.equal(vazio.status, 200);
  assert.equal(vazio.corpo.versao, 0);
  assert.equal(vazio.corpo.dados, null);

  const texto = JSON.stringify({ profile: { name: 'Ana' }, content: [{ title: 'Ação ✨' }] });
  const gravou = await a.dados('PUT', token, { versao: 0, dados: texto });
  assert.equal(gravou.status, 200);
  assert.equal(gravou.corpo.versao, 1);

  const lido = await a.dados('GET', token);
  assert.equal(lido.corpo.versao, 1);
  assert.equal(lido.corpo.dados, texto);

  const segunda = await a.dados('PUT', token, { versao: 1, dados: texto.replace('Ana', 'Ana B') });
  assert.equal(segunda.corpo.versao, 2);
});

test('dados: cada pessoa vê só os próprios textos', async () => {
  const a = ambiente();
  const tokenAna = await entrar(a, 'ana@exemplo.com');
  const tokenBia = await entrar(a, 'bia@exemplo.com', AGORA + 100_000);
  await a.dados('PUT', tokenAna, { versao: 0, dados: '{"dono":"ana"}' });
  const daBia = await a.dados('GET', tokenBia);
  assert.equal(daBia.corpo.dados, null);
  await a.dados('PUT', tokenBia, { versao: 0, dados: '{"dono":"bia"}' });
  assert.equal((await a.dados('GET', tokenAna)).corpo.dados, '{"dono":"ana"}');
  assert.equal((await a.dados('GET', tokenBia)).corpo.dados, '{"dono":"bia"}');
});

test('dados: gravar com versão antiga dá conflito e devolve o que está na conta; "forcar" substitui', async () => {
  const a = ambiente();
  const token = await entrar(a);
  await a.dados('PUT', token, { versao: 0, dados: '{"v":"notebook"}' });
  const conflito = await a.dados('PUT', token, { versao: 0, dados: '{"v":"celular"}' });
  assert.equal(conflito.status, 409);
  assert.equal(conflito.corpo.versao, 1);
  assert.equal(conflito.corpo.dados, '{"v":"notebook"}');
  assert.equal((await a.dados('GET', token)).corpo.dados, '{"v":"notebook"}');

  const forcado = await a.dados('PUT', token, { versao: 1, dados: '{"v":"celular"}', forcar: true });
  assert.equal(forcado.status, 200);
  assert.equal((await a.dados('GET', token)).corpo.dados, '{"v":"celular"}');
});

test('dados: formato inválido e tamanho acima do limite são recusados sem gravar', async () => {
  const a = ambiente();
  const token = await entrar(a);
  assert.equal((await a.dados('PUT', token, { versao: 0, dados: 'não é json' })).status, 400);
  assert.equal((await a.dados('PUT', token, { versao: 0, dados: '[1,2]' })).status, 400);
  assert.equal((await a.dados('PUT', token, { versao: 0, dados: '' })).status, 400);
  assert.equal((await a.dados('PUT', token, { versao: 0, dados: '{"x":"' + 'a'.repeat(MAX_CARACTERES) + '"}' })).status, 413);
  assert.equal((await a.dados('GET', token)).corpo.versao, 0);
});

test('dados: depois de um reembolso a pessoa deixa de ler os textos guardados', async () => {
  const a = ambiente();
  const token = await entrar(a);
  await a.dados('PUT', token, { versao: 0, dados: '{"v":1}' });
  a.aprovados.delete('ana@exemplo.com');
  const lido = await a.dados('GET', token);
  assert.equal(lido.status, 403);
  assert.ok(!lido.corpo.dados);
});

test('dados: sessão vencida pede nova confirmação', async () => {
  const a = ambiente();
  const token = await entrar(a);
  const r = await a.dados('GET', token, undefined, AGORA + VALIDADE_SESSAO_MS + 10_000);
  assert.equal(r.status, 401);
  assert.equal(r.corpo.motivo, 'expirada');
});

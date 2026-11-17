// Testa as rotas reais da Vercel (api/webhook/conta.js e dados.js) no que o navegador exige
// quando o app e o servidor ficam em endereços diferentes: a checagem prévia (CORS) precisa
// liberar o cabeçalho Authorization, senão o app nunca consegue ler nem gravar os textos.
import test from 'node:test';
import assert from 'node:assert/strict';
import conta from '../../../api/webhook/conta.js';
import dados from '../../../api/webhook/dados.js';

function respostaFalsa() {
  const r = { cabecalhos: {}, codigo: null, corpo: null, terminou: false };
  r.setHeader = (k, v) => { r.cabecalhos[k.toLowerCase()] = v; };
  r.status = c => { r.codigo = c; return r; };
  r.json = o => { r.corpo = o; r.terminou = true; return r; };
  r.end = () => { r.terminou = true; return r; };
  return r;
}

test('conta: a checagem prévia do navegador é aceita', async () => {
  const res = respostaFalsa();
  await conta({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.codigo, 200);
  assert.equal(res.cabecalhos['access-control-allow-origin'], '*');
  assert.match(res.cabecalhos['access-control-allow-methods'], /POST/);
});

test('dados: a checagem prévia libera o cabeçalho Authorization e o método PUT', async () => {
  const res = respostaFalsa();
  await dados({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.codigo, 200);
  assert.match(res.cabecalhos['access-control-allow-headers'], /Authorization/i);
  assert.match(res.cabecalhos['access-control-allow-methods'], /PUT/);
  assert.match(res.cabecalhos['access-control-allow-methods'], /GET/);
});

test('as respostas das duas rotas também levam o cabeçalho de liberação e nunca ficam em cache', async () => {
  const antes = { USO: process.env.USO_SEGREDO, SESSAO: process.env.SESSAO_SEGREDO };
  delete process.env.USO_SEGREDO; delete process.env.SESSAO_SEGREDO;
  try {
    const a = respostaFalsa();
    await conta({ method: 'POST', headers: {}, body: { acao: 'pedir-codigo', email: 'ana@exemplo.com' } }, a);
    assert.equal(a.codigo, 503); // sem segredo configurado, nada é liberado
    assert.equal(a.cabecalhos['access-control-allow-origin'], '*');
    assert.equal(a.cabecalhos['cache-control'], 'no-store');

    const b = respostaFalsa();
    await dados({ method: 'GET', headers: { authorization: 'Bearer x' } }, b);
    assert.equal(b.codigo, 503);
    assert.equal(b.cabecalhos['access-control-allow-origin'], '*');
    assert.equal(b.cabecalhos['cache-control'], 'no-store');
  } finally {
    if (antes.USO !== undefined) process.env.USO_SEGREDO = antes.USO;
    if (antes.SESSAO !== undefined) process.env.SESSAO_SEGREDO = antes.SESSAO;
  }
});

test('o corpo que chega como texto (e não como objeto) também é entendido', async () => {
  const antes = process.env.USO_SEGREDO;
  delete process.env.USO_SEGREDO;
  try {
    const res = respostaFalsa();
    await conta({ method: 'POST', headers: {}, body: '{"acao":"pedir-codigo","email":"ana@exemplo.com"}' }, res);
    assert.equal(res.codigo, 503);
  } finally {
    if (antes !== undefined) process.env.USO_SEGREDO = antes;
  }
});

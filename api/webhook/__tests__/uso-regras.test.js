// Teste das regras de contagem de uso. Roda com o test runner nativo do Node, sem
// dependências novas: `node --test api/webhook/__tests__/`
import test from 'node:test';
import assert from 'node:assert/strict';
import { limitesPara, lerContador, aplicarAcao, segredoConfere } from '../usoRegras.js';

test('limites básicos: 3 gerações, 3 calendários e 30 roteiros', () => {
  assert.deepEqual(limitesPara({ isUnlimited: false, liberadoCompleto: true }), { geracoes: 3, calendario: 3, roteiros: 30 });
});

test('assinante dentro da garantia continua no limite básico', () => {
  assert.equal(limitesPara({ isUnlimited: true, liberadoCompleto: false }).geracoes, 3);
});

test('assinante depois dos 7 dias ganha o limite maior', () => {
  assert.equal(limitesPara({ isUnlimited: true, liberadoCompleto: true }).geracoes, 30);
});

test('lerContador aceita vazio, texto e números', () => {
  assert.equal(lerContador(''), 0);
  assert.equal(lerContador(undefined), 0);
  assert.equal(lerContador('abc'), 0);
  assert.equal(lerContador('-4'), 0);
  assert.equal(lerContador(' 2 '), 2);
  assert.equal(lerContador(3), 3);
});

test('consumir soma 1 até o limite e depois recusa', () => {
  assert.deepEqual(aplicarAcao({ atual: 0, limite: 3, acao: 'consumir' }), { permitido: true, novo: 1 });
  assert.deepEqual(aplicarAcao({ atual: 2, limite: 3, acao: 'consumir' }), { permitido: true, novo: 3 });
  assert.deepEqual(aplicarAcao({ atual: 3, limite: 3, acao: 'consumir' }), { permitido: false, novo: 3 });
});

test('devolver subtrai 1 e nunca fica abaixo de zero', () => {
  assert.deepEqual(aplicarAcao({ atual: 2, limite: 3, acao: 'devolver' }), { permitido: true, novo: 1 });
  assert.deepEqual(aplicarAcao({ atual: 0, limite: 3, acao: 'devolver' }), { permitido: true, novo: 0 });
});

test('consultar não muda nada', () => {
  assert.deepEqual(aplicarAcao({ atual: 2, limite: 3, acao: 'consultar' }), { permitido: true, novo: 2 });
});

test('segredo: só confere com o valor exato e com pelo menos 16 caracteres', () => {
  const segredo = 'um-segredo-bem-longo-123';
  assert.equal(segredoConfere(segredo, segredo), true);
  assert.equal(segredoConfere('outro-segredo-bem-longo', segredo), false);
  assert.equal(segredoConfere(undefined, segredo), false);
  assert.equal(segredoConfere('curto', 'curto'), false);
  assert.equal(segredoConfere('abc', undefined), false);
});

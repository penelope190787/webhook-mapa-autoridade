// Teste das regras de contagem de uso. Roda com o test runner nativo do Node, sem
// dependências novas: `node --test api/webhook/__tests__/`
import test from 'node:test';
import assert from 'node:assert/strict';
import { limitesPara, calendariosLiberados, proximoCalendarioEmDias, lerContador, aplicarAcao, segredoConfere } from '../usoRegras.js';

test('calendários liberados: 1 no começo e mais 1 a cada 30 dias, até 12', () => {
  assert.equal(calendariosLiberados(0), 1);
  assert.equal(calendariosLiberados(29), 1);
  assert.equal(calendariosLiberados(30), 2);
  assert.equal(calendariosLiberados(59), 2);
  assert.equal(calendariosLiberados(60), 3);
  assert.equal(calendariosLiberados(330), 12);
  assert.equal(calendariosLiberados(365), 12);
  assert.equal(calendariosLiberados(2000), 12);
});

test('data da compra ilegível libera só o primeiro calendário', () => {
  assert.equal(calendariosLiberados(null), 1);
  assert.equal(calendariosLiberados(undefined), 1);
  assert.equal(calendariosLiberados(-3), 1);
  assert.equal(proximoCalendarioEmDias(null), null);
});

test('próximo calendário: quantos dias faltam', () => {
  assert.equal(proximoCalendarioEmDias(0), 30);
  assert.equal(proximoCalendarioEmDias(10), 20);
  assert.equal(proximoCalendarioEmDias(29), 1);
  assert.equal(proximoCalendarioEmDias(30), 30);
  assert.equal(proximoCalendarioEmDias(330), null);
});

test('limites básicos no primeiro mês: 10 gerações, 1 calendário (2 usos) e 30 roteiros', () => {
  assert.deepEqual(limitesPara({ isUnlimited: false, liberadoCompleto: true, diasDesdeCompra: 10 }), { geracoes: 10, calendario: 2, roteiros: 30 });
});

test('limites básicos crescem 1 calendário e 30 roteiros a cada 30 dias', () => {
  assert.deepEqual(limitesPara({ isUnlimited: false, liberadoCompleto: true, diasDesdeCompra: 35 }), { geracoes: 10, calendario: 4, roteiros: 60 });
  assert.deepEqual(limitesPara({ isUnlimited: false, liberadoCompleto: true, diasDesdeCompra: 400 }), { geracoes: 10, calendario: 24, roteiros: 360 });
});

test('assinante dentro da garantia continua no limite básico', () => {
  assert.equal(limitesPara({ isUnlimited: true, liberadoCompleto: false, diasDesdeCompra: 3 }).geracoes, 10);
});

test('assinante depois dos 7 dias ganha o limite maior', () => {
  const limites = limitesPara({ isUnlimited: true, liberadoCompleto: true, diasDesdeCompra: 8 });
  assert.equal(limites.geracoes, 50);
  assert.equal(limites.calendario, 24);
  assert.equal(limites.roteiros, 360);
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

// Teste unitário independente para a trava anti-fraude de reembolso.
// Roda com o test runner nativo do Node (não adiciona dependência nova ao
// projeto), cobrindo o parse manual da data "DD/MM/AAAA, HH:mm:ss" gravada
// pelo cakto.js e o cálculo de liberação dos 7 dias de garantia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularLiberacao, parseDataCompraBR } from '../dataCompra.js';

// Formata uma data local no mesmo estilo usado por
// `new Date().toLocaleString('pt-BR')` em cakto.js, para simular linhas
// da planilha sem depender do locale do ambiente que roda o teste.
function formatarComoCakto(data) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}, ${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}`;
}

test('compra de agora mesmo: ainda dentro da garantia, faltam 7 dias', () => {
  const agora = new Date();
  const dataCompraStr = formatarComoCakto(agora);
  const resultado = calcularLiberacao(dataCompraStr, agora);
  assert.equal(resultado.liberadoCompleto, false);
  assert.equal(resultado.diasRestantes, 7);
});

test('compra de exatamente 7 dias atrás: garantia encerrada, libera completo', () => {
  const agora = new Date();
  const seteDiasAtras = new Date(agora.getTime() - 7 * 86400000);
  const resultado = calcularLiberacao(formatarComoCakto(seteDiasAtras), agora);
  assert.equal(resultado.liberadoCompleto, true);
  assert.equal(resultado.diasRestantes, 0);
});

test('compra de 8 dias atrás: garantia encerrada há mais tempo, libera completo', () => {
  const agora = new Date();
  const oitoDiasAtras = new Date(agora.getTime() - 8 * 86400000);
  const resultado = calcularLiberacao(formatarComoCakto(oitoDiasAtras), agora);
  assert.equal(resultado.liberadoCompleto, true);
  assert.equal(resultado.diasRestantes, 0);
});

test('string de data corrompida: falha segura, libera completo sem lançar exceção', () => {
  assert.doesNotThrow(() => {
    const resultado = calcularLiberacao('isso não é uma data válida');
    assert.equal(resultado.liberadoCompleto, true);
  });
});

test('string de data vazia: falha segura, libera completo sem lançar exceção', () => {
  assert.doesNotThrow(() => {
    const resultado = calcularLiberacao('');
    assert.equal(resultado.liberadoCompleto, true);
  });
});

test('campo de data ausente (undefined): falha segura, libera completo', () => {
  assert.doesNotThrow(() => {
    const resultado = calcularLiberacao(undefined);
    assert.equal(resultado.liberadoCompleto, true);
  });
});

test('compra de 6 dias e 12 horas atrás: ainda dentro da garantia (arredonda para baixo)', () => {
  const agora = new Date();
  const quaseSeteDias = new Date(agora.getTime() - (6 * 86400000 + 12 * 3600000));
  const resultado = calcularLiberacao(formatarComoCakto(quaseSeteDias), agora);
  assert.equal(resultado.liberadoCompleto, false);
  assert.equal(resultado.diasRestantes, 1);
});

test('parseDataCompraBR tolera espaço extra antes da hora e vírgula ausente', () => {
  const data = parseDataCompraBR('28/09/2026,16:39:44');
  assert.ok(data instanceof Date);
  assert.equal(data.getFullYear(), 2026);
  assert.equal(data.getMonth(), 8);
  assert.equal(data.getDate(), 28);
});

test('parseDataCompraBR rejeita data com mês inválido em vez de "rolar" o mês', () => {
  const data = parseDataCompraBR('31/13/2026, 10:00:00');
  assert.equal(data, null);
});

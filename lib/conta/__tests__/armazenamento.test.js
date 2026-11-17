// Testa a camada que conversa com a planilha, usando uma planilha de mentira que imita o
// jeito como a biblioteca google-spreadsheet devolve linhas e valores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CABECALHO, NOME_ABA, criarArmazenamentoPlanilha } from '../armazenamento.js';
import { MAX_PARTES, TAMANHO_PARTE, estadoVazio, registrarEnvio } from '../regras.js';

function criarPlanilhaFalsa(compras) {
  const cabecalhoCompras = ['nome', 'email', 'whatsapp', 'produto', 'valor', 'data', 'status'];
  const linhasCompras = compras.map(c => cabecalhoCompras.map(k => c[k]));
  const chamadas = { getRows: 0, getCellsInRange: 0, addSheet: 0, addRow: 0, save: 0 };

  function criarLinha(cabecalho, matriz, indice) {
    return {
      get: chave => matriz[indice][cabecalho.indexOf(chave)],
      set: (chave, valor) => { matriz[indice][cabecalho.indexOf(chave)] = valor; },
      async save() { chamadas.save++; }
    };
  }

  const abaCompras = {
    async getRows() { chamadas.getRows++; return linhasCompras.map((_, i) => criarLinha(cabecalhoCompras, linhasCompras, i)); }
  };

  let linhasDados = null;
  const abaDados = {
    async loadHeaderRow() {},
    async getCellsInRange(faixa) {
      chamadas.getCellsInRange++;
      assert.equal(faixa, 'A2:A');
      // a biblioteca omite as linhas vazias do fim e devolve cada linha como lista de valores
      return linhasDados.map(l => [l[0]]);
    },
    async getRows({ offset, limit }) {
      chamadas.getRows++;
      return linhasDados.slice(offset, offset + limit).map((_, i) => criarLinha(CABECALHO, linhasDados, offset + i));
    },
    async addRow(valores) {
      chamadas.addRow++;
      const linha = new Array(CABECALHO.length).fill(undefined);
      Object.keys(valores).forEach(k => { linha[CABECALHO.indexOf(k)] = valores[k]; });
      linhasDados.push(linha);
    }
  };

  const doc = {
    sheetsByIndex: [abaCompras],
    sheetsByTitle: {},
    async addSheet(props) {
      chamadas.addSheet++;
      assert.equal(props.title, NOME_ABA);
      assert.deepEqual(props.headerValues, CABECALHO);
      linhasDados = [];
      doc.sheetsByTitle[NOME_ABA] = abaDados;
      return abaDados;
    }
  };
  return { doc, chamadas, linhasDados: () => linhasDados };
}

const COMPRAS = [
  { nome: 'Ana', email: 'ana@exemplo.com', produto: 'Mapa', status: 'aprovado' },
  { nome: 'Bia', email: 'bia@exemplo.com', produto: 'Mapa', status: 'aprovado' },
  { nome: 'Bia', email: 'bia@exemplo.com', produto: 'Mapa', status: 'cancelado' },
  { nome: 'Caio', email: 'caio@exemplo.com', produto: 'Mapa (Assinatura Mensal)', status: 'aprovado' }
];

test('status da compra: vale a linha mais recente do e-mail (estorno revoga)', async () => {
  const falsa = criarPlanilhaFalsa(COMPRAS);
  const arm = criarArmazenamentoPlanilha({}, async () => falsa.doc);
  assert.deepEqual(await arm.statusCompra('ANA@exemplo.com'), { existe: true, aprovado: true, produto: 'Mapa' });
  assert.equal((await arm.statusCompra('bia@exemplo.com')).aprovado, false);
  assert.equal((await arm.statusCompra('nao@existe.com')).existe, false);
  assert.equal((await arm.statusCompra('caio@exemplo.com')).aprovado, true);
});

test('a aba "dados" é criada sozinha no primeiro uso e a conta nova começa como inexistente', async () => {
  const falsa = criarPlanilhaFalsa(COMPRAS);
  const arm = criarArmazenamentoPlanilha({}, async () => falsa.doc);
  assert.equal(await arm.lerConta('ana@exemplo.com'), null);
  assert.equal(falsa.chamadas.addSheet, 1);
  await arm.lerConta('ana@exemplo.com');
  assert.equal(falsa.chamadas.addSheet, 1);
});

test('gravar e ler de volta: textos grandes passam por várias células sem perder nada', async () => {
  const falsa = criarPlanilhaFalsa(COMPRAS);
  const arm = criarArmazenamentoPlanilha({}, async () => falsa.doc);
  const dados = JSON.stringify({ texto: 'ã✨'.repeat(TAMANHO_PARTE) });
  await arm.salvarConta('Ana@Exemplo.com', { versao: 1, atualizadoEm: '2026-11-17T20:00:00.000Z', dados });

  const linhas = falsa.linhasDados();
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0][CABECALHO.indexOf('email')], 'ana@exemplo.com');
  const usadas = CABECALHO.filter(c => /^p\d+$/.test(c)).filter(c => linhas[0][CABECALHO.indexOf(c)]);
  assert.ok(usadas.length >= 2, 'deve usar mais de uma célula');
  usadas.forEach(c => assert.ok(linhas[0][CABECALHO.indexOf(c)].length <= TAMANHO_PARTE));

  const conta = await arm.lerConta('ana@exemplo.com');
  assert.equal(conta.versao, 1);
  assert.equal(conta.atualizadoEm, '2026-11-17T20:00:00.000Z');
  assert.equal(conta.dados, dados);
});

test('atualizar a mesma pessoa reaproveita a linha, e textos menores limpam as células que sobraram', async () => {
  const falsa = criarPlanilhaFalsa(COMPRAS);
  const arm = criarArmazenamentoPlanilha({}, async () => falsa.doc);
  await arm.salvarConta('ana@exemplo.com', { versao: 1, atualizadoEm: 'a', dados: JSON.stringify({ t: 'x'.repeat(TAMANHO_PARTE * 2) }) });
  await arm.salvarConta('bia@exemplo.com', { versao: 1, atualizadoEm: 'b', dados: '{"dona":"bia"}' });
  await arm.salvarConta('ana@exemplo.com', { versao: 2, atualizadoEm: 'c', dados: '{"curto":true}' });

  assert.equal(falsa.linhasDados().length, 2);
  const ana = await arm.lerConta('ana@exemplo.com');
  assert.equal(ana.versao, 2);
  assert.equal(ana.dados, '{"curto":true}');
  assert.equal((await arm.lerConta('bia@exemplo.com')).dados, '{"dona":"bia"}');
});

test('gravar só o estado do código não mexe nos textos nem na versão', async () => {
  const falsa = criarPlanilhaFalsa(COMPRAS);
  const arm = criarArmazenamentoPlanilha({}, async () => falsa.doc);
  await arm.salvarConta('ana@exemplo.com', { versao: 3, atualizadoEm: 'x', dados: '{"a":1}' });
  const estado = registrarEnvio(estadoVazio(), 1_800_000_000_000, 'hash-do-codigo');
  await arm.salvarConta('ana@exemplo.com', { estado });

  const conta = await arm.lerConta('ana@exemplo.com');
  assert.equal(conta.versao, 3);
  assert.equal(conta.dados, '{"a":1}');
  assert.equal(conta.estado.codigoHash, 'hash-do-codigo');
  assert.equal(conta.estado.enviosJanela, 1);
  assert.equal(conta.estado.codigoExpira, estado.codigoExpira);
});

test('quem só pediu código (sem textos ainda) aparece com versão 0 e sem dados', async () => {
  const falsa = criarPlanilhaFalsa(COMPRAS);
  const arm = criarArmazenamentoPlanilha({}, async () => falsa.doc);
  await arm.salvarConta('ana@exemplo.com', { estado: registrarEnvio(estadoVazio(), 1_800_000_000_000, 'h') });
  const conta = await arm.lerConta('ana@exemplo.com');
  assert.equal(conta.versao, 0);
  assert.equal(conta.dados, '');
});

test('o cabeçalho tem o e-mail na primeira coluna e espaço para todas as partes', () => {
  assert.equal(CABECALHO[0], 'email');
  assert.equal(CABECALHO.filter(c => /^p\d+$/.test(c)).length, MAX_PARTES);
  assert.equal(new Set(CABECALHO).size, CABECALHO.length);
});

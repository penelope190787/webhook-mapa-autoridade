// Onde ficam os textos de cada pessoa: uma aba "dados" na mesma planilha das compras,
// com uma linha por e-mail. A mesma linha guarda o estado do código de confirmação.
//
// A aba é criada sozinha no primeiro uso. Para a planilha de compras (primeira aba) este
// arquivo só LÊ, nunca grava.
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { MAX_PARTES, dividirEmPartes, juntarPartes, lerEstado, normalizarEmail } from './regras.js';

const APPROVED_STATUSES = ['aprovado', 'approved', 'paid'];
export const NOME_ABA = 'dados';
const CAMPOS_FIXOS = ['email', 'versao', 'atualizadoEm', 'codigoHash', 'codigoExpira', 'tentativas', 'ultimoEnvio', 'janelaInicio', 'enviosJanela'];
export const CABECALHO = CAMPOS_FIXOS.concat(Array.from({ length: MAX_PARTES }, (_, i) => 'p' + (i + 1)));

async function abrirPlanilha(env) {
  const auth = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.trim().replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const doc = new GoogleSpreadsheet(env.GOOGLE_SHEETS_ID, auth);
  await doc.loadInfo();
  return doc;
}

async function abrirAbaDados(doc) {
  let aba = doc.sheetsByTitle[NOME_ABA];
  if (!aba) {
    aba = await doc.addSheet({ title: NOME_ABA, headerValues: CABECALHO, gridProperties: { rowCount: 1000, columnCount: CABECALHO.length } });
  } else {
    await aba.loadHeaderRow();
  }
  return aba;
}

// "abrir" existe só para os testes poderem trocar a planilha de verdade por uma de mentira.
export function criarArmazenamentoPlanilha(env = process.env, abrir = abrirPlanilha) {
  let docEmCache = null;
  const obterDoc = async () => docEmCache || (docEmCache = await abrir(env));

  // Procura só a coluna de e-mails para saber em que linha a pessoa está, sem baixar os textos.
  async function acharPosicao(aba, email) {
    const coluna = (await aba.getCellsInRange('A2:A')) || [];
    for (let i = 0; i < coluna.length; i++) {
      if (normalizarEmail(coluna[i] && coluna[i][0]) === email) return i;
    }
    return -1;
  }

  return {
    // Mesma regra do verify.js: vale sempre o registro MAIS RECENTE do e-mail na planilha
    // de compras, assim um estorno ou cancelamento posterior revoga o acesso.
    async statusCompra(emailBruto) {
      const email = normalizarEmail(emailBruto);
      const doc = await obterDoc();
      const rows = await doc.sheetsByIndex[0].getRows();
      const linhas = rows.filter(row => normalizarEmail(row.get('email')) === email);
      if (!linhas.length) return { existe: false, aprovado: false };
      const ultima = linhas[linhas.length - 1];
      const status = String(ultima.get('status') || '').trim().toLowerCase();
      return { existe: true, aprovado: APPROVED_STATUSES.includes(status), produto: ultima.get('produto') || '' };
    },

    async lerConta(emailBruto) {
      const email = normalizarEmail(emailBruto);
      const doc = await obterDoc();
      const aba = await abrirAbaDados(doc);
      const posicao = await acharPosicao(aba, email);
      if (posicao < 0) return null;
      const [linha] = await aba.getRows({ offset: posicao, limit: 1 });
      if (!linha) return null;
      const partes = [];
      for (let i = 1; i <= MAX_PARTES; i++) partes.push(linha.get('p' + i));
      return {
        versao: Number(linha.get('versao')) || 0,
        atualizadoEm: String(linha.get('atualizadoEm') || ''),
        estado: lerEstado({
          codigoHash: linha.get('codigoHash'),
          codigoExpira: linha.get('codigoExpira'),
          tentativas: linha.get('tentativas'),
          ultimoEnvio: linha.get('ultimoEnvio'),
          janelaInicio: linha.get('janelaInicio'),
          enviosJanela: linha.get('enviosJanela')
        }),
        dados: juntarPartes(partes)
      };
    },

    // Grava só o que for informado: { versao, atualizadoEm, estado, dados }.
    async salvarConta(emailBruto, campos) {
      const email = normalizarEmail(emailBruto);
      const doc = await obterDoc();
      const aba = await abrirAbaDados(doc);
      const posicao = await acharPosicao(aba, email);

      const valores = {};
      if (campos.versao !== undefined) valores.versao = String(campos.versao);
      if (campos.atualizadoEm !== undefined) valores.atualizadoEm = String(campos.atualizadoEm);
      if (campos.estado) {
        const e = lerEstado(campos.estado);
        valores.codigoHash = e.codigoHash;
        valores.codigoExpira = String(e.codigoExpira || '');
        valores.tentativas = String(e.tentativas || '');
        valores.ultimoEnvio = String(e.ultimoEnvio || '');
        valores.janelaInicio = String(e.janelaInicio || '');
        valores.enviosJanela = String(e.enviosJanela || '');
      }
      if (campos.dados !== undefined) {
        const partes = dividirEmPartes(campos.dados);
        for (let i = 1; i <= MAX_PARTES; i++) valores['p' + i] = partes[i - 1] || '';
      }

      if (posicao < 0) {
        await aba.addRow({ email, ...valores });
      } else {
        const [linha] = await aba.getRows({ offset: posicao, limit: 1 });
        Object.keys(valores).forEach(chave => linha.set(chave, valores[chave]));
        await linha.save();
      }
    }
  };
}

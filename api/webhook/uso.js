import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { calcularLiberacao } from './dataCompra.js';
import { COLUNAS_USO, limitesPara, lerContador, aplicarAcao, segredoConfere } from './usoRegras.js';

// Contador de uso por e-mail, guardado na planilha de compras. Quem chama é o próprio
// aplicativo (servidor para servidor), com um segredo compartilhado no cabeçalho
// "x-uso-segredo". O navegador da pessoa nunca fala direto com este endereço.

const APPROVED_STATUSES = ['aprovado', 'approved', 'paid'];
const ACOES = ['consumir', 'devolver', 'consultar'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Método não permitido' });
  }

  if (!process.env.USO_SEGREDO) {
    return res.status(503).json({ ok: false, message: 'Contador de uso ainda não configurado' });
  }

  if (!segredoConfere(req.headers['x-uso-segredo'], process.env.USO_SEGREDO)) {
    return res.status(401).json({ ok: false, message: 'Não autorizado' });
  }

  const corpo = req.body || {};
  const email = (corpo.email || '').toString().trim().toLowerCase();
  const tipo = (corpo.tipo || '').toString();
  const acao = (corpo.acao || 'consultar').toString();

  if (!email) {
    return res.status(400).json({ ok: false, message: 'E-mail não informado' });
  }
  if (!ACOES.includes(acao)) {
    return res.status(400).json({ ok: false, message: 'Ação inválida' });
  }
  if (acao !== 'consultar' && !COLUNAS_USO.includes(tipo)) {
    return res.status(400).json({ ok: false, message: 'Tipo de uso inválido' });
  }

  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.trim().replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const faltando = COLUNAS_USO.filter(coluna => !sheet.headerValues.includes(coluna));
    if (faltando.length) {
      console.error('Planilha sem as colunas de uso: ' + faltando.join(', '));
      return res.status(500).json({ ok: false, message: 'Planilha sem as colunas: ' + faltando.join(', ') });
    }

    // Mesma regra do verify.js: vale sempre o registro MAIS RECENTE do e-mail, assim um
    // cancelamento ou estorno posterior revoga o acesso.
    const linhas = rows.filter(row => (row.get('email') || '').toString().trim().toLowerCase() === email);
    if (linhas.length === 0) {
      return res.status(200).json({ ok: true, approved: false });
    }

    const linha = linhas[linhas.length - 1];
    const status = (linha.get('status') || '').toString().trim().toLowerCase();
    if (!APPROVED_STATUSES.includes(status)) {
      return res.status(200).json({ ok: true, approved: false });
    }

    const produto = linha.get('produto') || '';
    const isUnlimited = /assinatura/i.test(produto);
    const { liberadoCompleto, diasRestantes } = calcularLiberacao(linha.get('data') || '');
    const limites = limitesPara({ isUnlimited, liberadoCompleto });

    const usados = {};
    COLUNAS_USO.forEach(coluna => { usados[coluna] = lerContador(linha.get(coluna)); });

    let permitido = true;
    if (acao !== 'consultar') {
      const resultado = aplicarAcao({ atual: usados[tipo], limite: limites[tipo], acao });
      permitido = resultado.permitido;
      if (resultado.novo !== usados[tipo]) {
        linha.set(tipo, String(resultado.novo));
        await linha.save();
        usados[tipo] = resultado.novo;
      }
    }

    return res.status(200).json({
      ok: true,
      approved: true,
      permitido,
      tipo: tipo || null,
      usados,
      limites,
      liberadoCompleto,
      diasRestantes,
      isUnlimited
    });
  } catch (error) {
    console.error('Erro no contador de uso:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao consultar o contador de uso' });
  }
}

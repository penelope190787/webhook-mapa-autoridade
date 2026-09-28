import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { calcularLiberacao } from './dataCompra.js';

const APPROVED_STATUSES = ['aprovado', 'approved', 'paid'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const email = (req.query.email || '').toString().trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ approved: false, message: 'Email não informado' });
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

    // Considera sempre o registro MAIS RECENTE daquele email, não apenas o
    // último aprovado — assim um cancelamento/estorno posterior (gravado como
    // status "cancelado") revoga corretamente um acesso aprovado antes,
    // mesmo em assinaturas recorrentes.
    const matches = rows.filter(row => (row.get('email') || '').toString().trim().toLowerCase() === email);

    if (matches.length === 0) {
      return res.status(200).json({ approved: false });
    }

    const last = matches[matches.length - 1];
    const lastStatus = (last.get('status') || '').toString().trim().toLowerCase();

    if (!APPROVED_STATUSES.includes(lastStatus)) {
      return res.status(200).json({ approved: false });
    }

    const produto = last.get('produto') || '';

    // Trava anti-fraude de reembolso: calcula no servidor se os 7 dias de
    // garantia da Cakto já passaram para ESTA linha específica da planilha.
    // O app usa `liberadoCompleto` para decidir se libera o Relatório Final
    // e gerações acima do limite básico mesmo para quem tem `isUnlimited`.
    const { liberadoCompleto, diasRestantes } = calcularLiberacao(last.get('data') || '');

    return res.status(200).json({
      approved: true,
      produto,
      isUnlimited: /assinatura/i.test(produto),
      data: last.get('data') || '',
      liberadoCompleto,
      diasRestantes
    });

  } catch (error) {
    console.error('❌ Erro ao verificar acesso:', error);
    return res.status(500).json({
      approved: false,
      message: 'Erro ao verificar acesso',
      error: error.message
    });
  }
}

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

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

    const matches = rows.filter(row => {
      const rowEmail = (row.get('email') || '').toString().trim().toLowerCase();
      const rowStatus = (row.get('status') || '').toString().trim().toLowerCase();
      return rowEmail === email && APPROVED_STATUSES.includes(rowStatus);
    });

    if (matches.length === 0) {
      return res.status(200).json({ approved: false });
    }

    const last = matches[matches.length - 1];

    return res.status(200).json({
      approved: true,
      produto: last.get('produto') || '',
      data: last.get('data') || ''
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

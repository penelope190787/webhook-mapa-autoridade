import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const APPROVED_EVENTS = ['purchase_approved', 'purchase.approved', 'payment_approved'];
const APPROVED_PAYMENT_STATUSES = ['paid', 'approved', 'aprovado'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = req.body || {};

    console.log('📊 Webhook recebido:', JSON.stringify(body, null, 2));

    // Aceita tanto o formato oficial de evento da Cakto (event/data.customer)
    // quanto um formato simples de captura de lead (campos soltos no corpo).
    const isCaktoEvent = typeof body.event === 'string';
    const customer = body.data?.customer || {};

    const email = (customer.email || body.email || '').toString().trim().toLowerCase();
    const nome = customer.name || body.nome || '';
    const whatsapp = customer.phone || body.whatsapp || body.telefone || '';
    const produto = body.data?.product?.name || body.data?.offer?.name || body.produto || body.interesse || '';
    const valor = body.data?.amount ?? body.valor ?? '';

    let status = (body.status || 'novo').toString();
    if (isCaktoEvent) {
      const eventoAprovado = APPROVED_EVENTS.includes(body.event);
      const statusAprovado = APPROVED_PAYMENT_STATUSES.includes((body.data?.status || '').toString().toLowerCase());
      status = (eventoAprovado && statusAprovado) ? 'aprovado' : body.event;
    }

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email não informado no payload' });
    }

    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.trim().replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    const novaLinha = {
      nome,
      email,
      whatsapp,
      produto,
      valor,
      data: new Date().toLocaleString('pt-BR'),
      status
    };

    await sheet.addRow(novaLinha);

    console.log('✅ Registro salvo:', novaLinha);

    return res.status(200).json({
      status: 'success',
      message: 'Dados salvos com sucesso!',
      dados_salvos: novaLinha
    });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao salvar dados',
      error: error.message
    });
  }
}

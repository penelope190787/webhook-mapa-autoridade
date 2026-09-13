import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// Eventos oficiais da Cakto (https://docs.cakto.com.br) que concedem ou
// revogam o acesso à ferramenta. Cobre tanto compra única quanto assinatura
// recorrente mensal.
const GRANT_EVENTS = ['purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed'];
const REVOKE_EVENTS = ['purchase_refused', 'chargeback', 'refund', 'subscription_canceled', 'subscription_renewal_refused', 'subscription_paused'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = req.body || {};

    console.log('📊 Webhook recebido:', JSON.stringify({ ...body, secret: body.secret ? '(oculto)' : undefined }, null, 2));

    // Aceita tanto o formato oficial de evento da Cakto (event/data.customer)
    // quanto um formato simples de captura de lead (campos soltos no corpo).
    const isCaktoEvent = typeof body.event === 'string';

    // A Cakto envia o segredo do webhook dentro do próprio corpo (campo
    // "secret"), não em um header. Sem essa checagem, qualquer pessoa que
    // descobrisse a URL do webhook poderia forjar uma "compra aprovada"
    // para qualquer email, liberando acesso sem pagar.
    if (isCaktoEvent && process.env.CAKTO_WEBHOOK_SECRET && body.secret !== process.env.CAKTO_WEBHOOK_SECRET) {
      console.warn('⚠️ Webhook recebido com secret inválido ou ausente');
      return res.status(401).json({ status: 'error', message: 'Secret inválido' });
    }

    const customer = body.data?.customer || {};

    const email = (customer.email || body.email || '').toString().trim().toLowerCase();
    const nome = customer.name || body.nome || '';
    const whatsapp = customer.phone || body.whatsapp || body.telefone || '';
    const nomeProduto = body.data?.product?.name || body.data?.offer?.name || body.produto || body.interesse || '';
    const valor = body.data?.amount ?? body.valor ?? '';

    // Assinatura recorrente: a Cakto identifica isso pelo tipo do produto
    // ("subscription") ou pela presença do campo data.subscription.
    const ehAssinatura = body.data?.product?.type === 'subscription' || Boolean(body.data?.subscription);
    const produto = isCaktoEvent && nomeProduto
      ? `${nomeProduto} (${ehAssinatura ? 'Assinatura Mensal' : 'Plano Básico'})`
      : nomeProduto;

    let status = (body.status || 'novo').toString();
    if (isCaktoEvent) {
      if (GRANT_EVENTS.includes(body.event)) {
        status = 'aprovado';
      } else if (REVOKE_EVENTS.includes(body.event)) {
        status = 'cancelado';
      } else {
        status = body.event;
      }
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

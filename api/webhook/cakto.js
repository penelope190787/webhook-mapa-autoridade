const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Armazenar últimos webhooks em memória (para debug)
let ultimosWebhooks = [];

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Status e últimos webhooks
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Webhook Cakto funcionando!',
      ultimosWebhooks: ultimosWebhooks.slice(-5)
    });
  }

  // POST - Processar webhook
  if (req.method === 'POST') {
    try {
      // LOG COMPLETO PARA DEBUG CAKTO
      console.log('=== DEBUG CAKTO ===');
      console.log('URL:', req.url);
      console.log('Method:', req.method);
      console.log('Headers completos:', JSON.stringify(req.headers, null, 2));
      console.log('Body completo:', JSON.stringify(req.body, null, 2));
      console.log('Query params:', JSON.stringify(req.query, null, 2));
      console.log('===================');
      
      const dados = req.body || {};
      
      // EXTRAIR DADOS NO FORMATO CAKTO
      const customer = dados.data?.customer || {};
      const product = dados.data?.product || {};
      const offer = dados.data?.offer || {};
      
      console.log('CUSTOMER:', JSON.stringify(customer, null, 2));
      console.log('PRODUCT:', JSON.stringify(product, null, 2));
      console.log('OFFER:', JSON.stringify(offer, null, 2));

      // Configurar autenticação Google
      const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // Conectar à planilha
      const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
      await doc.loadInfo();

      // Pegar primeira aba
      const sheet = doc.sheetsByIndex[0];

      // Preparar dados para inserir (FORMATO CAKTO)
      const novaLinha = {
        'nome': customer.name || 'Nome não informado',
        'email': customer.email || 'Email não informado',
        'whatsapp': customer.phone || '',
        'produto': product.name || offer.name || '',
        'valor': dados.data?.amount || dados.data?.baseAmount || offer.price || '',
        'data': new Date().toLocaleString('pt-BR'),
        'status': `Novo Lead - Cakto (${dados.event || 'evento'})`
      };

      // Inserir na planilha
      await sheet.addRow(novaLinha);

      // Armazenar para debug
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        evento: dados.event,
        customer: customer,
        product: product,
        dadosProcessados: novaLinha,
        status: 'sucesso'
      });

      return res.status(200).json({
        message: 'Lead Cakto salvo com sucesso!',
        evento: dados.event,
        dados: novaLinha
      });

    } catch (error) {
      console.error('Erro webhook Cakto:', error);
      
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        erro: error.message,
        dadosRecebidos: req.body,
        status: 'erro'
      });

      return res.status(500).json({
        error: 'Erro interno',
        details: error.message,
        dadosRecebidos: req.body
      });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

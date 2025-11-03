const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

let ultimosWebhooks = [];

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Webhook Cakto funcionando!',
      ultimosWebhooks: ultimosWebhooks.slice(-3)
    });
  }

  if (req.method === 'POST') {
    try {
      console.log('CAKTO WEBHOOK RECEBIDO:', JSON.stringify(req.body, null, 2));
      
      const dados = req.body || {};
      
      // VALIDAR CHAVE SECRETA DA CAKTO
      const secretRecebida = dados.secret;
      const secretEsperada = process.env.CAKTO_WEBHOOK_SECRET;
      
      console.log('Secret recebida:', secretRecebida);
      console.log('Secret esperada:', secretEsperada);
      
      if (!secretRecebida || secretRecebida !== secretEsperada) {
        console.log('SECRET INVÁLIDA!');
        return res.status(401).json({ error: 'Chave secreta inválida' });
      }
      
      console.log('✅ SECRET VÁLIDA! Processando webhook...');
      
      const customer = dados.data?.customer || {};
      const product = dados.data?.product || {};
      
      // Salvar na planilha Google
      const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];

      const novaLinha = {
        'nome': customer.name || 'N/A',
        'email': customer.email || 'N/A',
        'whatsapp': customer.phone || '',
        'produto': product.name || '',
        'valor': dados.data?.amount || dados.data?.baseAmount || '',
        'data': new Date().toLocaleString('pt-BR'),
        'status': `Cakto - ${dados.event || 'webhook'}`
      };

      await sheet.addRow(novaLinha);
      
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        evento: dados.event,
        dados: novaLinha,
        status: 'SUCESSO'
      });

      console.log('✅ SALVO NA PLANILHA:', novaLinha);
      
      return res.status(200).json({ 
        message: 'Webhook Cakto processado com sucesso!',
        event: dados.event,
        customer: customer.name
      });

    } catch (error) {
      console.error('❌ ERRO:', error);
      
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        erro: error.message,
        status: 'ERRO'
      });
      
      return res.status(500).json({ 
        error: 'Erro interno',
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

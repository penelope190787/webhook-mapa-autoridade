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
      message: 'Webhook Mapa Autoridade funcionando!',
      ultimosWebhooks: ultimosWebhooks.slice(-5) // Últimos 5
    });
  }

  // POST - Processar webhook
  if (req.method === 'POST') {
    try {
      // Log para debug
      console.log('Método:', req.method);
      console.log('Headers:', req.headers);
      console.log('Body recebido:', req.body);
      
      const dados = req.body || {};
      
      // Validar dados obrigatórios
      if (!dados.nome || !dados.email) {
        return res.status(400).json({ 
          error: 'Nome e email são obrigatórios',
          dadosRecebidos: dados
        });
      }

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

      // Preparar dados para inserir (CORRIGIDO para seus cabeçalhos)
      const novaLinha = {
        'nome': dados.nome || '',
        'email': dados.email || '',
        'whatsapp': dados.telefone || dados.whatsapp || '',
        'produto': dados.produto || dados.empresa || '',
        'valor': dados.valor || '',
        'data': new Date().toLocaleString('pt-BR'),
        'status': 'Novo Lead'
      };

      // Inserir na planilha
      await sheet.addRow(novaLinha);

      // Armazenar para debug
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        dados: dados,
        status: 'sucesso'
      });

      // Manter apenas últimos 10
      if (ultimosWebhooks.length > 10) {
        ultimosWebhooks = ultimosWebhooks.slice(-10);
      }

      return res.status(200).json({
        message: 'Dados salvos com sucesso!',
        dados: novaLinha
      });

    } catch (error) {
      console.error('Erro ao processar webhook:', error);
      
      // Armazenar erro para debug
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        erro: error.message,
        status: 'erro'
      });

      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }
  }

  // Método não permitido
  return res.status(405).json({ error: 'Método não permitido' });
}

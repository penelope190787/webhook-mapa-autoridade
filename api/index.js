const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Armazenamento temporário em memória
let ultimosWebhooks = [];

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      message: "Webhook Mapa Autoridade funcionando!",
      ultimosWebhooks: ultimosWebhooks.slice(-5) // Últimos 5 webhooks
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const dados = req.body;
    
    // Validar dados obrigatórios
    if (!dados.nome || !dados.email) {
      return res.status(400).json({ 
        error: 'Nome e email são obrigatórios' 
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
    
    const sheet = doc.sheetsByIndex[0];

    // Preparar dados para inserção
    const novaLinha = {
      'Data/Hora': new Date().toLocaleString('pt-BR'),
      'Nome': dados.nome,
      'Email': dados.email,
      'Telefone': dados.telefone || '',
      'Empresa': dados.empresa || '',
      'Cargo': dados.cargo || '',
      'Interesse': dados.interesse || '',
      'Origem': dados.origem || 'Website'
    };

    // Inserir na planilha
    await sheet.addRow(novaLinha);

    // Armazenar webhook em memória (últimos 10)
    ultimosWebhooks.push({
      timestamp: new Date().toISOString(),
      dados: dados
    });
    
    if (ultimosWebhooks.length > 10) {
      ultimosWebhooks.shift();
    }

    console.log('✅ Dados salvos:', novaLinha);

    return res.status(200).json({
      success: true,
      message: 'Dados salvos com sucesso!',
      dados: novaLinha
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
};

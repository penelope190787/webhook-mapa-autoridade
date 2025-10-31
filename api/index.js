const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Armazenamento temporário em memória
let ultimosWebhooks = [];

// Configuração do Google Sheets
async function salvarNoGoogleSheets(dadosCliente) {
  try {
    // Configuração da autenticação
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Conectar à planilha
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByIndex[0]; // Primeira aba
    
    // Adicionar linha com os dados
    await sheet.addRow({
      'Data/Hora': new Date().toLocaleString('pt-BR'),
      'Nome': dadosCliente.nome || '',
      'Email': dadosCliente.email || '',
      'Telefone': dadosCliente.telefone || '',
      'Empresa': dadosCliente.empresa || '',
      'Cargo': dadosCliente.cargo || '',
      'Origem': dadosCliente.origem || 'Cakto',
      'Status': 'Novo Lead'
    });

    console.log('✅ Dados salvos no Google Sheets');
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar no Google Sheets:', error);
    return false;
  }
}

// Função principal do webhook (Vercel)
module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Página de status
  if (req.method === 'GET') {
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Webhook Mapa Autoridade</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .status { padding: 20px; border-radius: 8px; margin: 20px 0; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
            .webhook { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 5px; }
            pre { background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto; }
        </style>
    </head>
    <body>
        <h1>🚀 Webhook Mapa Autoridade Digital</h1>
        
        <div class="status success">
            <h3>✅ Status: ATIVO</h3>
            <p>Webhook funcionando corretamente!</p>
        </div>

        <div class="status info">
            <h3>📊 Informações:</h3>
            <p><strong>URL do Webhook:</strong> ${req.headers.host}</p>
            <p><strong>Método:</strong> POST</p>
            <p><strong>Última verificação:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        </div>

        <h3>📝 Últimos Webhooks Recebidos:</h3>
        ${ultimosWebhooks.length > 0 ? 
          ultimosWebhooks.slice(-5).map(webhook => `
            <div class="webhook">
              <strong>Data:</strong> ${webhook.timestamp}<br>
              <strong>Dados:</strong> <pre>${JSON.stringify(webhook.dados, null, 2)}</pre>
            </div>
          `).join('') : 
          '<p>Nenhum webhook recebido ainda.</p>'
        }

        <h3>🔧 Como usar:</h3>
        <p>Configure no Cakto para enviar dados via POST para esta URL.</p>
        
        <h3>📋 Exemplo de dados esperados:</h3>
        <pre>{
  "nome": "João Silva",
  "email": "joao@email.com",
  "telefone": "(11) 99999-9999",
  "empresa": "Empresa ABC",
  "cargo": "Diretor"
}</pre>
    </body>
    </html>`;
    
    return res.status(200).send(html);
  }

  // POST - Receber webhook
  if (req.method === 'POST') {
    try {
      const dadosCliente = req.body;
      
      // Log dos dados recebidos
      console.log('📥 Webhook recebido:', dadosCliente);
      
      // Armazenar temporariamente
      ultimosWebhooks.push({
        timestamp: new Date().toLocaleString('pt-BR'),
        dados: dadosCliente
      });
      
      // Manter apenas os últimos 10
      if (ultimosWebhooks.length > 10) {
        ultimosWebhooks = ultimosWebhooks.slice(-10);
      }
      
      // Salvar no Google Sheets
      const sucesso = await salvarNoGoogleSheets(dadosCliente);
      
      if (sucesso) {
        return res.status(200).json({
          status: 'success',
          message: 'Dados recebidos e salvos com sucesso!',
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(500).json({
          status: 'error',
          message: 'Erro ao salvar no Google Sheets',
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('❌ Erro no webhook:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Erro interno do servidor',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Método não permitido
  return res.status(405).json({
    status: 'error',
    message: 'Método não permitido'
  });
};


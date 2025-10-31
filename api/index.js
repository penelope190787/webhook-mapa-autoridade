const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Armazenamento temporário em memória
let ultimosWebhooks = [];

// Configuração do Google Sheets
async function salvarNoGoogleSheets(dadosCliente) {
  try {
    // Configurar autenticação
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Conectar à planilha
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByIndex[0]; // Primeira aba

    // Adicionar linha com dados do cliente
    await sheet.addRow({
      'Nome': dadosCliente.nome || 'N/A',
      'Email': dadosCliente.email || 'N/A',
      'Telefone': dadosCliente.telefone || 'N/A',
      'Produto': dadosCliente.produto || 'N/A',
      'Valor': dadosCliente.valor || 'N/A',
      'Data': new Date().toLocaleString('pt-BR'),
      'Status': dadosCliente.status || 'Aprovado'
    });

    console.log('✅ Dados salvos no Google Sheets com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar no Google Sheets:', error);
    return false;
  }
}

// Função para extrair dados do cliente do webhook
function extrairDadosCliente(webhookData) {
  console.log('📋 Extraindo dados do cliente...');
  
  const dados = {
    nome: webhookData.customer?.name || webhookData.buyer?.name || 'N/A',
    email: webhookData.customer?.email || webhookData.buyer?.email || 'N/A',
    telefone: webhookData.customer?.phone || webhookData.buyer?.phone || 'N/A',
    produto: webhookData.product?.name || webhookData.item?.name || 'N/A',
    valor: webhookData.amount || webhookData.value || webhookData.price || 'N/A',
    status: webhookData.status || 'Aprovado',
    evento: webhookData.event || 'N/A'
  };
  
  console.log('📊 Dados extraídos:', dados);
  return dados;
}

export default async function handler(req, res) {
  console.log(`🚀 Requisição recebida: ${req.method} ${req.url}`);
  
  // Rota principal
  if (req.url === '/' || req.url === '') {
    return res.status(200).json({
      message: 'Webhook Mapa Autoridade funcionando!',
      timestamp: new Date().toISOString()
    });
  }
  
  // Rota para ver logs
  if (req.url === '/webhook/logs') {
    return res.status(200).json({
      message: 'Últimos webhooks recebidos',
      total: ultimosWebhooks.length,
      webhooks: ultimosWebhooks
    });
  }
  
  // Rota do webhook
  if (req.url === '/webhook' && req.method === 'POST') {
    try {
      const webhookData = req.body;
      console.log('📨 Webhook recebido:', JSON.stringify(webhookData, null, 2));
      
      // Salvar na memória temporária
      ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        data: webhookData
      });
      
      // Manter apenas os últimos 10 webhooks na memória
      if (ultimosWebhooks.length > 10) {
        ultimosWebhooks = ultimosWebhooks.slice(-10);
      }
      
      // Verificar se é um evento de compra aprovada
      if (webhookData.event === 'purchase_approved' || 
          webhookData.event === 'purchase.approved' ||
          webhookData.status === 'approved' ||
          webhookData.status === 'paid') {
        
        console.log('✅ Evento de compra aprovada detectado!');
        
        // Extrair dados do cliente
        const dadosCliente = extrairDadosCliente(webhookData);
        
        // Salvar no Google Sheets
        const salvou = await salvarNoGoogleSheets(dadosCliente);
        
        if (salvou) {
          console.log('🎉 Cliente salvo com sucesso no Google Sheets!');
        } else {
          console.log('⚠️ Erro ao salvar no Google Sheets, mas webhook processado');
        }
      } else {
        console.log('ℹ️ Evento não é de compra aprovada, apenas logando...');
      }
      
      return res.status(200).json({
        message: 'Webhook processado com sucesso',
        timestamp: new Date().toISOString(),
        event: webhookData.event || 'N/A'
      });
      
    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error);
      return res.status(500).json({
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
  
  // Rota não encontrada
  return res.status(404).json({
    message: 'Rota não encontrada'
  });
}

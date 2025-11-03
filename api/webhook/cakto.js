export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Capturar dados recebidos
    const dadosRecebidos = req.body || {};
    
    // Log dos dados para debug
    console.log('📊 Dados recebidos da Cakto:', JSON.stringify(dadosRecebidos, null, 2));
    
    // TODO: Aqui vamos integrar com Google Sheets
    
    const response = {
      status: 'success',
      message: 'Dados recebidos com sucesso!',
      timestamp: new Date().toISOString(),
      method: req.method,
      dados_recebidos: dadosRecebidos
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
}

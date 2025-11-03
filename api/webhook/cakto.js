export default function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Responder OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Log da requisição
    console.log('Método:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Query:', req.query);

    // Resposta de sucesso
    const response = {
      status: 'success',
      message: 'Webhook Cakto funcionando!',
      timestamp: new Date().toISOString(),
      method: req.method,
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown'
    };

    // Se for POST, incluir dados recebidos
    if (req.method === 'POST' && req.body) {
      response.receivedData = req.body;
    }

    // Se tiver query parameters, incluir
    if (Object.keys(req.query).length > 0) {
      response.queryParams = req.query;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Erro no webhook:', error);
    
    return res.status(500).json({
      status: 'error',
      message: 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}

export default async function handler(req, res) {
  // Permitir apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log para debug - você verá isso nos logs da Vercel
    console.log('🔥 Webhook recebido!');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    // Verificar secret key
    const receivedSecret = req.headers['x-webhook-secret'] || 
                          req.headers['authorization'] || 
                          req.body.secret;
    
    const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;
    
    console.log('Secret recebido:', receivedSecret);
    console.log('Secret esperado:', expectedSecret);
    
    if (receivedSecret !== expectedSecret) {
      console.log('❌ Secret não confere!');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Processar dados do webhook
    const data = req.body;
    console.log('✅ Dados processados:', data);
    
    // Aqui você pode adicionar sua lógica de negócio
    // Por exemplo: salvar no banco, enviar email, etc.
    
    return res.status(200).json({ 
      success: true, 
      message: 'Webhook processado com sucesso!',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('💥 Erro no webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

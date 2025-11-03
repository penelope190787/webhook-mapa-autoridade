export default async function handler(req, res) {
  // Log do método e headers para debug
  console.log('Método:', req.method);
  console.log('Headers:', req.headers);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const dados = req.body;
    console.log('Body recebido:', dados);

    // Verificar secret
    const secretRecebida = dados.secret;
    const secretEsperada = process.env.CAKTO_WEBHOOK_SECRET;
    
    console.log('Secret recebida:', secretRecebida);
    console.log('Secret esperada:', secretEsperada);

    if (secretRecebida !== secretEsperada) {
      console.log('❌ Secret inválida');
      return res.status(401).json({ error: 'Secret inválida' });
    }

    // Verificar se é evento de compra aprovada
    if (dados.event !== 'purchase_approved') {
      console.log('⚠️ Evento ignorado:', dados.event);
      return res.status(200).json({ message: 'Evento ignorado', event: dados.event });
    }

    // Extrair dados do cliente
    const customer = dados.data?.customer || {};
    const nome = customer.name || '';
    const email = customer.email || '';

    console.log('📋 DADOS EXTRAÍDOS:', { nome, email, customer });

    // Validar dados obrigatórios
    if (!nome.trim() || !email.trim()) {
      console.log('❌ Dados obrigatórios faltando:', { nome, email });
      return res.status(400).json({ 
        error: 'Nome e email são obrigatórios',
        dadosRecebidos: dados
      });
    }

    // Extrair dados do produto
    const produto = dados.data?.product || {};
    const nomeProduto = produto.name || 'Produto não informado';
    const valorCompra = dados.data?.amount || 0;

    console.log('✅ Dados validados:', { nome, email, nomeProduto, valorCompra });

    // Preparar dados para o Google Sheets
    const dadosParaSheet = [
      new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      nome,
      email,
      nomeProduto,
      `R$ ${valorCompra.toFixed(2)}`,
      dados.data?.id || '',
      'Aprovada'
    ];

    console.log('📊 Dados para Google Sheets:', dadosParaSheet);

    // Enviar para Google Sheets
    const SHEET_URL = process.env.GOOGLE_SHEETS_URL;
    
    if (!SHEET_URL) {
      console.log('⚠️ URL do Google Sheets não configurada');
      return res.status(200).json({ 
        message: 'Webhook processado (sem Google Sheets)',
        dados: { nome, email, produto: nomeProduto, valor: valorCompra }
      });
    }

    console.log('🔗 Enviando para Google Sheets...');

    const response = await fetch(SHEET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dadosParaSheet)
    });

    if (!response.ok) {
      console.log('❌ Erro ao enviar para Google Sheets:', response.status);
      throw new Error(`Erro no Google Sheets: ${response.status}`);
    }

    console.log('✅ Dados enviados para Google Sheets com sucesso!');

    return res.status(200).json({
      message: 'Webhook processado com sucesso!',
      dados: {
        nome,
        email,
        produto: nomeProduto,
        valor: valorCompra,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ ERRO no webhook:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
}

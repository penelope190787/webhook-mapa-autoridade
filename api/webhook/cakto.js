import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

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
    
    console.log('📊 Dados recebidos:', JSON.stringify(dadosRecebidos, null, 2));

    // Configurar autenticação Google Sheets
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Conectar com a planilha
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByIndex[0]; // Primeira aba

    // Preparar dados para salvar
    const novaLinha = {
      nome: dadosRecebidos.nome || '',
      email: dadosRecebidos.email || '',
      whatsapp: dadosRecebidos.whatsapp || dadosRecebidos.telefone || '',
      produto: dadosRecebidos.produto || dadosRecebidos.interesse || '',
      valor: dadosRecebidos.valor || '',
      data: new Date().toLocaleString('pt-BR'),
      status: dadosRecebidos.status || 'novo'
    };

    // Salvar na planilha
    await sheet.addRow(novaLinha);
    
    console.log('✅ Dados salvos na planilha:', novaLinha);

    const response = {
      status: 'success',
      message: 'Dados salvos com sucesso na planilha!',
      timestamp: new Date().toISOString(),
      method: req.method,
      dados_recebidos: dadosRecebidos,
      dados_salvos: novaLinha
    };

    return res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao salvar dados',
      error: error.message
    });
  }
}

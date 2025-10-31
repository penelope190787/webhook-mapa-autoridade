const express = require('express');
const app = express();

app.use(express.json());

// Armazenar últimos webhooks (em memória)
let ultimosWebhooks = [];

// Rota principal
app.get('/', (req, res) => {
    res.json({ 
        message: 'Webhook Mapa Autoridade funcionando!',
        timestamp: new Date().toISOString()
    });
});

// Rota de teste
app.get('/webhook/test', (req, res) => {
    res.json({ 
        message: 'Endpoint de teste OK!',
        webhook_url: '/webhook/cakto'
    });
});

// Rota para ver últimos webhooks recebidos
app.get('/webhook/logs', (req, res) => {
    res.json({
        message: 'Últimos webhooks recebidos',
        total: ultimosWebhooks.length,
        webhooks: ultimosWebhooks.slice(-10) // Últimos 10
    });
});

// Webhook da Cakto
app.post('/webhook/cakto', (req, res) => {
    console.log('Webhook recebido:', req.body);
    
    // Salvar webhook na memória
    ultimosWebhooks.push({
        timestamp: new Date().toISOString(),
        data: req.body
    });
    
    try {
        const webhookData = req.body;
        
        // Verificar se é uma compra aprovada
        if (webhookData.event === 'purchase.approved' || webhookData.event === 'purchase.paid') {
            
            // Extrair dados do cliente
            const customerData = {
                nome: webhookData.customer?.name || 'Nome não informado',
                email: webhookData.customer?.email || 'Email não informado',
                telefone: webhookData.customer?.phone || 'Telefone não informado',
                produto: webhookData.product?.name || 'Mapa da Autoridade Digital',
                valor: webhookData.purchase?.amount || 'Valor não informado',
                data: new Date().toLocaleString('pt-BR'),
                status: 'Compra Aprovada'
            };
            
            console.log('Dados do cliente processados:', customerData);
            
            // Aqui vamos adicionar o envio para Google Sheets
            // Por enquanto só logamos os dados
            
        } else {
            console.log('Evento recebido:', webhookData.event);
        }
        
        res.status(200).json({ 
            message: 'Webhook processado com sucesso',
            event: webhookData.event 
        });
        
    } catch (error) {
        console.error('Erro ao processar webhook:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

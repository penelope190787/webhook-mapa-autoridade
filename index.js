const express = require('express');
const app = express();

app.use(express.json());

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

// Webhook da Cakto
app.post('/webhook/cakto', (req, res) => {
    console.log('Webhook recebido:', req.body);
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

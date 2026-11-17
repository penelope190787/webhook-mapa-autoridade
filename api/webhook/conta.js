import { tratarConta } from '../../lib/conta/handlers.js';
import { criarArmazenamentoPlanilha } from '../../lib/conta/armazenamento.js';
import { enviarCodigoPorEmail } from '../../lib/conta/email.js';

// Confirmação do aparelho por código enviado ao e-mail de compra.
//   POST { acao: 'pedir-codigo', email }
//   POST { acao: 'confirmar-codigo', email, codigo }  ->  { ok, token, expiraEm }
// A lógica está em lib/conta/handlers.js (fora da pasta api para não virar outra função da Vercel).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const corpo = typeof req.body === 'string' ? seguro(req.body) : (req.body || {});
  const resultado = await tratarConta({
    metodo: req.method,
    corpo,
    env: process.env,
    agora: Date.now(),
    armazenamento: criarArmazenamentoPlanilha(process.env),
    enviarEmail: dados => enviarCodigoPorEmail(dados, process.env)
  });
  return res.status(resultado.status).json(resultado.corpo);
}

function seguro(texto) {
  try { return JSON.parse(texto); } catch (e) { return {}; }
}

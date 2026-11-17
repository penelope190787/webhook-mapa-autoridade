import { tratarDados } from '../../lib/conta/handlers.js';
import { criarArmazenamentoPlanilha } from '../../lib/conta/armazenamento.js';

// Textos guardados na conta de cada pessoa, para aparecerem em qualquer aparelho.
//   GET  (cabeçalho Authorization: Bearer <sessão>)               -> { ok, versao, dados }
//   PUT  { versao, dados, forcar? } (mesmo cabeçalho)            -> { ok, versao } ou 409 em caso de conflito
// A lógica está em lib/conta/handlers.js (fora da pasta api para não virar outra função da Vercel).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const corpo = typeof req.body === 'string' ? seguro(req.body) : (req.body || {});
  const resultado = await tratarDados({
    metodo: req.method,
    corpo,
    cabecalhos: req.headers,
    env: process.env,
    agora: Date.now(),
    armazenamento: criarArmazenamentoPlanilha(process.env)
  });
  return res.status(resultado.status).json(resultado.corpo);
}

function seguro(texto) {
  try { return JSON.parse(texto); } catch (e) { return {}; }
}

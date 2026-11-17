// Regras da conta do Mapa da Autoridade Digital: código de confirmação por e-mail,
// sessão do aparelho e divisão dos textos da pessoa em partes para caber na planilha.
//
// Só funções puras (sem planilha, sem rede e sem e-mail) de propósito: o teste em
// __tests__/regras.test.js roda sem nenhuma configuração.
import crypto from 'node:crypto';

// Cada célula da planilha aceita no máximo 50.000 caracteres. Usamos 40.000 para ter folga.
export const TAMANHO_PARTE = 40000;
export const MAX_PARTES = 20;
export const MAX_CARACTERES = TAMANHO_PARTE * MAX_PARTES;

export const VALIDADE_CODIGO_MS = 10 * 60 * 1000; // o código vale 10 minutos
export const MAX_TENTATIVAS = 5; // erros de código antes de ser preciso pedir outro
export const INTERVALO_ENTRE_ENVIOS_MS = 60 * 1000; // no mínimo 1 minuto entre dois envios
export const JANELA_ENVIOS_MS = 60 * 60 * 1000;
export const MAX_ENVIOS_NA_JANELA = 5; // no máximo 5 códigos por hora
export const VALIDADE_SESSAO_MS = 90 * 24 * 60 * 60 * 1000; // aparelho confirmado vale 90 dias

export function normalizarEmail(valor) {
  return String(valor || '').trim().toLowerCase().slice(0, 200);
}

export function emailParecidoComEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------- textos em partes

export function dividirEmPartes(texto) {
  const completo = String(texto == null ? '' : texto);
  if (completo.length > MAX_CARACTERES) {
    const erro = new Error('Os dados passam do tamanho máximo.');
    erro.codigo = 'grande_demais';
    throw erro;
  }
  const partes = [];
  for (let i = 0; i < completo.length; i += TAMANHO_PARTE) {
    partes.push(completo.slice(i, i + TAMANHO_PARTE));
  }
  return partes;
}

export function juntarPartes(partes) {
  return (partes || []).map(parte => (parte == null ? '' : String(parte))).join('');
}

// ---------------------------------------------------------------- código de confirmação

export function gerarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function hashCodigo(email, codigo, segredo) {
  return crypto.createHmac('sha256', segredo).update('codigo:' + normalizarEmail(email) + ':' + String(codigo).trim()).digest('hex');
}

function iguaisSemVazar(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// "estado" é o que fica guardado na linha da pessoa:
//   codigoHash, codigoExpira (ms), tentativas, ultimoEnvio (ms), janelaInicio (ms), enviosJanela
export function estadoVazio() {
  return { codigoHash: '', codigoExpira: 0, tentativas: 0, ultimoEnvio: 0, janelaInicio: 0, enviosJanela: 0 };
}

export function lerEstado(bruto) {
  const base = estadoVazio();
  const b = bruto || {};
  return {
    codigoHash: String(b.codigoHash || ''),
    codigoExpira: Number(b.codigoExpira) || base.codigoExpira,
    tentativas: Number(b.tentativas) || base.tentativas,
    ultimoEnvio: Number(b.ultimoEnvio) || base.ultimoEnvio,
    janelaInicio: Number(b.janelaInicio) || base.janelaInicio,
    enviosJanela: Number(b.enviosJanela) || base.enviosJanela
  };
}

// Limita o envio de códigos para ninguém encher a caixa de e-mail de outra pessoa.
export function podeEnviarCodigo(estado, agora) {
  const e = lerEstado(estado);
  const desdeUltimo = agora - e.ultimoEnvio;
  if (e.ultimoEnvio && desdeUltimo < INTERVALO_ENTRE_ENVIOS_MS) {
    return { permitido: false, motivo: 'muito_cedo', esperaSegundos: Math.ceil((INTERVALO_ENTRE_ENVIOS_MS - desdeUltimo) / 1000) };
  }
  const janelaAberta = e.janelaInicio && agora - e.janelaInicio < JANELA_ENVIOS_MS;
  if (janelaAberta && e.enviosJanela >= MAX_ENVIOS_NA_JANELA) {
    return { permitido: false, motivo: 'muitos_envios', esperaSegundos: Math.ceil((JANELA_ENVIOS_MS - (agora - e.janelaInicio)) / 1000) };
  }
  return { permitido: true };
}

export function registrarEnvio(estado, agora, hash) {
  const e = lerEstado(estado);
  const janelaAberta = e.janelaInicio && agora - e.janelaInicio < JANELA_ENVIOS_MS;
  return {
    codigoHash: hash,
    codigoExpira: agora + VALIDADE_CODIGO_MS,
    tentativas: 0,
    ultimoEnvio: agora,
    janelaInicio: janelaAberta ? e.janelaInicio : agora,
    enviosJanela: janelaAberta ? e.enviosJanela + 1 : 1
  };
}

// Confere o código digitado. Devolve o novo estado, que precisa ser gravado mesmo quando
// o código está errado (é assim que as tentativas são contadas).
export function conferirCodigo(estado, email, codigo, segredo, agora) {
  const e = lerEstado(estado);
  if (!e.codigoHash) return { ok: false, motivo: 'sem_codigo', estado: e };
  if (agora > e.codigoExpira) return { ok: false, motivo: 'expirado', estado: { ...e, codigoHash: '', codigoExpira: 0, tentativas: 0 } };
  if (e.tentativas >= MAX_TENTATIVAS) return { ok: false, motivo: 'bloqueado', estado: { ...e, codigoHash: '', codigoExpira: 0 } };

  if (iguaisSemVazar(e.codigoHash, hashCodigo(email, codigo, segredo))) {
    return { ok: true, estado: { ...e, codigoHash: '', codigoExpira: 0, tentativas: 0 } };
  }

  const tentativas = e.tentativas + 1;
  if (tentativas >= MAX_TENTATIVAS) {
    return { ok: false, motivo: 'bloqueado', estado: { ...e, codigoHash: '', codigoExpira: 0, tentativas } };
  }
  return { ok: false, motivo: 'errado', restantes: MAX_TENTATIVAS - tentativas, estado: { ...e, tentativas } };
}

// ---------------------------------------------------------------- sessão do aparelho

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function assinatura(carga, segredo) {
  return crypto.createHmac('sha256', segredo).update('sessao:' + carga).digest('base64url');
}

// A sessão é um "recibo" assinado pelo servidor, com o e-mail e a validade. Não precisa
// ficar guardada em lugar nenhum: basta conferir a assinatura.
export function assinarSessao(email, segredo, agora, validadeMs = VALIDADE_SESSAO_MS) {
  const carga = base64url(JSON.stringify({ e: normalizarEmail(email), x: agora + validadeMs, n: crypto.randomBytes(6).toString('hex') }));
  return { token: carga + '.' + assinatura(carga, segredo), expiraEm: agora + validadeMs };
}

export function lerSessao(token, segredo, agora) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'invalida' };
  if (!iguaisSemVazar(partes[1], assinatura(partes[0], segredo))) return { ok: false, motivo: 'invalida' };
  let carga;
  try {
    carga = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
  } catch (e) {
    return { ok: false, motivo: 'invalida' };
  }
  if (!carga || !carga.e || !Number.isFinite(carga.x)) return { ok: false, motivo: 'invalida' };
  if (agora > carga.x) return { ok: false, motivo: 'expirada' };
  return { ok: true, email: carga.e, expiraEm: carga.x };
}

// O segredo que assina códigos e sessões. Se a pessoa configurar SESSAO_SEGREDO, vale ele;
// senão, reaproveita o USO_SEGREDO que já existe nos dois projetos.
export function segredoDaConta(env) {
  return env.SESSAO_SEGREDO || env.USO_SEGREDO || '';
}

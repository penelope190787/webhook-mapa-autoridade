// Regras de contagem de uso do Mapa da Autoridade, por e-mail.
//
// Este arquivo só tem funções puras (sem planilha e sem rede) de propósito: assim o
// teste em __tests__/uso-regras.test.js roda sem `npm install`, igual ao teste das datas.
//
// O contador de cada pessoa fica na planilha de compras, na linha da compra mais recente
// daquele e-mail, em três colunas que precisam existir na linha 1 da planilha:
//   geracoes   = quantas gerações completas do posicionamento já foram usadas
//   calendario = quantas vezes o calendário de 30 dias foi gerado (etapa 1 e etapa 2),
//                somando todos os meses
//   roteiros   = quantos roteiros com legenda já foram gerados (um por dia do calendário),
//                somando todos os meses
import crypto from 'node:crypto';

export const COLUNAS_USO = ['geracoes', 'calendario', 'roteiros'];

// Calendário de 30 dias: um novo calendário libera a cada 30 dias a contar da data da compra,
// até 12 no ano de acesso. Os que a pessoa não usar continuam disponíveis. Cada calendário
// gasta 2 usos (etapa 1: dias 1 a 7; etapa 2: dias 8 a 30) e tem direito a 30 roteiros.
export const CALENDARIOS_NO_ANO = 12;
export const DIAS_POR_CALENDARIO = 30;
const USOS_POR_CALENDARIO = 2;
const ROTEIROS_POR_CALENDARIO = 30;

const LIMITES_BASICO = { geracoes: 10 };
const LIMITES_ASSINANTE = { geracoes: 50, calendario: CALENDARIOS_NO_ANO * USOS_POR_CALENDARIO, roteiros: CALENDARIOS_NO_ANO * ROTEIROS_POR_CALENDARIO };

// Quantos calendários já podem ser gerados. Se a data da compra não puder ser lida
// (diasDesdeCompra nulo), vale só o primeiro calendário.
export function calendariosLiberados(diasDesdeCompra) {
  if (!Number.isFinite(diasDesdeCompra) || diasDesdeCompra < 0) {
    return 1;
  }
  return Math.min(CALENDARIOS_NO_ANO, Math.floor(diasDesdeCompra / DIAS_POR_CALENDARIO) + 1);
}

// Em quantos dias libera o próximo calendário (nulo quando os 12 já estão liberados).
export function proximoCalendarioEmDias(diasDesdeCompra) {
  const liberados = calendariosLiberados(diasDesdeCompra);
  if (liberados >= CALENDARIOS_NO_ANO || !Number.isFinite(diasDesdeCompra)) {
    return null;
  }
  return liberados * DIAS_POR_CALENDARIO - diasDesdeCompra;
}

// Assinante só ganha o limite maior depois de a garantia de 7 dias acabar, igual à regra
// que o aplicativo já tinha para a geração ilimitada.
export function limitesPara({ isUnlimited, liberadoCompleto, diasDesdeCompra }) {
  if (isUnlimited && liberadoCompleto) {
    return { ...LIMITES_ASSINANTE };
  }
  const liberados = calendariosLiberados(diasDesdeCompra);
  return {
    ...LIMITES_BASICO,
    calendario: liberados * USOS_POR_CALENDARIO,
    roteiros: liberados * ROTEIROS_POR_CALENDARIO
  };
}

export function lerContador(valor) {
  const numero = parseInt(String(valor == null ? '' : valor).trim(), 10);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

// acao: 'consumir' usa uma geração (recusa se o limite já foi atingido),
//       'devolver' desfaz um consumo (quando a IA falhou) e 'consultar' só lê.
export function aplicarAcao({ atual, limite, acao }) {
  if (acao === 'consumir') {
    if (atual >= limite) {
      return { permitido: false, novo: atual };
    }
    return { permitido: true, novo: atual + 1 };
  }
  if (acao === 'devolver') {
    return { permitido: true, novo: Math.max(0, atual - 1) };
  }
  return { permitido: true, novo: atual };
}

// Comparação em tempo constante, para o segredo compartilhado entre o aplicativo e este
// webhook. Sem o segredo certo, ninguém de fora consegue mexer nos contadores.
export function segredoConfere(recebido, esperado) {
  if (typeof recebido !== 'string' || typeof esperado !== 'string' || esperado.length < 16) {
    return false;
  }
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

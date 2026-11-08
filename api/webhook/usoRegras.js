// Regras de contagem de uso do Mapa da Autoridade, por e-mail.
//
// Este arquivo só tem funções puras (sem planilha e sem rede) de propósito: assim o
// teste em __tests__/uso-regras.test.js roda sem `npm install`, igual ao teste das datas.
//
// O contador de cada pessoa fica na planilha de compras, na linha da compra mais recente
// daquele e-mail, em três colunas que precisam existir na linha 1 da planilha:
//   geracoes   = quantas gerações completas do posicionamento já foram usadas
//   calendario = quantas vezes o calendário de 30 dias foi gerado (etapa 1 e etapa 2)
//   roteiros   = quantos roteiros com legenda já foram gerados (um por dia do calendário)
import crypto from 'node:crypto';

export const COLUNAS_USO = ['geracoes', 'calendario', 'roteiros'];

const LIMITES_BASICO = { geracoes: 10, calendario: 3, roteiros: 30 };
const LIMITES_ASSINANTE = { geracoes: 50, calendario: 30, roteiros: 300 };

// Assinante só ganha o limite maior depois de a garantia de 7 dias acabar, igual à regra
// que o aplicativo já tinha para a geração ilimitada.
export function limitesPara({ isUnlimited, liberadoCompleto }) {
  return isUnlimited && liberadoCompleto ? { ...LIMITES_ASSINANTE } : { ...LIMITES_BASICO };
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

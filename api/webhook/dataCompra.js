// Trava anti-fraude de reembolso: a garantia da Cakto é de 7 dias, então
// enquanto a compra estiver dentro desse prazo a pessoa ainda pode pedir
// reembolso e ficar de graça com o Relatório Final e com gerações acima do
// limite básico. Por isso calculamos aqui, no servidor, quantos dias já se
// passaram desde a compra: nunca confiamos no relógio do navegador porque
// ele pode ser adiantado manualmente para burlar a trava.
//
// Este arquivo não importa nenhuma dependência externa (nem google-spreadsheet
// nem google-auth-library) de propósito: assim o teste unitário em
// __tests__/verify-datas.test.js roda sem precisar de `npm install`, já que
// só depende de funções puras de data.
const DIAS_DE_GARANTIA = 7;

// Faz o parse manual do formato gravado por `cakto.js` via
// `new Date().toLocaleString('pt-BR')`, que é algo como
// "28/09/2026, 16:39:44". Não usamos `new Date(stringLocale)` porque esse
// construtor é ambíguo entre motores JS e locales (alguns entendem
// DD/MM/AAAA, outros MM/DD/AAAA), o que poderia inverter dia e mês e travar
// ou liberar a pessoa errada. Aqui o formato é sempre o mesmo porque é o
// próprio webhook quem grava, então um parse manual e explícito é seguro.
export function parseDataCompraBR(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') {
    return null;
  }

  // Tolera espaços extras e a vírgula entre data e hora (ex.: com ou sem
  // espaço depois da vírgula, ou até sem vírgula nenhuma).
  const match = dataStr.trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2}):(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const [, dia, mes, ano, hora, minuto, segundo] = match.map(Number);

  // new Date(ano, mesIndex, dia, ...) usa o horário local do servidor, mas
  // como só nos importa a diferença em dias corridos isso não distorce o
  // cálculo de forma relevante.
  const data = new Date(ano, mes - 1, dia, hora, minuto, segundo);

  // Se algum campo vier fora do intervalo válido (ex.: mês 13), o objeto
  // Date "rola" para o mês seguinte em vez de falhar, então confirmamos que
  // os componentes batem com o que foi digitado antes de confiar no resultado.
  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) {
    return null;
  }

  return data;
}

// Calcula, a partir da string de data gravada na planilha, se a garantia de
// 7 dias já acabou. Falha segura: se não conseguirmos interpretar a data por
// qualquer motivo (linha antiga, formato inesperado, campo vazio), liberamos
// o acesso completo em vez de travar um cliente legítimo por causa de um bug
// nosso de parsing. Isso não abre brecha de abuso porque quem grava esse
// campo é sempre o nosso próprio webhook, nunca o comprador.
export function calcularLiberacao(dataStr, agora = new Date()) {
  const dataCompra = parseDataCompraBR(dataStr);

  if (!dataCompra) {
    console.warn('⚠️ Não foi possível calcular a data de compra da linha (valor recebido: "' + dataStr + '"); liberando acesso completo por segurança.');
    return { liberadoCompleto: true, diasRestantes: 0 };
  }

  const diasDesdeCompra = Math.floor((agora - dataCompra) / 86400000);
  const liberadoCompleto = diasDesdeCompra >= DIAS_DE_GARANTIA;
  const diasRestantes = Math.max(0, DIAS_DE_GARANTIA - diasDesdeCompra);

  return { liberadoCompleto, diasRestantes };
}

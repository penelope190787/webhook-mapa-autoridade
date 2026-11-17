// Lógica das rotas /api/webhook/conta e /api/webhook/dados.
//
// Cada função recebe tudo de que precisa (armazenamento, envio de e-mail, relógio, ambiente)
// e devolve { status, corpo }. Assim o teste roda sem planilha, sem e-mail e sem rede.
import {
  MAX_CARACTERES, VALIDADE_CODIGO_MS, assinarSessao, conferirCodigo, emailParecidoComEmail, gerarCodigo,
  hashCodigo, lerEstado, lerSessao, normalizarEmail, podeEnviarCodigo, registrarEnvio, segredoDaConta
} from './regras.js';

const MENSAGENS_ESPERA = {
  muito_cedo: 'Um código acabou de ser enviado. Espere um pouco antes de pedir outro.',
  muitos_envios: 'Você pediu códigos demais. Tente de novo mais tarde.'
};

function resposta(status, corpo) {
  return { status, corpo };
}

// ---------------------------------------------------------------- /conta

export async function tratarConta({ metodo, corpo, env, agora, armazenamento, enviarEmail }) {
  if (metodo !== 'POST') return resposta(405, { ok: false, mensagem: 'Método não permitido' });

  const segredo = segredoDaConta(env);
  if (!segredo) return resposta(503, { ok: false, codigo: 'nao_configurado', mensagem: 'A conta ainda não foi configurada.' });

  const dados = corpo || {};
  const email = normalizarEmail(dados.email);
  if (!emailParecidoComEmail(email)) return resposta(400, { ok: false, mensagem: 'E-mail inválido.' });

  try {
    if (dados.acao === 'pedir-codigo') return await pedirCodigo({ email, segredo, agora, armazenamento, enviarEmail });
    if (dados.acao === 'confirmar-codigo') return await confirmarCodigo({ email, codigo: dados.codigo, segredo, agora, armazenamento });
    return resposta(400, { ok: false, mensagem: 'Ação inválida.' });
  } catch (erro) {
    console.error('Erro na conta:', erro);
    return resposta(500, { ok: false, mensagem: 'Erro ao processar. Tente de novo em instantes.' });
  }
}

async function pedirCodigo({ email, segredo, agora, armazenamento, enviarEmail }) {
  // Só quem tem compra aprovada recebe código: evita mandar e-mail para qualquer endereço.
  const compra = await armazenamento.statusCompra(email);
  if (!compra.aprovado) {
    return resposta(403, { ok: false, mensagem: 'Não encontramos uma compra aprovada com esse e-mail.' });
  }

  const conta = await armazenamento.lerConta(email);
  const estadoAtual = conta ? conta.estado : lerEstado({});

  const liberado = podeEnviarCodigo(estadoAtual, agora);
  if (!liberado.permitido) {
    return resposta(429, { ok: false, codigo: liberado.motivo, esperaSegundos: liberado.esperaSegundos, mensagem: MENSAGENS_ESPERA[liberado.motivo] });
  }

  const codigo = gerarCodigo();
  await armazenamento.salvarConta(email, { estado: registrarEnvio(estadoAtual, agora, hashCodigo(email, codigo, segredo)) });

  try {
    await enviarEmail({ para: email, codigo });
  } catch (erro) {
    console.error('Falha ao enviar o código por e-mail:', erro && erro.message);
    if (erro && erro.codigo === 'email_nao_configurado') {
      return resposta(503, { ok: false, codigo: 'email_nao_configurado', mensagem: 'O envio de e-mail ainda não está configurado.' });
    }
    return resposta(502, { ok: false, codigo: 'email_falhou', mensagem: 'Não consegui enviar o e-mail agora.' });
  }

  return resposta(200, { ok: true, validadeMinutos: VALIDADE_CODIGO_MS / 60000 });
}

async function confirmarCodigo({ email, codigo, segredo, agora, armazenamento }) {
  const digitos = String(codigo || '').replace(/\D/g, '');
  if (digitos.length !== 6) return resposta(400, { ok: false, motivo: 'formato', mensagem: 'O código tem 6 números.' });

  const conta = await armazenamento.lerConta(email);
  if (!conta) return resposta(400, { ok: false, motivo: 'sem_codigo', mensagem: 'Peça um código novo.' });

  const resultado = conferirCodigo(conta.estado, email, digitos, segredo, agora);
  // Grava o novo estado mesmo quando o código está errado: é assim que as tentativas são contadas.
  await armazenamento.salvarConta(email, { estado: resultado.estado });

  if (!resultado.ok) {
    const mensagens = {
      sem_codigo: 'Peça um código novo.',
      expirado: 'O código venceu. Peça um código novo.',
      bloqueado: 'Muitas tentativas erradas. Peça um código novo.',
      errado: 'Código incorreto. Confira o e-mail e tente de novo.'
    };
    return resposta(400, { ok: false, motivo: resultado.motivo, restantes: resultado.restantes, mensagem: mensagens[resultado.motivo] });
  }

  const sessao = assinarSessao(email, segredo, agora);
  return resposta(200, { ok: true, token: sessao.token, expiraEm: sessao.expiraEm });
}

// ---------------------------------------------------------------- /dados

function lerCabecalhoToken(cabecalhos) {
  const bruto = (cabecalhos && (cabecalhos.authorization || cabecalhos.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(bruto).trim());
  return m ? m[1] : '';
}

export async function tratarDados({ metodo, corpo, cabecalhos, env, agora, armazenamento }) {
  if (metodo !== 'GET' && metodo !== 'PUT') return resposta(405, { ok: false, mensagem: 'Método não permitido' });

  const segredo = segredoDaConta(env);
  if (!segredo) return resposta(503, { ok: false, codigo: 'nao_configurado', mensagem: 'A conta ainda não foi configurada.' });

  const sessao = lerSessao(lerCabecalhoToken(cabecalhos), segredo, agora);
  if (!sessao.ok) {
    return resposta(401, { ok: false, motivo: sessao.motivo, mensagem: 'Confirme este aparelho de novo para continuar.' });
  }
  const email = sessao.email;

  try {
    if (metodo === 'GET') {
      // A compra é conferida ao abrir o app, assim um reembolso tira o acesso aos textos guardados.
      const compra = await armazenamento.statusCompra(email);
      if (!compra.aprovado) return resposta(403, { ok: false, motivo: 'sem_acesso', mensagem: 'Não encontramos uma compra aprovada com esse e-mail.' });

      const conta = await armazenamento.lerConta(email);
      if (!conta || !conta.versao || !conta.dados) return resposta(200, { ok: true, versao: 0, dados: null });
      return resposta(200, { ok: true, versao: conta.versao, atualizadoEm: conta.atualizadoEm, dados: conta.dados });
    }

    // PUT
    const entrada = corpo || {};
    const dados = entrada.dados;
    if (typeof dados !== 'string' || !dados) return resposta(400, { ok: false, mensagem: 'Nada para guardar.' });
    if (dados.length > MAX_CARACTERES) return resposta(413, { ok: false, motivo: 'grande_demais', mensagem: 'Os seus textos passaram do tamanho máximo.' });
    try {
      const objeto = JSON.parse(dados);
      if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) throw new Error('não é um objeto');
    } catch (e) {
      return resposta(400, { ok: false, mensagem: 'Os dados não estão no formato certo.' });
    }

    const conta = await armazenamento.lerConta(email);
    const versaoNoServidor = conta ? conta.versao : 0;
    const versaoDoAparelho = Number(entrada.versao) || 0;

    if (!entrada.forcar && versaoDoAparelho !== versaoNoServidor) {
      return resposta(409, {
        ok: false, motivo: 'conflito', versao: versaoNoServidor,
        atualizadoEm: conta ? conta.atualizadoEm : '', dados: conta ? conta.dados : null,
        mensagem: 'Os textos foram alterados em outro aparelho.'
      });
    }

    const novaVersao = versaoNoServidor + 1;
    const atualizadoEm = new Date(agora).toISOString();
    await armazenamento.salvarConta(email, { versao: novaVersao, atualizadoEm, dados });
    return resposta(200, { ok: true, versao: novaVersao, atualizadoEm });
  } catch (erro) {
    console.error('Erro nos dados da conta:', erro);
    return resposta(500, { ok: false, mensagem: 'Erro ao processar. Tente de novo em instantes.' });
  }
}

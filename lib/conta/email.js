// Envio do código de confirmação por e-mail, pelo servidor de e-mail da própria BSM.
//
// Variáveis de ambiente (projeto webhook-mapa-autoridade, na Vercel):
//   EMAIL_USUARIO  endereço completo da caixa de e-mail que envia (ex.: contato@bsmdigital.shop)
//   EMAIL_SENHA    senha dessa caixa de e-mail
//   EMAIL_SERVIDOR (opcional) padrão: smtp.hostinger.com
//   EMAIL_PORTA    (opcional) padrão: 465
import nodemailer from 'nodemailer';

export class EmailNaoConfigurado extends Error {
  constructor() {
    super('O envio de e-mail ainda não foi configurado.');
    this.codigo = 'email_nao_configurado';
  }
}

export function emailConfigurado(env) {
  return Boolean(env.EMAIL_USUARIO && env.EMAIL_SENHA);
}

export function montarMensagemCodigo(codigo) {
  const assunto = 'Seu código de acesso ao Mapa da Autoridade Digital';
  const texto = [
    'Olá!',
    '',
    'Seu código de confirmação é: ' + codigo,
    '',
    'Digite esse código no painel do Mapa da Autoridade Digital para confirmar este aparelho. Depois disso, os seus textos ficam guardados na sua conta e aparecem em qualquer aparelho em que você entrar.',
    '',
    'O código vale por 10 minutos. Se você não pediu este código, pode ignorar esta mensagem: ninguém consegue entrar na sua conta sem ele.',
    '',
    'BSM Digital'
  ].join('\n');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2c211c;max-width:520px;">' +
    '<p>Olá!</p>' +
    '<p>Seu código de confirmação é:</p>' +
    '<p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#6b342b;margin:8px 0 20px;">' + codigo + '</p>' +
    '<p>Digite esse código no painel do Mapa da Autoridade Digital para confirmar este aparelho. Depois disso, os seus textos ficam guardados na sua conta e aparecem em qualquer aparelho em que você entrar.</p>' +
    '<p>O código vale por 10 minutos. Se você não pediu este código, pode ignorar esta mensagem: ninguém consegue entrar na sua conta sem ele.</p>' +
    '<p style="color:#866e60;">BSM Digital</p></div>';
  return { assunto, texto, html };
}

export async function enviarCodigoPorEmail({ para, codigo }, env = process.env, criarTransporte = nodemailer.createTransport) {
  if (!emailConfigurado(env)) throw new EmailNaoConfigurado();

  const porta = Number(env.EMAIL_PORTA) || 465;
  const transporte = criarTransporte({
    host: env.EMAIL_SERVIDOR || 'smtp.hostinger.com',
    port: porta,
    secure: porta === 465,
    auth: { user: env.EMAIL_USUARIO, pass: env.EMAIL_SENHA }
  });

  const mensagem = montarMensagemCodigo(codigo);
  await transporte.sendMail({
    from: '"Mapa da Autoridade Digital" <' + env.EMAIL_USUARIO + '>',
    to: para,
    subject: mensagem.assunto,
    text: mensagem.texto,
    html: mensagem.html
  });
}

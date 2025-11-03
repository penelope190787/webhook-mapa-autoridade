// Este arquivo existe apenas para satisfazer a Vercel
// As funções reais estão em /api/
module.exports = (req, res) => {
  res.status(200).json({
    message: "Use /api/webhook/cakto para acessar o webhook"
  });
};

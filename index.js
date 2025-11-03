export default function handler(req, res) {
  res.status(200).json({
    message: "Use /api/webhook/cakto para acessar o webhook",
    timestamp: new Date().toISOString()
  });
}

export default function handler(req, res) {
  res.status(200).json({ message: 'Funcionando!' });
}

Depois:

git add .
git commit -m "Test simple endpoint"
git push

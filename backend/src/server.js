require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing from .env file');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`ReconcilePro backend running on http://localhost:${PORT}`);
});
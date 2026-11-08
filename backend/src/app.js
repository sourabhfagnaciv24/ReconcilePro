const express = require('express');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/auth');
const ordersRoutes = require('./routes/orders');
const settlementsRoutes = require('./routes/settlements');
const claimsRoutes = require('./routes/claims');
const reconciliationRoutes = require('./routes/reconciliation');
const aiRoutes = require('./routes/ai');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ReconcilePro API is running'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/settlements', settlementsRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/ai', aiRoutes);

module.exports = app;
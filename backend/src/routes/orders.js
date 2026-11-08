
const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// GET: Fetch logged-in user's orders
router.get('/', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Fetch orders error:', error);
    res.status(500).json({ message: 'Could not fetch orders' });
  }
});

// POST: Bulk import orders from CSV data
router.post('/import', async (req, res) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        message: 'Please provide a non-empty orders array'
      });
    }

    if (orders.length > 10000) {
      return res.status(400).json({
        message: 'Maximum 10,000 orders allowed per import'
      });
    }

    const validOrders = [];
    const invalidRows = [];

    orders.forEach((item, index) => {
      const externalOrderId = String(item.externalOrderId || '').trim();
      const channel = String(item.channel || 'Other').trim();
      const orderAmount = Number(item.orderAmount);
      const expectedSettlement = Number(item.expectedSettlement);

      if (
        !externalOrderId ||
        !Number.isFinite(orderAmount) ||
        !Number.isFinite(expectedSettlement) ||
        orderAmount < 0 ||
        expectedSettlement < 0
      ) {
        invalidRows.push({
          row: index + 1,
          reason: 'Missing order ID or invalid amount'
        });
        return;
      }

      validOrders.push({
        externalOrderId,
        channel,
        orderAmount,
        expectedSettlement,
        userId: req.userId
      });
    });

    if (validOrders.length === 0) {
      return res.status(400).json({
        message: 'No valid orders found',
        invalidRows
      });
    }

    const result = await prisma.order.createMany({
      data: validOrders,
      skipDuplicates: true
    });

    res.status(201).json({
      success: true,
      message: 'Order import completed',
      importedCount: result.count,
      skippedCount: validOrders.length - result.count,
      invalidRows
    });

  } catch (error) {
    console.error('Bulk order import error:', error);
    res.status(500).json({
      message: 'Could not import orders'
    });
  }
});

// POST: Create a single order
router.post('/', async (req, res) => {
  try {
    const {
      externalOrderId,
      channel,
      orderAmount,
      expectedSettlement
    } = req.body;

    if (
      !externalOrderId ||
      !channel ||
      orderAmount === undefined ||
      expectedSettlement === undefined
    ) {
      return res.status(400).json({
        message: 'All order fields are required'
      });
    }

    const amount = Number(orderAmount);
    const expected = Number(expectedSettlement);

    if (
      !Number.isFinite(amount) ||
      !Number.isFinite(expected) ||
      amount < 0 ||
      expected < 0
    ) {
      return res.status(400).json({
        message: 'Amounts must be valid non-negative numbers'
      });
    }

    const order = await prisma.order.create({
      data: {
        externalOrderId: String(externalOrderId).trim(),
        channel: String(channel).trim(),
        orderAmount: amount,
        expectedSettlement: expected,
        userId: req.userId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });

  } catch (error) {
    console.error('Create order error:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({
        message: 'This order ID already exists'
      });
    }

    res.status(500).json({
      message: 'Could not create order'
    });
  }
});

module.exports = router;

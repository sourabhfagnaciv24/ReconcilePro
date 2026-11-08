
const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// GET: Fetch settlements
router.get('/', async (req, res) => {
  try {
    const settlements = await prisma.settlement.findMany({
      where: { userId: req.userId },
      orderBy: { settlementDate: 'desc' },
      include: { order: true }
    });

    res.json({
      success: true,
      count: settlements.length,
      settlements
    });
  } catch (error) {
    console.error('Fetch settlements error:', error);
    res.status(500).json({
      message: 'Could not fetch settlements'
    });
  }
});

// DELETE: Delete one settlement belonging to the logged-in user
router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.settlement.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    res.json({
      success: true,
      message: 'Settlement deleted successfully'
    });

  } catch (error) {
    console.error('Delete settlement error:', error);
    res.status(500).json({
      success: false,
      message: 'Could not delete settlement'
    });
  }
});

// POST: Bulk import settlements from CSV data
router.post('/import', async (req, res) => {
  try {
    const { settlements } = req.body;

    if (!Array.isArray(settlements) || settlements.length === 0) {
      return res.status(400).json({
        message: 'Please provide a non-empty settlements array'
      });
    }

    if (settlements.length > 10000) {
      return res.status(400).json({
        message: 'Maximum 10,000 settlements allowed per import'
      });
    }

    const validSettlements = [];
    const invalidRows = [];

    for (let i = 0; i < settlements.length; i++) {
      const item = settlements[i];

      const externalOrderId = String(item.externalOrderId || '').trim();
      const amount = Number(item.amount);
      const settlementDate = new Date(item.settlementDate);

      if (
        !externalOrderId ||
        item.amount === undefined ||
        item.amount === null ||
        item.amount === '' ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        !Number.isFinite(settlementDate.getTime())
      ) {
        invalidRows.push({
          row: i + 1,
          reason: 'Missing order ID, invalid amount or invalid date'
        });
        continue;
      }

      const order = await prisma.order.findUnique({
        where: {
          userId_externalOrderId: {
            userId: req.userId,
            externalOrderId
          }
        },
        select: { id: true }
      });

      validSettlements.push({
        externalOrderId,
        amount,
        settlementDate,
        sourceFile: item.sourceFile || 'CSV import',
        userId: req.userId,
        orderId: order ? order.id : null
      });
    }

    if (validSettlements.length === 0) {
      return res.status(400).json({
        message: 'No valid settlements found',
        invalidRows
      });
    }

    const result = await prisma.settlement.createMany({
      data: validSettlements
    });

    res.status(201).json({
      success: true,
      message: 'Settlement import completed',
      importedCount: result.count,
      invalidRows
    });

  } catch (error) {
    console.error('Settlement import error:', error);
    res.status(500).json({
      message: 'Could not import settlements'
    });
  }
});

// POST: Create one settlement
router.post('/', async (req, res) => {
  try {
    const {
      externalOrderId,
      amount,
      settlementDate,
      sourceFile
    } = req.body;

    if (
      !externalOrderId ||
      amount === undefined ||
      amount === null ||
      !settlementDate
    ) {
      return res.status(400).json({
        message: 'Order ID, amount and settlement date are required'
      });
    }

    const numericAmount = Number(amount);
    const parsedDate = new Date(settlementDate);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount < 0 ||
      !Number.isFinite(parsedDate.getTime())
    ) {
      return res.status(400).json({
        message: 'Invalid amount or settlement date'
      });
    }

    const normalizedOrderId = String(externalOrderId).trim();

    const order = await prisma.order.findUnique({
      where: {
        userId_externalOrderId: {
          userId: req.userId,
          externalOrderId: normalizedOrderId
        }
      }
    });

    const settlement = await prisma.settlement.create({
      data: {
        externalOrderId: normalizedOrderId,
        amount: numericAmount,
        settlementDate: parsedDate,
        sourceFile: sourceFile || null,
        userId: req.userId,
        orderId: order ? order.id : null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Settlement created successfully',
      linkedToOrder: Boolean(order),
      settlement
    });

  } catch (error) {
    console.error('Create settlement error:', error);
    res.status(500).json({
      message: 'Could not create settlement'
    });
  }
});

module.exports = router;

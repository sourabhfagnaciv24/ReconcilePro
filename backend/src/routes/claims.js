
const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// GET: Fetch all claims
router.get('/', async (req, res) => {
  try {
    const claims = await prisma.claim.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: { order: true }
    });

    res.json({
      success: true,
      count: claims.length,
      claims
    });
  } catch (error) {
    console.error('Fetch claims error:', error);
    res.status(500).json({ message: 'Could not fetch claims' });
  }
});

// POST: Create a claim manually
router.post('/', async (req, res) => {
  try {
    const { amount, reason, externalOrderId } = req.body;

    if (amount === undefined || !reason || !externalOrderId) {
      return res.status(400).json({
        message: 'Amount, reason and order ID are required'
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: 'Claim amount must be greater than zero'
      });
    }

    const order = await prisma.order.findUnique({
      where: {
        userId_externalOrderId: {
          userId: req.userId,
          externalOrderId: String(externalOrderId).trim()
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    const claim = await prisma.claim.create({
      data: {
        amount: numericAmount,
        reason: String(reason).trim(),
        userId: req.userId,
        orderId: order.id
      }
    });

    res.status(201).json({
      success: true,
      message: 'Claim created successfully',
      claim
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ message: 'Could not create claim' });
  }
});

// POST: Automatically generate a claim for a mismatched order
router.post('/generate/:externalOrderId', async (req, res) => {
  try {
    const externalOrderId = String(req.params.externalOrderId).trim();

    const order = await prisma.order.findUnique({
      where: {
        userId_externalOrderId: {
          userId: req.userId,
          externalOrderId
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check whether a claim already exists for this order
    const existingClaim = await prisma.claim.findFirst({
      where: {
        userId: req.userId,
        orderId: order.id
      }
    });

    if (existingClaim) {
      return res.status(409).json({
        success: false,
        message: 'A claim already exists for this order',
        claim: existingClaim
      });
    }

    // Fetch all settlements linked to this order
    const settlements = await prisma.settlement.findMany({
      where: {
        userId: req.userId,
        externalOrderId
      }
    });

    if (settlements.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No settlement found for this order'
      });
    }

    // Calculate total amount received
    const receivedAmount = settlements.reduce(
      (total, settlement) => total + Number(settlement.amount),
      0
    );

    const expectedAmount = Number(order.expectedSettlement);
    const difference = Number(
      (expectedAmount - receivedAmount).toFixed(2)
    );

    if (!Number.isFinite(expectedAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expected settlement amount'
      });
    }

    if (difference <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No settlement shortfall found. Claim cannot be generated.'
      });
    }

    const claim = await prisma.claim.create({
      data: {
        amount: difference,
        reason: 'Automatically generated: Settlement amount received is lower than expected',
        userId: req.userId,
        orderId: order.id
      },
      include: {
        order: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Claim generated successfully',
      claim,
      calculation: {
        expectedAmount,
        receivedAmount,
        difference
      }
    });

  } catch (error) {
    console.error('Automatic claim generation error:', error);

    res.status(500).json({
      success: false,
      message: 'Could not generate claim'
    });
  }
});

// PATCH: Update claim status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      'SUBMITTED',
      'APPROVED',
      'REJECTED',
      'PAID'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status',
        allowedStatuses
      });
    }

    const existingClaim = await prisma.claim.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!existingClaim) {
      return res.status(404).json({
        message: 'Claim not found'
      });
    }

    const updatedClaim = await prisma.claim.update({
      where: { id: existingClaim.id },
      data: { status }
    });

    res.json({
      success: true,
      message: 'Claim status updated successfully',
      claim: updatedClaim
    });
  } catch (error) {
    console.error('Update claim error:', error);
    res.status(500).json({
      message: 'Could not update claim status'
    });
  }
});

module.exports = router;

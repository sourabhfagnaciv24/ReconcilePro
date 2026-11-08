
const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// POST: Run reconciliation
router.post('/run', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId }
    });

    const settlements = await prisma.settlement.findMany({
      where: { userId: req.userId }
    });

    const settlementMap = new Map();

    settlements.forEach((settlement) => {
      const orderId = settlement.externalOrderId;
      const currentAmount = settlementMap.get(orderId) || 0;

      settlementMap.set(
        orderId,
        currentAmount + Number(settlement.amount)
      );
    });

    const results = [];

    let matchedCount = 0;
    let mismatchCount = 0;
    let pendingCount = 0;
    let moneyAtRisk = 0;

    for (const order of orders) {
      const expected = Number(order.expectedSettlement);
      const hasSettlement = settlementMap.has(order.externalOrderId);

      if (!hasSettlement) {
        pendingCount++;

        results.push({
          orderId: order.externalOrderId,
          expectedSettlement: expected,
          receivedSettlement: null,
          difference: null,
          status: 'PENDING'
        });

        continue;
      }

      const received = settlementMap.get(order.externalOrderId);

      const difference = Math.round(
        (expected - received) * 100
      ) / 100;

      const status = Math.abs(difference) <= 0.01
        ? 'MATCHED'
        : 'MISMATCH';

      if (status === 'MATCHED') {
        matchedCount++;
      } else {
        mismatchCount++;
      }

      if (difference > 0.01) {
        moneyAtRisk += difference;
      }

      results.push({
        orderId: order.externalOrderId,
        expectedSettlement: expected,
        receivedSettlement: received,
        difference,
        status
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          receivedSettlement: received,
          difference,
          status,
          reconciledAt: new Date()
        }
      });
    }

    const orderIds = new Set(
      orders.map(order => order.externalOrderId)
    );

    const unknownOrderIds = [
      ...new Set(
        settlements
          .filter(s => !orderIds.has(s.externalOrderId))
          .map(s => s.externalOrderId)
      )
    ];

    res.json({
      success: true,
      message: 'Reconciliation completed successfully',

      summary: {
        totalOrders: orders.length,
        matchedCount,
        mismatchCount,
        pendingCount,
        unknownOrderCount: unknownOrderIds.length,
        moneyAtRisk: Math.round(moneyAtRisk * 100) / 100
      },

      unknownOrderIds,
      results
    });

  } catch (error) {
    console.error('Reconciliation error:', error);

    res.status(500).json({
      message: 'Reconciliation failed'
    });
  }
});


// GET: Fetch reconciliation results
router.get('/results', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        userId: req.userId,
        reconciledAt: { not: null }
      },
      orderBy: {
        reconciledAt: 'desc'
      }
    });

    res.json({
      success: true,
      count: orders.length,
      results: orders
    });

  } catch (error) {
    console.error('Fetch reconciliation results error:', error);

    res.status(500).json({
      message: 'Could not fetch reconciliation results'
    });
  }
});


// Helper: Escape XML special characters
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


// Helper: Format date as YYYYMMDD
function formatTallyDate(date) {
  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid settlement date');
  }

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0')
  ].join('');
}


// GET: Export settlements as configurable Tally XML
router.get('/tally-xml', async (req, res) => {
  try {
    const bankLedger = String(
      req.query.bankLedger || 'Bank Account'
    ).trim();

    const marketplaceLedger = String(
      req.query.marketplaceLedger || 'Marketplace Receivable'
    ).trim();

    const voucherType = String(
      req.query.voucherType || 'Receipt'
    ).trim();

    // Export filter:
    // all = include every settlement
    // matched = include settlements for matched orders only
    // excludeUnknown = exclude settlements without a matching order

    const exportFilter = String(
      req.query.exportFilter || 'all'
    ).trim();

    if (!bankLedger || !marketplaceLedger || !voucherType) {
      return res.status(400).json({
        success: false,
        message: 'Ledger names and voucher type cannot be empty.'
      });
    }

    if (
      bankLedger.toLowerCase() ===
      marketplaceLedger.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Bank and marketplace ledger names must be different.'
      });
    }

    const allowedFilters = [
      'all',
      'matched',
      'excludeUnknown'
    ];

    if (!allowedFilters.includes(exportFilter)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid export filter.'
      });
    }

    const settlements = await prisma.settlement.findMany({
      where: { userId: req.userId },
      orderBy: { settlementDate: 'asc' }
    });

    if (settlements.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No settlements found to export.'
      });
    }

    // Fetch only this user's orders
    const orders = await prisma.order.findMany({
      where: { userId: req.userId }
    });

    // Map each external order ID to its order
    const orderMap = new Map(
      orders.map(order => [
        order.externalOrderId,
        order
      ])
    );

    // Calculate total received amount for each order.
    // This is important when an order has multiple settlements.
    const receivedMap = new Map();

    settlements.forEach((settlement) => {
      const orderId = settlement.externalOrderId;

      const currentAmount = receivedMap.get(orderId) || 0;

      receivedMap.set(
        orderId,
        currentAmount + Number(settlement.amount)
      );
    });

    // Select settlements according to the chosen filter
    const filteredSettlements = settlements.filter((settlement) => {
      const order = orderMap.get(settlement.externalOrderId);

      // Include everything
      if (exportFilter === 'all') {
        return true;
      }

      // Exclude settlements whose order does not exist
      if (exportFilter === 'excludeUnknown') {
        return Boolean(order);
      }

      // Include only settlements belonging to matched orders
      if (exportFilter === 'matched') {
        if (!order) {
          return false;
        }

        const expected = Number(order.expectedSettlement);
        const received = receivedMap.get(order.externalOrderId) || 0;

        if (!Number.isFinite(expected)) {
          return false;
        }

        const difference = Math.round(
          (expected - received) * 100
        ) / 100;

        return Math.abs(difference) <= 0.01;
      }

      return false;
    });

    if (filteredSettlements.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No settlements match the selected export filter.'
      });
    }

    const vouchers = filteredSettlements.map((settlement) => {
      const amount = Number(settlement.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(
          `Invalid settlement amount for ${settlement.externalOrderId}`
        );
      }

      const formattedAmount = amount.toFixed(2);
      const date = formatTallyDate(settlement.settlementDate);

      const voucherNumber = `RP-${settlement.id}`;

      const narration =
        `Settlement received for order ${settlement.externalOrderId}`;

      return `
<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <VOUCHER VCHTYPE="${escapeXml(voucherType)}"
           ACTION="Create"
           OBJVIEW="Accounting Voucher View">

    <DATE>${date}</DATE>
    <VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
    <NARRATION>${escapeXml(narration)}</NARRATION>
    <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
    <ISINVOICE>No</ISINVOICE>

    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${escapeXml(bankLedger)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${formattedAmount}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>

    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${escapeXml(marketplaceLedger)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>-${formattedAmount}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>

  </VOUCHER>
</TALLYMESSAGE>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        ${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    res.setHeader(
      'Content-Type',
      'application/xml; charset=utf-8'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ReconcilePro_Tally_Import.xml"'
    );

    res.status(200).send(xml);

  } catch (error) {
    console.error('Tally XML export error:', error);

    res.status(500).json({
      success: false,
      message: 'Could not generate Tally XML export.'
    });
  }
});

module.exports = router;

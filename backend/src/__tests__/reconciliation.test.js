
process.env.JWT_SECRET = 'test-secret-key';

jest.mock('../prisma', () => ({
  order: {
    findMany: jest.fn(),
    update: jest.fn()
  },
  settlement: {
    findMany: jest.fn()
  }
}));

jest.mock('../middleware/authMiddleware', () =>
  (req, res, next) => {
    req.userId = 'test-user-1';
    next();
  }
);

const request = require('supertest');
const prisma = require('../prisma');
const app = require('../app');

describe('Reconciliation API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST run should calculate matched and mismatched orders', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        externalOrderId: 'ORD-101',
        expectedSettlement: 1350
      },
      {
        id: 'order-2',
        externalOrderId: 'ORD-102',
        expectedSettlement: 1000
      },
      {
        id: 'order-3',
        externalOrderId: 'ORD-103',
        expectedSettlement: 500
      }
    ]);

    prisma.settlement.findMany.mockResolvedValue([
      { externalOrderId: 'ORD-101', amount: 1350 },
      { externalOrderId: 'ORD-102', amount: 950 },
      { externalOrderId: 'UNKNOWN-1', amount: 200 }
    ]);

    prisma.order.update.mockResolvedValue({});

    const response = await request(app)
      .post('/api/reconciliation/run');

    expect(response.status).toBe(200);
    expect(response.body.summary.totalOrders).toBe(3);
    expect(response.body.summary.matchedCount).toBe(1);
    expect(response.body.summary.mismatchCount).toBe(1);
    expect(response.body.summary.pendingCount).toBe(1);
    expect(response.body.summary.unknownOrderCount).toBe(1);
    expect(response.body.summary.moneyAtRisk).toBe(50);

    expect(response.body.results[0].status).toBe('MATCHED');
    expect(response.body.results[1].status).toBe('MISMATCH');
    expect(response.body.results[2].status).toBe('PENDING');
  });

  test('POST run should identify multiple settlements for one order', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        externalOrderId: 'ORD-101',
        expectedSettlement: 1350
      }
    ]);

    prisma.settlement.findMany.mockResolvedValue([
      { externalOrderId: 'ORD-101', amount: 700 },
      { externalOrderId: 'ORD-101', amount: 650 }
    ]);

    prisma.order.update.mockResolvedValue({});

    const response = await request(app)
      .post('/api/reconciliation/run');

    expect(response.status).toBe(200);
    expect(response.body.summary.matchedCount).toBe(1);
    expect(response.body.results[0].receivedSettlement).toBe(1350);
  });

  test('GET results should return reconciliation results', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        externalOrderId: 'ORD-101',
        status: 'MATCHED'
      }
    ]);

    const response = await request(app)
      .get('/api/reconciliation/results');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
  });

  test('Tally XML should export valid settlement data', async () => {
    prisma.settlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        externalOrderId: 'ORD-101',
        amount: 1350,
        settlementDate: new Date('2026-11-08T00:00:00.000Z')
      }
    ]);

    prisma.order.findMany.mockResolvedValue([
      {
        externalOrderId: 'ORD-101',
        expectedSettlement: 1350
      }
    ]);

    const response = await request(app)
      .get('/api/reconciliation/tally-xml');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.text).toContain('<DATE>20261108</DATE>');
    expect(response.text).toContain('<AMOUNT>1350.00</AMOUNT>');
    expect(response.text).toContain('Bank Account');
    expect(response.text).toContain('Marketplace Receivable');
  });

  test('Tally XML should reject identical ledger names', async () => {
    const response = await request(app)
      .get('/api/reconciliation/tally-xml')
      .query({
        bankLedger: 'Amazon',
        marketplaceLedger: 'Amazon'
      });

    expect(response.status).toBe(400);
  });

  test('Tally XML should reject invalid export filters', async () => {
    const response = await request(app)
      .get('/api/reconciliation/tally-xml')
      .query({ exportFilter: 'invalid' });

    expect(response.status).toBe(400);
  });

  test('Tally XML should return 404 when no settlements exist', async () => {
    prisma.settlement.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/reconciliation/tally-xml');

    expect(response.status).toBe(404);
  });
});

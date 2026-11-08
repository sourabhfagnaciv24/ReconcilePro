process.env.JWT_SECRET = 'test-secret-key';

jest.mock('../prisma', () => ({
  settlement: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn()
  },
  order: {
    findUnique: jest.fn()
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

describe('Settlements API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET settlements should return user settlements', async () => {
    prisma.settlement.findMany.mockResolvedValue([
      { id: 'settlement-1', externalOrderId: 'ORD-101', amount: 1350 }
    ]);

    const response = await request(app)
      .get('/api/settlements');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'test-user-1' }
      })
    );
  });

  test('POST settlement should create and link settlement to order', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1'
    });

    prisma.settlement.create.mockImplementation(async ({ data }) => ({
      id: 'settlement-1',
      ...data
    }));

    const response = await request(app)
      .post('/api/settlements')
      .send({
        externalOrderId: 'ORD-101',
        amount: 1350,
        settlementDate: '2026-11-08',
        sourceFile: 'settlement.csv'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.linkedToOrder).toBe(true);
    expect(response.body.settlement.orderId).toBe('order-1');
  });

  test('POST settlement should allow an unknown order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    prisma.settlement.create.mockImplementation(async ({ data }) => ({
      id: 'settlement-2',
      ...data
    }));

    const response = await request(app)
      .post('/api/settlements')
      .send({
        externalOrderId: 'UNKNOWN-101',
        amount: 500,
        settlementDate: '2026-11-08'
      });

    expect(response.status).toBe(201);
    expect(response.body.linkedToOrder).toBe(false);
    expect(response.body.settlement.orderId).toBeNull();
  });

  test('POST settlement should reject missing fields', async () => {
    const response = await request(app)
      .post('/api/settlements')
      .send({
        externalOrderId: 'ORD-101'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Order ID, amount and settlement date are required'
    );
  });

  test('POST settlement should reject invalid amounts', async () => {
    const response = await request(app)
      .post('/api/settlements')
      .send({
        externalOrderId: 'ORD-101',
        amount: -100,
        settlementDate: '2026-11-08'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Invalid amount or settlement date'
    );
  });

  test('Bulk import should reject empty settlements', async () => {
    const response = await request(app)
      .post('/api/settlements/import')
      .send({ settlements: [] });

    expect(response.status).toBe(400);
  });

  test('Bulk import should import valid settlements', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1'
    });

    prisma.settlement.createMany.mockResolvedValue({
      count: 1
    });

    const response = await request(app)
      .post('/api/settlements/import')
      .send({
        settlements: [
          {
            externalOrderId: 'ORD-101',
            amount: 1350,
            settlementDate: '2026-11-08'
          }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.importedCount).toBe(1);
  });

  test('DELETE settlement should delete an existing settlement', async () => {
    prisma.settlement.deleteMany.mockResolvedValue({
      count: 1
    });

    const response = await request(app)
      .delete('/api/settlements/settlement-1');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('DELETE settlement should return 404 if not found', async () => {
    prisma.settlement.deleteMany.mockResolvedValue({
      count: 0
    });

    const response = await request(app)
      .delete('/api/settlements/unknown');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
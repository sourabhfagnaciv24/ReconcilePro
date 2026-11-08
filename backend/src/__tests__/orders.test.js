process.env.JWT_SECRET = 'test-secret-key';

jest.mock('../prisma', () => ({
  order: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn()
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

describe('Orders API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET orders should return logged-in user orders', async () => {
    prisma.order.findMany.mockResolvedValue([
      { externalOrderId: 'ORD-101', orderAmount: 1500 }
    ]);

    const response = await request(app)
      .get('/api/orders');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(1);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'test-user-1' }
      })
    );
  });

  test('POST order should create a valid order', async () => {
    prisma.order.create.mockImplementation(async ({ data }) => ({
      id: 'order-1',
      ...data
    }));

    const response = await request(app)
      .post('/api/orders')
      .send({
        externalOrderId: 'ORD-101',
        channel: 'Amazon',
        orderAmount: 1500,
        expectedSettlement: 1350
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.order.externalOrderId).toBe('ORD-101');
    expect(response.body.order.userId).toBe('test-user-1');
  });

  test('POST order should reject missing fields', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({
        externalOrderId: 'ORD-101'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'All order fields are required'
    );
  });

  test('POST order should reject negative amounts', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({
        externalOrderId: 'ORD-101',
        channel: 'Amazon',
        orderAmount: -100,
        expectedSettlement: 90
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Amounts must be valid non-negative numbers'
    );
  });

  test('POST order should reject duplicate order IDs', async () => {
    prisma.order.create.mockRejectedValue({
      code: 'P2002'
    });

    const response = await request(app)
      .post('/api/orders')
      .send({
        externalOrderId: 'ORD-101',
        channel: 'Amazon',
        orderAmount: 1500,
        expectedSettlement: 1350
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'This order ID already exists'
    );
  });

  test('Bulk import should reject an empty array', async () => {
    const response = await request(app)
      .post('/api/orders/import')
      .send({ orders: [] });

    expect(response.status).toBe(400);
  });

  test('Bulk import should import valid orders', async () => {
    prisma.order.createMany.mockResolvedValue({ count: 2 });

    const response = await request(app)
      .post('/api/orders/import')
      .send({
        orders: [
          {
            externalOrderId: 'ORD-201',
            channel: 'Amazon',
            orderAmount: 1500,
            expectedSettlement: 1350
          },
          {
            externalOrderId: 'ORD-202',
            channel: 'Flipkart',
            orderAmount: 2000,
            expectedSettlement: 1800
          }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.importedCount).toBe(2);
    expect(response.body.skippedCount).toBe(0);
  });
});
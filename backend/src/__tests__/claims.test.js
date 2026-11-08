process.env.JWT_SECRET = 'test-secret-key';

jest.mock('../prisma', () => ({
  claim: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  order: {
    findUnique: jest.fn()
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

describe('Claims API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET claims should return user claims', async () => {
    prisma.claim.findMany.mockResolvedValue([
      { id: 'claim-1', amount: 100 }
    ]);

    const response = await request(app)
      .get('/api/claims');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
  });

  test('POST claim should create a valid claim', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1'
    });

    prisma.claim.create.mockImplementation(async ({ data }) => ({
      id: 'claim-1',
      ...data
    }));

    const response = await request(app)
      .post('/api/claims')
      .send({
        amount: 100,
        reason: 'Settlement shortfall',
        externalOrderId: 'ORD-101'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.claim.amount).toBe(100);
  });

  test('POST claim should reject missing fields', async () => {
    const response = await request(app)
      .post('/api/claims')
      .send({ amount: 100 });

    expect(response.status).toBe(400);
  });

  test('POST claim should reject zero or negative amounts', async () => {
    const response = await request(app)
      .post('/api/claims')
      .send({
        amount: 0,
        reason: 'Shortfall',
        externalOrderId: 'ORD-101'
      });

    expect(response.status).toBe(400);
  });

  test('POST claim should return 404 for unknown order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/claims')
      .send({
        amount: 100,
        reason: 'Shortfall',
        externalOrderId: 'UNKNOWN'
      });

    expect(response.status).toBe(404);
  });

  test('Automatic claim should calculate settlement shortfall', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      expectedSettlement: 1350
    });

    prisma.claim.findFirst.mockResolvedValue(null);

    prisma.settlement.findMany.mockResolvedValue([
      { amount: 1300 }
    ]);

    prisma.claim.create.mockImplementation(async ({ data }) => ({
      id: 'claim-1',
      ...data
    }));

    const response = await request(app)
      .post('/api/claims/generate/ORD-101');

    expect(response.status).toBe(201);
    expect(response.body.calculation.expectedAmount).toBe(1350);
    expect(response.body.calculation.receivedAmount).toBe(1300);
    expect(response.body.calculation.difference).toBe(50);
    expect(response.body.claim.amount).toBe(50);
  });

  test('Automatic claim should reject an existing claim', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      expectedSettlement: 1350
    });

    prisma.claim.findFirst.mockResolvedValue({
      id: 'claim-1',
      amount: 50
    });

    const response = await request(app)
      .post('/api/claims/generate/ORD-101');

    expect(response.status).toBe(409);
  });

  test('Automatic claim should reject when no settlement exists', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      expectedSettlement: 1350
    });

    prisma.claim.findFirst.mockResolvedValue(null);
    prisma.settlement.findMany.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/claims/generate/ORD-101');

    expect(response.status).toBe(400);
  });

  test('PATCH claim status should update status', async () => {
    prisma.claim.findFirst.mockResolvedValue({
      id: 'claim-1',
      status: 'SUBMITTED'
    });

    prisma.claim.update.mockResolvedValue({
      id: 'claim-1',
      status: 'APPROVED'
    });

    const response = await request(app)
      .patch('/api/claims/claim-1/status')
      .send({ status: 'APPROVED' });

    expect(response.status).toBe(200);
    expect(response.body.claim.status).toBe('APPROVED');
  });

  test('PATCH claim status should reject invalid status', async () => {
    const response = await request(app)
      .patch('/api/claims/claim-1/status')
      .send({ status: 'PENDING' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid status');
  });

  test('PATCH claim status should return 404 for unknown claim', async () => {
    prisma.claim.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch('/api/claims/unknown/status')
      .send({ status: 'APPROVED' });

    expect(response.status).toBe(404);
  });
});
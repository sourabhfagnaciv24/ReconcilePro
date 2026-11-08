process.env.JWT_SECRET = 'test-secret-key';

jest.mock('../prisma', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn()
  }
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const app = require('../app');

describe('Authentication API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Registration should reject missing fields', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Name, email and password are required'
    );
  });

  test('Registration should reject short passwords', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: '12345'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Password must be at least 8 characters'
    );
  });

  test('Registration should create a new user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: 'user-1',
      name: data.name,
      email: data.email
    }));

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('test@example.com');
  });

  test('Registration should reject an existing email', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com'
    });

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'Email is already registered'
    );
  });

  test('Login should succeed with correct credentials', async () => {
    const passwordHash = await bcrypt.hash('password123', 12);

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      passwordHash
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('test@example.com');
  });

  test('Login should reject incorrect passwords', async () => {
    const passwordHash = await bcrypt.hash('password123', 12);

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      passwordHash
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      'Invalid email or password'
    );
  });
});
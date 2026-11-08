# ReconcilePro – Deployment Guide

## 1. Project Overview

ReconcilePro is a D2C order, payment, settlement, and return reconciliation platform.

It helps businesses:
- Manage orders and settlements.
- Import CSV files.
- Reconcile expected and received payments.
- Identify mismatches and pending settlements.
- Track financial discrepancies and money at risk.
- Create and manage claims.
- Generate Excel and PDF reports.
- Export accounting data in Tally-compatible CSV and XML formats.
- Suggest CSV column mappings using Gemini AI.

## 2. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Authentication | JWT, bcryptjs |
| AI integration | Google Gemini API |
| Testing | Jest, Supertest |
| Frontend hosting | Vercel |
| Backend hosting | Render |

## 3. Prerequisites

Install the following:
- Node.js and npm
- Git
- PostgreSQL database (Neon recommended)
- GitHub account
- Render and Vercel accounts

## 4. Local Installation

Clone the repository:

```bash
git clone https://github.com/sourabhfagnaciv24/ReconcilePro.git
cd ReconcilePro
```

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file inside the backend directory:

```env
DATABASE_URL=your_database_connection_string
DIRECT_URL=your_direct_database_connection_string
JWT_SECRET=your_secure_secret
GEMINI_API_KEY=your_gemini_api_key
```

Generate Prisma Client:

```bash
npx prisma generate
```

Apply database migrations:

```bash
npx prisma migrate deploy
```

Start the backend:

```bash
npm start
```

Backend default URL:

`http://localhost:5000`

### Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env` file inside the frontend directory:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

Frontend default URL:

`http://localhost:5173`

## 5. Environment Variables

### Backend

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection URL |
| DIRECT_URL | Direct PostgreSQL connection URL |
| JWT_SECRET | Secret used for JWT authentication |
| GEMINI_API_KEY | Google Gemini API key |
| PORT | Server port; assigned automatically by Render in production |
| NODE_ENV | Set to production when deployed |

### Frontend

| Variable | Description |
|---|---|
| VITE_API_URL | Backend API base URL |

Never commit `.env` files or expose private API keys in the frontend.

## 6. Production Deployment

### Backend – Render

1. Connect the GitHub repository to Render.
2. Create a Web Service.
3. Set Root Directory to `backend`.
4. Set Build Command:

```bash
npm install && npx prisma generate
```

5. Set Start Command:

```bash
npm start
```

6. Add the backend environment variables in Render.
7. Deploy the service.

Backend URL:

`https://reconcilepro-zc8r.onrender.com`

Health-check endpoint:

`https://reconcilepro-zc8r.onrender.com/`

### Frontend – Vercel

1. Import the GitHub repository into Vercel.
2. Set Root Directory to `frontend`.
3. Select Vite as the framework preset.
4. Set Build Command:

```bash
npm run build
```

5. Set Output Directory to:

```text
dist
```

6. Add the environment variable:

```env
VITE_API_URL=https://reconcilepro-zc8r.onrender.com/api
```

7. Deploy the frontend.

## 7. Testing

Run backend tests:

```bash
cd backend
npm test
```

Verified test results:

- Test suites passed: 5
- Tests passed: 40
- Tests failed: 0

Build the frontend:

```bash
cd frontend
npm run build
```

The frontend production build completed successfully.

## 8. Important Notes and Limitations

- Render free instances may sleep after inactivity, causing delays during the first request.
- Gemini AI suggestions depend on API availability and may occasionally fail due to temporary service overload. Manual column mapping is available as a fallback.
- Tally XML export is provided for accounting integration. Import compatibility should be verified against the target TallyPrime configuration.
- Production database credentials and API keys must be configured through hosting environment settings.

## 9. Repository

GitHub:

https://github.com/sourabhfagnaciv24/ReconcilePro

## 10. Conclusion

ReconcilePro provides an integrated workflow for D2C financial reconciliation, helping businesses identify settlement discrepancies, manage claims, and prepare accounting reports.
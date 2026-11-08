# ReconcilePro

**D2C Order, Payment and Return Reconciliation System**

ReconcilePro is a reconciliation platform designed for Direct-to-Consumer (D2C) businesses. It helps businesses track orders, settlements, payment mismatches, and claims across multiple sales channels.

## Key Features

- **Order Management:** Create, view, and manage customer orders.
- **Settlement Management:** Record and track received settlement amounts.
- **CSV Import:** Upload order and settlement CSV files.
- **AI Column Mapping:** Get AI-powered suggestions for matching CSV columns, with manual mapping as a fallback.
- **Automated Reconciliation:** Compare expected and received settlement amounts and identify mismatches.
- **Money at Risk:** Calculate the amount of money involved in settlement discrepancies.
- **Claims Management:** Create claims for mismatches and track their status.
- **Reports:** Export reconciliation reports in Excel and PDF formats.
- **Tally Export:** Generate Tally-compatible CSV and XML files.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express |
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Authentication | JWT |
| AI Integration | Google Gemini API |
| Testing | Jest, Supertest |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

## Project Structure

```text
ReconcilePro/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── __tests__/
│   │   ├── app.js
│   │   ├── server.js
│   │   └── prisma.js
│   └── prisma/
├── frontend/
│   └── src/
│       └── App.jsx
├── deployment.md
└── README.md
```

## Local Setup

### Prerequisites

- Node.js and npm
- PostgreSQL database
- Google Gemini API key (for AI column mapping)

### 1. Clone the repository

```bash
git clone https://github.com/sourabhfagnaciv24/ReconcilePro.git
cd ReconcilePro
```

### 2. Backend setup

```bash
cd backend
npm install
```

Create a `.env` file inside the backend folder:

```env
DATABASE_URL=your_database_url
DIRECT_URL=your_direct_database_url
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
PORT=5000
```

Run:

```bash
npx prisma generate
npx prisma migrate deploy
npm start
```

### 3. Frontend setup

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env` file inside the frontend folder:

```env
VITE_API_URL=http://localhost:5000/api
```

Run:

```bash
npm run dev
```

Open the local URL shown by Vite in your browser.

## Testing

Run backend tests:

```bash
cd backend
npm test
```

**Latest verified result:** 5 test suites passed and 40 tests passed.

Build the frontend:

```bash
cd frontend
npm run build
```

The production build completed successfully. Vite reported a large JavaScript bundle warning, which is a performance optimization opportunity rather than a build failure.

## Live Deployment

- **GitHub:** https://github.com/sourabhfagnaciv24/ReconcilePro
- **Backend API:** https://reconcilepro-zc8r.onrender.com

The frontend is configured for Vercel deployment. Use the deployed Vercel URL when sharing the live application.

## Important Notes

- Keep all API keys, database credentials, and JWT secrets private.
- Render's free backend service may sleep after inactivity, causing a delay on the first request.
- AI column mapping depends on Gemini API availability. Manual mapping is available as a fallback.
- Tally XML output is generated for import; successful import should be verified against the target TallyPrime configuration.

## Author

**Sourabh Fagna**

B.Tech, Civil Engineering  
Indian Institute of Technology (BHU), Varanasi

# AaplaPramaanPatra
Blockchain Based Certificate Management System

## Project Overview

Blockchain-based certificate management and verification system inspired by Indian government platforms like DigiLocker.

Certificate management platform built with React, Express, MySQL, Solidity, Hardhat, `ethers.js`, and Ganache. The blockchain flow is fully local: no MetaMask, no Sepolia, no external wallet provider.

## Features

- Blockchain certificate storage
- Public verification portal
- QR code verification
- Certificate status system
- Role-based dashboards
- Issuer certificate management

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL
- Smart Contract: Solidity
- Blockchain Library: `ethers.js`
- Deployment Tool: Hardhat
- Local Blockchain: Ganache (`http://127.0.0.1:7545`, `chainId: 1337`)

## Folder Structure

```text
.
|-- backend/
|   |-- config/
|   |   `-- loadEnv.js
|   |-- controllers/
|   |-- routes/
|   |-- services/
|   |   `-- blockchainService.js
|   |-- utils/
|   |-- .env
|   |-- contract-config.json
|   |-- db.js
|   `-- server.js
|-- blockchain/
|   |-- artifacts/
|   |-- cache/
|   |-- deploy-output.json
|   `-- scripts/
|       `-- deploy.js
|-- contract/
|   `-- CertificateRegistry.sol
|-- database/
|   |-- migrations/
|   `-- schema.sql
|-- frontend/
|   |-- src/
|   `-- package.json
|-- scripts/
|   `-- deploy.js
|-- .env
|-- .env.example
|-- hardhat.config.js
|-- package.json
`-- server.js
```

## Environment Variables

Root `.env` and `backend/.env` should contain:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
VERIFY_BASE_URL=http://localhost:5173/verify
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=certificate_management
GANACHE_RPC=http://127.0.0.1:7545
PRIVATE_KEY=ganache_private_key
CONTRACT_ADDRESS=
CHAIN_ID=1337
JWT_SECRET=replace_with_a_long_random_secret
CORS_ORIGIN=http://localhost:5173
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

## Ganache Installation

Install one of the following:

1. Ganache UI from Truffle Suite.
2. Ganache CLI:

```bash
npm install -g ganache
```

Start Ganache on the required RPC endpoint:

```bash
ganache --server.host 127.0.0.1 --server.port 7545 --chain.chainId 1337
```

Copy one Ganache account private key into `PRIVATE_KEY`.

## Database Setup

Create the schema:

```bash
mysql -u root -p < database/schema.sql
```

Apply any required migrations from `database/migrations/` for your existing dataset.

## Smart Contract

`contract/CertificateRegistry.sol` stores:

- `certificateHash`
- `certificateId`
- `studentName`
- `course`
- `issuerAddress`
- `issuedAt`

Supported functions:

- `issueCertificate()`
- `verifyCertificate()`
- `revokeCertificate()`

Events:

- `CertificateIssued`
- `CertificateRevoked`

## Hardhat Configuration

`hardhat.config.js` includes the Ganache network:

```js
networks: {
  ganache: {
    url: process.env.GANACHE_RPC,
    accounts: [process.env.PRIVATE_KEY],
    chainId: 1337
  }
}
```

## Deployment

Deploy the contract to Ganache:

```bash
npx hardhat run scripts/deploy.js --network ganache
```

The deploy script:

- deploys `CertificateRegistry`
- prints the deployed address
- writes ABI + address to `backend/contract-config.json`
- updates `backend/.env` with `CONTRACT_ADDRESS`

## Backend Blockchain Service

`backend/services/blockchainService.js` exposes:

- `issueCertificateOnChain()`
- `verifyCertificateOnChain()`
- `revokeCertificateOnChain()`

The backend connects to Ganache through `ethers.JsonRpcProvider(process.env.GANACHE_RPC)`.

## Certificate Flow

When an issuer creates a certificate:

1. Backend validates the request.
2. Backend generates a SHA256 certificate hash.
3. Backend stores the certificate and hash in MySQL.
4. Backend sends the hash and certificate metadata to Ganache using `issueCertificate()`.
5. Backend stores the blockchain transaction hash in MySQL.

Public verification API:

```http
GET /api/public/verify/:certificateId
```

The API:

- fetches the certificate from MySQL
- reads the certificate from Ganache
- compares the MySQL hash with the on-chain hash
- returns certificate status and blockchain verification details

## Run The Project

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Optional local blockchain setup:

```bash
ganache --server.host 127.0.0.1 --server.port 7545 --chain.chainId 1337
npx hardhat run scripts/deploy.js --network ganache
```

## Available Scripts

- `npm run compile`
- `npm run deploy`
- `npm run server`
- `npm run server:dev`
- `npm run client`
- `npm run client:build`
- `cd backend && npm run dev`
- `cd frontend && npm run dev`

## Notes

- Use Ganache accounts only.
- Do not use MetaMask.
- `backend/.env` is now read by the backend directly.
- Editing an existing certificate updates MySQL, but does not overwrite the original on-chain record for the same certificate ID.
Steps to Run Your Project (Important)
Step 0- Start Ganache First
npx hardhat run scripts/deploy.js --network ganache copy this command 

Step 1 — Start Backend

Open terminal in backend folder:

cd backend
npm install
npm run dev

Backend should run at:

http://localhost:5000

Test:

http://localhost:5000/api
Step 2 — Start Frontend

Open another terminal:

cd frontend
npm install
npm run dev

Frontend runs at:

http://localhost:5173
3️⃣ Start Cloudflare Tunnel

Install if not installed:

Windows

Download from:

https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

or use winget:

winget install Cloudflare.cloudflared
Start Tunnel
cloudflared tunnel --url http://localhost:5173
npx hardhat run scripts/deploy.js --network ganache

You will get a link like:

https://random-name.trycloudflare.com

Overall Percentage	Grade	Description
≥ 90%	A+	Outstanding
80% – 89.99%	A	Distinction / Excellent
70% – 79.99%	B+	First Class / Very Good
60% – 69.99%	B	Higher Second Class / Good
50% – 59.99%	C	Second Class / Satisfactory
40% – 49.99%	D	Pass
< 40%	F	Fail
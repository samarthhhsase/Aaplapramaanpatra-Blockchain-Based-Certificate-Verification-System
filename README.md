<<<<<<< HEAD
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

You will get a link like:

https://random-name.trycloudflare.com
=======
🚀 Certificate Management System

📌 Overview

The Certificate Management System is a full-stack web application designed to securely create, manage, and verify academic certificates.

This project integrates MERN stack with Blockchain technology (Ganache) to ensure tamper-proof certificate validation, enhancing trust and transparency.

✨ Key Features
🔐 Role-Based Access Control
Admin / Issuer / Student dashboards
📝 Certificate Lifecycle Management
Create, update, delete certificates
Add grades and remarks via modal interface
🔗 Blockchain Integration
Certificates can be verified securely
Local blockchain powered by Ganache
📊 Interactive Dashboard
Clean UI with responsive layout
Smooth navigation and scroll behavior
🔄 Seamless Frontend-Backend Connectivity
REST APIs using Axios
✅ Form Validation & UX Enhancements
Prevent empty inputs
Success toasts and animations
🧱 Tech Stack
🎨 Frontend
React.js
Tailwind CSS / CSS
Axios
⚙️ Backend
Node.js
Express.js
🗄️ Database
MongoDB (Mongoose)
⛓️ Blockchain
Ganache (Local Ethereum Blockchain)
Smart Contracts  Solidity
🔧 Tools & Utilities
Git & GitHub
VS Code
Postman

📂 Project Structure
project-root/
│
├── frontend/               # React frontend
│   ├── components/
│   ├── pages/
│   └── services/
│
├── backend/               # Express backend
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   └── config/
│
├── blockchain/            # Smart contracts & Ganache setup
│
├── .env
├── package.json
└── README.md
⚙️ Installation & Setup
1️⃣ Clone Repository
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
2️⃣ Setup Backend
cd backend
npm install
npm start
3️⃣ Setup Frontend
cd frontend
npm install
npm start
4️⃣ Setup Blockchain (Ganache)
Install and open Ganache
Start a local Ethereum workspace
Configure your project with:
RPC Server (e.g., http://127.0.0.1:7545)
Network ID from Ganache
Deploy smart contracts (if applicable)
🔗 System Architecture
Frontend (React UI)
        ↓
REST API (Node.js / Express)
        ↓
Database (MongoDB)
        ↓
Blockchain Layer (Ganache)
        ↑
Certificate Verification
🔐 Why Blockchain?
🛡️ Prevents certificate tampering
🔍 Enables transparent verification
📜 Creates immutable records


📊 Future Enhancements
🌐 Deploy blockchain on Ethereum Testnet
📄 Generate downloadable PDF certificates
📧 Email verification system
🔐 JWT-based authentication
📱 Mobile responsive optimization

🤝 Contributors
👨‍💻 Samarth Sase
👨‍💻 Sarvesh Khot
👩‍💻 Lavanya Devale

🏫 Institution
SMT. Indira Gandhi College of Engineering, Ghansoli, Navi Mumbai

📜 License

This project is licensed under the MIT License.

⭐ Support

If you found this project useful:

⭐ Star the repository
🍴 Fork it
🤝 Contribute
💡 Acknowledgment

🎤 Viva / Interview Explanation
📌 1. Project Introduction

“Our project is a Certificate Management System built using the MERN stack and integrated with Blockchain using Ganache.
It allows institutions to securely issue, manage, and verify student certificates while preventing tampering.”

🧱 2. Tech Stack Explanation

“We used:

React.js for frontend (UI & user interaction)
Node.js & Express.js for backend (API handling)
MySQL for storing certificate and user data
Ganache for local blockchain to ensure certificate authenticity”
🔗 3. Frontend-Backend Connectivity

“The frontend communicates with the backend using REST APIs.
We used Axios to send requests like:

GET → fetch certificates
POST → create certificate
PUT → update certificate
DELETE → remove certificate

The backend processes these requests and interacts with MongoDB.”

⛓️ 4. Blockchain (Ganache) Explanation

“We used Ganache, which is a local Ethereum blockchain, to simulate real blockchain behavior.

When a certificate is issued:

Its data (or hash) is stored on the blockchain
This makes it immutable and tamper-proof

During verification:

The system checks the blockchain record
If it matches, the certificate is valid”
🔐 5. Security Concept

“Security is achieved through:

Role-based access (Admin / Issuer / Student)
Backend validation
Blockchain immutability
Optional MetaMask integration for authentication”
⚙️ 6. Project Workflow

“The workflow is:

User logs into the system
Issuer creates a certificate
Data is stored in MongoDB
Hash is stored on blockchain (Ganache)
Student or verifier can verify authenticity using blockchain”
🎯 7. Why Blockchain?

“We used blockchain to:

Prevent certificate forgery
Ensure transparency
Maintain trust without relying on a single authority”
🚀 8. Challenges Faced

“Some challenges we faced:

Connecting frontend with blockchain
Managing API calls properly
Handling validations and UI responsiveness”
📈 9. Future Scope

“In future, we can:

Deploy on Ethereum Testnet
Add PDF certificate generation
Implement email verification
Add JWT authentication”
💡 10. One-Line Summary (VERY IMPORTANT)

“This project combines MERN stack with blockchain to create a secure, tamper-proof certificate management system.”
>>>>>>> 0ea3f3b67eaf981b96f06c48c7ddabf117b74a4c

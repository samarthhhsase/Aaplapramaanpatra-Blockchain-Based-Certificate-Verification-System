require('../config/loadEnv');

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const configPath = path.join(__dirname, '..', 'contract-config.json');
const rpcUrl = String(process.env.GANACHE_RPC || 'http://127.0.0.1:7545').trim();
const privateKey = String(process.env.PRIVATE_KEY || '').trim();
const expectedChainId = Number(process.env.CHAIN_ID || 1337);

let cachedConfig;
let cachedProvider;
let cachedSigner;
let cachedContract;
let blockchainReadyPromise;

function normalizeError(error, context) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${context}: ${message}`);
}

function getContractConfig() {
  if (!cachedConfig) {
    if (!fs.existsSync(configPath)) {
      throw new Error('contract-config.json not found. Deploy the contract first.');
    }

    cachedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  return cachedConfig;
}

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(rpcUrl);
  }

  return cachedProvider;
}

function getSigner() {
  if (!cachedSigner) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('PRIVATE_KEY must be a 32-byte hex string starting with 0x');
    }

    cachedSigner = new ethers.Wallet(privateKey, getProvider());
  }

  return cachedSigner;
}

function getContract() {
  if (!cachedContract) {
    const { abi, contractAddress: configAddress } = getContractConfig();
    const contractAddress = String(process.env.CONTRACT_ADDRESS || configAddress || '').trim();

    if (!ethers.isAddress(contractAddress)) {
      throw new Error(`CONTRACT_ADDRESS is invalid: ${contractAddress || '<empty>'}`);
    }

    cachedContract = new ethers.Contract(contractAddress, abi, getSigner());
  }

  return cachedContract;
}

async function ensureBlockchainReady() {
  if (!blockchainReadyPromise) {
    blockchainReadyPromise = (async () => {
      const provider = getProvider();
      const network = await provider.getNetwork();

      if (Number(network.chainId) !== expectedChainId) {
        throw new Error(
          `Connected to chainId ${Number(network.chainId)}, expected ${expectedChainId}. Check GANACHE_RPC and CHAIN_ID.`
        );
      }

      const contract = getContract();
      const contractAddress = await contract.getAddress();
      const signerAddress = getSigner().address;
      const balance = await provider.getBalance(signerAddress);
      const code = await provider.getCode(contractAddress);

      if (!code || code === '0x') {
        throw new Error(`No contract found at ${contractAddress}. Run the Ganache deploy command first.`);
      }

      console.info('[BLOCKCHAIN] ready', {
        rpcUrl,
        chainId: Number(network.chainId),
        contractAddress,
        signerAddress,
        signerBalanceWei: balance.toString(),
        configPath,
      });

      return { contractAddress, chainId: Number(network.chainId), signerAddress, signerBalanceWei: balance.toString() };
    })().catch((error) => {
      blockchainReadyPromise = null;
      throw normalizeError(error, 'Blockchain connection failed');
    });
  }

  return blockchainReadyPromise;
}

async function issueCertificateOnChain({ certificateHash, certificateId, studentName, course }) {
  try {
    const readyState = await ensureBlockchainReady();
    const contract = getContract();
    const provider = getProvider();
    const signerAddress = getSigner().address;
    const balance = await provider.getBalance(signerAddress);

    if (balance <= 0n) {
      throw new Error(`Signer ${signerAddress} has insufficient Ganache ETH balance`);
    }

    console.info('[BLOCKCHAIN] issuing certificate', {
      rpcUrl,
      configPath,
      contractAddress: readyState.contractAddress,
      signerAddress,
      signerBalanceWei: balance.toString(),
      certificateId,
      certificateHash,
      studentName,
      course,
    });

    const tx = await contract.issueCertificate(certificateHash, certificateId, studentName, course);
    const receipt = await tx.wait();

    console.info('[BLOCKCHAIN] issue confirmed', {
      certificateId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    });

    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    };
  } catch (error) {
    console.error('[BLOCKCHAIN] issue failed', {
      rpcUrl,
      configPath,
      certificateId,
      message: error.message,
      stack: error.stack,
    });
    throw normalizeError(error, `Failed to issue certificate ${certificateId} on Ganache`);
  }
}

async function verifyCertificateOnChain(certificateId) {
  try {
    await ensureBlockchainReady();
    const contract = getContract();
    const result = await contract.verifyCertificate(certificateId);

    return {
      certificateHash: result[0],
      certificateId: result[1],
      studentName: result[2],
      course: result[3],
      issuerAddress: result[4],
      issuedAt: Number(result[5]),
      revoked: result[6],
      exists: result[7],
    };
  } catch (error) {
    throw normalizeError(error, `Failed to verify certificate ${certificateId} on Ganache`);
  }
}

async function revokeCertificateOnChain(certificateId) {
  try {
    await ensureBlockchainReady();
    const contract = getContract();
    const tx = await contract.revokeCertificate(certificateId);
    const receipt = await tx.wait();

    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    throw normalizeError(error, `Failed to revoke certificate ${certificateId} on Ganache`);
  }
}

async function updateCertificateOnChain({ certificateId, certificateHash, studentName, course }) {
  try {
    await ensureBlockchainReady();
    const contract = getContract();

    if (typeof contract.updateCertificate !== 'function') {
      throw new Error('Deployed contract does not support certificate updates. Redeploy the upgraded contract.');
    }

    const tx = await contract.updateCertificate(certificateId, certificateHash, studentName, course);
    const receipt = await tx.wait();

    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    };
  } catch (error) {
    throw normalizeError(error, `Failed to update certificate ${certificateId} on Ganache`);
  }
}

module.exports = {
  ensureBlockchainReady,
  issueCertificateOnChain,
  verifyCertificateOnChain,
  revokeCertificateOnChain,
  updateCertificateOnChain,
  get contractAddress() {
    return String(process.env.CONTRACT_ADDRESS || getContractConfig().contractAddress || '').trim();
  },
  get signerAddress() {
    return getSigner().address;
  },
};

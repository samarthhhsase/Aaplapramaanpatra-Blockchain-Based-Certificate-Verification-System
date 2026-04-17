function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveVerifyBaseUrl() {
  const verifyBaseUrl = stripTrailingSlash(process.env.VERIFY_BASE_URL);

  if (!verifyBaseUrl) {
    throw new Error('Missing VERIFY_BASE_URL in backend/.env');
  }

  let parsed;
  try {
    parsed = new URL(verifyBaseUrl);
  } catch (error) {
    throw new Error(`Invalid VERIFY_BASE_URL: ${verifyBaseUrl}`);
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error(`Unsupported VERIFY_BASE_URL protocol: ${parsed.protocol}`);
  }

  return verifyBaseUrl;
}

function getCertificateVerificationUrl(certificateId) {
  const normalizedCertificateId = encodeURIComponent(String(certificateId || '').trim());
  const verificationUrl = `${resolveVerifyBaseUrl()}/${normalizedCertificateId}`;

  console.log('VERIFY_BASE_URL =', process.env.VERIFY_BASE_URL);
  console.log('QR URL =', verificationUrl);

  return verificationUrl;
}

module.exports = {
  getCertificateVerificationUrl,
  resolveVerifyBaseUrl,
};

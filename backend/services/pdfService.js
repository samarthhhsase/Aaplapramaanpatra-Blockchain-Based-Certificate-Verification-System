const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const QRCode = require('qrcode');
const { getCertificateVerificationUrl } = require('./verificationUrlService');

const COLORS = {
  page: '#fbf7ef',
  ink: '#2d2416',
  muted: '#6f624d',
  accent: '#8d6a2d',
  accentLight: '#d8bf87',
  accentDark: '#6a4f1e',
  panel: '#fffdf8',
  panelBorder: '#dbc89a',
  rule: '#e8ddc0',
  watermark: '#9f8250',
  valid: '#1f8f4a',
  revoked: '#bf2f2f',
  blockchain: '#255caa',
};

const FONT_FILES = {
  titleRegular: ['PlayfairDisplay-Regular.ttf', 'Cinzel-Regular.ttf'],
  titleBold: ['PlayfairDisplay-Bold.ttf', 'Cinzel-Bold.ttf'],
  bodyRegular: ['OpenSans-Regular.ttf', 'Roboto-Regular.ttf'],
  bodyBold: ['OpenSans-Bold.ttf', 'Roboto-Bold.ttf'],
  bodyItalic: ['OpenSans-Italic.ttf', 'Roboto-Italic.ttf'],
  script: ['GreatVibes-Regular.ttf', 'AlexBrush-Regular.ttf'],
};

function formatDate(dateValue) {
  if (!dateValue) {
    return '-';
  }

  return new Date(dateValue).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPercentage(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return `${Number(value).toFixed(2)}%`;
}

function valueOrDash(value) {
  return String(value || '').trim() || '-';
}

function pickExistingFile(candidates) {
  return candidates.find((filePath) => fs.existsSync(filePath)) || null;
}

function getAssetsDir() {
  return path.join(__dirname, '..', 'assets');
}

function getLogoAsset() {
  const assetsDir = getAssetsDir();
  return pickExistingFile([
    path.join(assetsDir, 'university-logo.png'),
    path.join(assetsDir, 'university-logo.jpg'),
    path.join(assetsDir, 'university-logo.jpeg'),
    path.join(assetsDir, 'university-logo.svg'),
  ]);
}

function getSignatureAsset() {
  const assetsDir = getAssetsDir();
  return pickExistingFile([
    path.join(assetsDir, 'signature.png'),
    path.join(assetsDir, 'signature.jpg'),
    path.join(assetsDir, 'signature.jpeg'),
  ]);
}

function registerFonts(doc) {
  const assetsDir = getAssetsDir();
  const resolvedFonts = {};

  Object.entries(FONT_FILES).forEach(([fontName, fileNames]) => {
    const fontPath = pickExistingFile(fileNames.map((fileName) => path.join(assetsDir, fileName)));
    if (fontPath) {
      doc.registerFont(fontName, fontPath);
      resolvedFonts[fontName] = fontName;
      return;
    }

    const fallbacks = {
      titleRegular: 'Times-Roman',
      titleBold: 'Times-Bold',
      bodyRegular: 'Helvetica',
      bodyBold: 'Helvetica-Bold',
      bodyItalic: 'Helvetica-Oblique',
      script: 'Times-Italic',
    };

    resolvedFonts[fontName] = fallbacks[fontName];
  });

  return resolvedFonts;
}

function getUniversityName(certificate) {
  return valueOrDash(certificate.university_name || process.env.UNIVERSITY_NAME || 'Sample University');
}

function getStatusBadgeConfig(statusValue) {
  const normalized = String(statusValue || '').trim().toLowerCase();

  if (normalized === 'revoked') {
    return {
      label: 'REVOKED',
      fill: '#fce8e8',
      stroke: COLORS.revoked,
      text: COLORS.revoked,
    };
  }

  if (normalized.includes('blockchain')) {
    return {
      label: 'VERIFIED ON BLOCKCHAIN',
      fill: '#eaf1ff',
      stroke: COLORS.blockchain,
      text: COLORS.blockchain,
    };
  }

  return {
    label: 'VALID',
    fill: '#e9f7ee',
    stroke: COLORS.valid,
    text: COLORS.valid,
  };
}

function resolveDisplayStatus(certificate) {
  if (String(certificate.status || '').trim().toLowerCase() === 'revoked') {
    return 'Revoked';
  }

  if (certificate.blockchain_tx_hash && valueOrDash(certificate.blockchain_tx_hash) !== 'Pending') {
    return 'Blockchain Verified';
  }

  return 'Valid';
}

function drawPageFrame(doc) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  doc.rect(0, 0, pageWidth, pageHeight).fill(COLORS.page);

  doc.save();
  doc.lineWidth(12).strokeColor('#efe4ca').roundedRect(18, 18, pageWidth - 36, pageHeight - 36, 18).stroke();
  doc.lineWidth(2.2).strokeColor(COLORS.accent).roundedRect(28, 28, pageWidth - 56, pageHeight - 56, 16).stroke();
  doc.lineWidth(0.9).strokeColor(COLORS.accentLight).roundedRect(38, 38, pageWidth - 76, pageHeight - 76, 12).stroke();
  doc.restore();

  doc.save();
  doc.strokeColor('#f1e7cf').lineWidth(0.6);
  doc.moveTo(68, 118).lineTo(pageWidth - 68, 118).stroke();
  doc.moveTo(68, pageHeight - 124).lineTo(pageWidth - 68, pageHeight - 124).stroke();
  doc.restore();
}

function drawCornerFlourish(doc, x, y, flipX = false) {
  const direction = flipX ? -1 : 1;
  doc.save();
  doc.strokeColor(COLORS.accentLight).lineWidth(1);
  doc.moveTo(x, y).bezierCurveTo(x + 24 * direction, y - 14, x + 42 * direction, y + 10, x + 62 * direction, y).stroke();
  doc.moveTo(x + 12 * direction, y + 12).bezierCurveTo(x + 32 * direction, y + 30, x + 54 * direction, y + 18, x + 72 * direction, y + 36).stroke();
  doc.restore();
}

function drawHeader(doc, certificate, fonts) {
  const universityName = getUniversityName(certificate);
  const logoPath = getLogoAsset();
  const topY = 52;
  const leftX = 56;

  if (logoPath) {
    if (logoPath.endsWith('.svg')) {
      const logoSvg = fs.readFileSync(logoPath, 'utf8');
      SVGtoPDF(doc, logoSvg, leftX, topY - 2, { width: 70, height: 70, preserveAspectRatio: 'xMinYMin meet' });
    } else {
      doc.image(logoPath, leftX, topY, { fit: [88, 72], align: 'left', valign: 'center' });
    }
  }

  const nameX = logoPath ? 136 : 58;
  const headerWidth = 430;

  doc.font(fonts.titleBold).fontSize(24).fillColor(COLORS.ink).text(universityName, nameX, topY + 6, {
    width: headerWidth,
    align: 'left',
  });
  doc.font(fonts.bodyRegular).fontSize(11.5).fillColor(COLORS.muted).text('Certificate Authority', nameX, topY + 36, {
    width: headerWidth,
    align: 'left',
  });
  doc.font(fonts.bodyBold).fontSize(10).fillColor(COLORS.accent).text('BLOCKCHAIN ENABLED CREDENTIAL RECORD', nameX, topY + 56, {
    width: headerWidth + 40,
    align: 'left',
  });

  const badge = getStatusBadgeConfig(resolveDisplayStatus(certificate));
  const badgeX = 626;
  const badgeY = 58;
  const badgeWidth = 150;
  const badgeHeight = 26;

  doc.save();
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 13).fillAndStroke(badge.fill, badge.stroke);
  doc.restore();
  doc.font(fonts.bodyBold).fontSize(9).fillColor(badge.text).text(badge.label, badgeX, badgeY + 8, {
    width: badgeWidth,
    align: 'center',
  });

  doc.font(fonts.bodyBold).fontSize(9.5).fillColor(COLORS.muted).text('Certificate No.', 620, 96);
  doc.font(fonts.bodyBold).fontSize(12).fillColor(COLORS.ink).text(valueOrDash(certificate.certificate_no), 620, 110, {
    width: 150,
    align: 'left',
  });

  drawCornerFlourish(doc, 66, 102, false);
  drawCornerFlourish(doc, 774, 102, true);
}

function drawWatermark(doc, certificate, fonts) {
  const logoPath = getLogoAsset();
  const centerX = doc.page.width / 2;
  const centerY = 286;

  doc.save();
  doc.opacity(0.1);

  if (logoPath && !logoPath.endsWith('.svg')) {
    doc.image(logoPath, centerX - 96, centerY - 96, {
      fit: [192, 192],
      align: 'center',
      valign: 'center',
    });
  } else if (logoPath && logoPath.endsWith('.svg')) {
    const logoSvg = fs.readFileSync(logoPath, 'utf8');
    SVGtoPDF(doc, logoSvg, centerX - 90, centerY - 90, { width: 180, height: 180, preserveAspectRatio: 'xMidYMid meet' });
  } else {
    doc.font(fonts.titleBold).fontSize(42).fillColor(COLORS.watermark).text(getUniversityName(certificate), centerX - 240, centerY - 14, {
      width: 480,
      align: 'center',
    });
  }

  doc.font(fonts.bodyBold).fontSize(16).fillColor(COLORS.watermark).text(getUniversityName(certificate).toUpperCase(), centerX - 240, centerY + 98, {
    width: 480,
    align: 'center',
  });
  doc.restore();
}

function drawTitleBlock(doc, certificate, fonts) {
  doc.font(fonts.bodyRegular).fontSize(13).fillColor(COLORS.muted).text('This professional certificate is proudly presented to', 0, 132, {
    align: 'center',
  });

  doc.font(fonts.titleBold).fontSize(30).fillColor(COLORS.ink).text(valueOrDash(certificate.student_name), 0, 160, {
    align: 'center',
  });

  doc.save();
  doc.strokeColor(COLORS.accentLight).lineWidth(1.1);
  doc.moveTo(234, 202).lineTo(doc.page.width - 234, 202).stroke();
  doc.restore();

  doc.font(fonts.bodyRegular).fontSize(13).fillColor(COLORS.muted).text('for successful completion of', 0, 214, {
    align: 'center',
  });

  doc.font(fonts.titleRegular).fontSize(24).fillColor(COLORS.accentDark).text(valueOrDash(certificate.course), 0, 240, {
    align: 'center',
  });

  doc.font(fonts.bodyRegular).fontSize(12.5).fillColor(COLORS.ink).text(
    `with grade ${valueOrDash(certificate.grade)}${certificate.overall_percentage !== null && certificate.overall_percentage !== undefined ? ` and an overall score of ${formatPercentage(certificate.overall_percentage)}` : ''}`,
    0,
    274,
    { align: 'center' }
  );
}

function drawInfoPanel(doc, title, x, y, width, height, fonts, lines) {
  doc.save();
  doc.roundedRect(x, y, width, height, 16).fill(COLORS.panel);
  doc.roundedRect(x, y, width, height, 16).lineWidth(1).strokeColor(COLORS.panelBorder).stroke();
  doc.restore();

  doc.font(fonts.bodyBold).fontSize(11).fillColor(COLORS.accent).text(title, x + 18, y + 14);

  let currentY = y + 38;
  lines.forEach(([label, value]) => {
    doc.font(fonts.bodyBold).fontSize(9.5).fillColor(COLORS.muted).text(label, x + 18, currentY);
    doc.font(fonts.bodyRegular).fontSize(11).fillColor(COLORS.ink).text(valueOrDash(value), x + 108, currentY, {
      width: width - 126,
      align: 'left',
    });
    currentY += 19;
  });
}

function drawDetailsSection(doc, certificate, fonts) {
  drawInfoPanel(doc, 'Academic Details', 62, 318, 358, 132, fonts, [
    ['Class', certificate.class],
    ['Student Type', certificate.student_type],
    ['Semester', certificate.semester],
    ['Roll No.', certificate.roll_no],
    ['Academic Year', certificate.academic_year || certificate.year],
  ]);

  drawInfoPanel(doc, 'Certificate Details', 434, 318, 344, 132, fonts, [
    ['Issue Date', formatDate(certificate.issue_date)],
    ['Issuer Name', certificate.issuer_name],
    ['Type', certificate.certificate_type],
    ['Status', resolveDisplayStatus(certificate)],
    ['IPFS Hash', certificate.ipfs_hash ? String(certificate.ipfs_hash).slice(0, 18) + '...' : '-'],
  ]);
}

function drawRemarks(doc, certificate, fonts) {
  doc.save();
  doc.roundedRect(62, 462, 356, 56, 14).fill(COLORS.panel);
  doc.roundedRect(62, 462, 356, 56, 14).lineWidth(1).strokeColor(COLORS.panelBorder).stroke();
  doc.restore();

  doc.font(fonts.bodyBold).fontSize(10.5).fillColor(COLORS.accent).text('Remarks', 78, 474);
  doc.font(fonts.bodyRegular).fontSize(9.8).fillColor(COLORS.ink).text(valueOrDash(certificate.remarks), 78, 490, {
    width: 324,
    height: 20,
  });
}

function drawGoldSeal(doc, fonts) {
  const sealX = 134;
  const sealY = 517;
  const outerRadius = 45;
  const innerRadius = 34;
  const coreRadius = 24;

  const gradient = doc.radialGradient(sealX, sealY, 8, sealX, sealY, outerRadius);
  gradient.stop(0, '#ffe7a4', 0.82);
  gradient.stop(0.55, '#d6aa40', 0.88);
  gradient.stop(1, '#8d6420', 0.92);

  doc.save();
  doc.circle(sealX, sealY, outerRadius).fill(gradient);
  doc.lineWidth(2).strokeColor('#f6e1a7').circle(sealX, sealY, outerRadius - 3).stroke();
  doc.lineWidth(1.2).strokeColor('#b4862c').circle(sealX, sealY, innerRadius).stroke();
  doc.lineWidth(1).strokeColor('#f3d888').circle(sealX, sealY, coreRadius).stroke();
  doc.opacity(0.22).fillColor('#fff8dd').circle(sealX - 10, sealY - 12, 11).fill();
  doc.opacity(1);
  doc.restore();

  doc.font(fonts.bodyBold).fontSize(7.8).fillColor('#fff9ea').text('OFFICIAL', sealX - 24, sealY - 18, {
    width: 48,
    align: 'center',
  });
  doc.text('CERTIFICATE', sealX - 31, sealY - 8, {
    width: 62,
    align: 'center',
  });
  doc.text('BLOCKCHAIN', sealX - 29, sealY + 10, {
    width: 58,
    align: 'center',
  });
  doc.text('VERIFIED', sealX - 22, sealY + 20, {
    width: 44,
    align: 'center',
  });
}

function drawSignatureSection(doc, certificate, fonts) {
  const signaturePath = getSignatureAsset();
  const baseY = 506;
  const sigX = 270;
  const lineY = 544;
  const lineWidth = 180;

  if (signaturePath) {
    doc.image(signaturePath, sigX + 12, baseY - 18, {
      fit: [128, 52],
      align: 'left',
      valign: 'center',
    });
  } else {
    doc.font(fonts.script).fontSize(26).fillColor(COLORS.ink).text(valueOrDash(certificate.issuer_name), sigX + 4, baseY, {
      width: lineWidth,
      align: 'center',
    });
  }

  doc.save();
  doc.strokeColor(COLORS.accentDark).lineWidth(1);
  doc.moveTo(sigX, lineY).lineTo(sigX + lineWidth, lineY).stroke();
  doc.restore();

  doc.font(fonts.bodyBold).fontSize(10.5).fillColor(COLORS.ink).text('Authorized Issuer', sigX, lineY + 8, {
    width: lineWidth,
    align: 'center',
  });
  doc.font(fonts.bodyRegular).fontSize(9.5).fillColor(COLORS.muted).text(`Issuer Name: ${valueOrDash(certificate.issuer_name)}`, sigX, lineY + 23, {
    width: lineWidth,
    align: 'center',
  });
}

function drawVerificationSection(doc, verificationUrl, qrBuffer, fonts) {
  const boxX = 608;
  const boxY = 446;
  const boxWidth = 170;
  const boxHeight = 118;

  doc.save();
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 16).fill('#f8f3e8');
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 16).lineWidth(1).strokeColor(COLORS.panelBorder).stroke();
  doc.restore();

  if (qrBuffer) {
    doc.image(qrBuffer, boxX + 14, boxY + 10, { fit: [88, 88], align: 'center', valign: 'center' });
  } else {
    doc.font(fonts.bodyItalic).fontSize(9).fillColor(COLORS.muted).text('QR unavailable', boxX + 16, boxY + 38, {
      width: 88,
      align: 'center',
    });
  }

  doc.font(fonts.bodyBold).fontSize(9.2).fillColor(COLORS.ink).text('Scan to verify certificate authenticity', boxX + 96, boxY + 22, {
    width: 58,
    align: 'left',
  });
  doc.font(fonts.bodyRegular).fontSize(7.3).fillColor(COLORS.muted).text(verificationUrl, boxX + 96, boxY + 66, {
    width: 58,
    height: 34,
  });
}

function drawTechnicalSection(doc, certificate, fonts) {
  const baseY = 566;

  doc.font(fonts.bodyBold).fontSize(8.5).fillColor(COLORS.muted).text('Blockchain Record', 434, baseY);
  doc.font('Courier').fontSize(7.2).fillColor(COLORS.ink).text(
    `Certificate Hash: ${valueOrDash(certificate.certificate_hash)}`,
    434,
    baseY + 12,
    { width: 320 }
  );
  doc.text(
    `Transaction Hash: ${valueOrDash(certificate.blockchain_tx_hash)}`,
    434,
    baseY + 24,
    { width: 320 }
  );
}

function drawSubjectsPage(doc, certificate, subjects, fonts) {
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 26 });
  drawPageFrame(doc);
  drawCornerFlourish(doc, 66, 102, false);
  drawCornerFlourish(doc, 774, 102, true);

  doc.font(fonts.titleBold).fontSize(24).fillColor(COLORS.ink).text('Subject-wise Marks Statement', 0, 54, {
    align: 'center',
  });
  doc.font(fonts.bodyRegular).fontSize(11).fillColor(COLORS.muted).text(
    `${valueOrDash(certificate.student_name)} | ${valueOrDash(certificate.course)} | Certificate No: ${valueOrDash(certificate.certificate_no)}`,
    0,
    86,
    { align: 'center' }
  );

  const tableX = 58;
  const tableY = 130;
  const tableWidth = 726;
  const columns = [
    { title: 'Subject', key: 'subject_name', width: 344 },
    { title: 'Marks Scored', key: 'marks_scored', width: 124 },
    { title: 'Out Of', key: 'out_of', width: 108 },
    { title: 'Percentage', key: 'subject_percentage', width: 150 },
  ];

  const drawTableHeader = (headerY) => {
    doc.save();
    doc.roundedRect(tableX, headerY, tableWidth, 34, 10).fill('#efe6d1');
    doc.restore();

    let currentX = tableX + 14;
    doc.font(fonts.bodyBold).fontSize(10.5).fillColor(COLORS.ink);
    columns.forEach((column) => {
      doc.text(column.title, currentX, headerY + 11, { width: column.width - 16 });
      currentX += column.width;
    });
  };

  drawTableHeader(tableY);

  let currentY = tableY + 42;
  subjects.forEach((subject, index) => {
    if (currentY > 520) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 26 });
      drawPageFrame(doc);
      currentY = 72;
      drawTableHeader(currentY);
      currentY += 42;
    }

    doc.save();
    doc.roundedRect(tableX, currentY - 6, tableWidth, 30, 8).fill(index % 2 === 0 ? '#fffdfa' : '#f7f0e2');
    doc.roundedRect(tableX, currentY - 6, tableWidth, 30, 8).lineWidth(0.7).strokeColor(COLORS.panelBorder).stroke();
    doc.restore();

    let rowX = tableX + 14;
    doc.font(fonts.bodyRegular).fontSize(10.4).fillColor(COLORS.ink).text(valueOrDash(subject.subject_name), rowX, currentY + 4, {
      width: columns[0].width - 18,
    });
    rowX += columns[0].width;
    doc.text(String(subject.marks_scored), rowX, currentY + 4, { width: columns[1].width - 18 });
    rowX += columns[1].width;
    doc.text(String(subject.out_of), rowX, currentY + 4, { width: columns[2].width - 18 });
    rowX += columns[2].width;
    doc.text(formatPercentage(subject.subject_percentage), rowX, currentY + 4, { width: columns[3].width - 18 });
    currentY += 38;
  });
}

async function buildCertificatePdf(certificate) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 26 });
  const chunks = [];
  const fonts = registerFonts(doc);

  const outputPromise = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const certificateIdentifier = certificate.certificate_no || certificate.certificate_id || certificate.id;
  const verificationUrl = await getCertificateVerificationUrl(certificateIdentifier);
  const subjects = Array.isArray(certificate.subjects) ? certificate.subjects : [];

  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(verificationUrl, {
      type: 'png',
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#2d2416',
        light: '#FFFFFFFF',
      },
    });
  } catch (error) {
    console.warn('[PDF] Failed to generate certificate QR:', error.message);
    qrBuffer = null;
  }

  drawPageFrame(doc);
  drawWatermark(doc, certificate, fonts);
  drawHeader(doc, certificate, fonts);
  drawTitleBlock(doc, certificate, fonts);
  drawDetailsSection(doc, certificate, fonts);
  drawRemarks(doc, certificate, fonts);
  drawGoldSeal(doc, fonts);
  drawSignatureSection(doc, certificate, fonts);
  drawVerificationSection(doc, verificationUrl, qrBuffer, fonts);
  drawTechnicalSection(doc, certificate, fonts);

  if (subjects.length > 0) {
    drawSubjectsPage(doc, certificate, subjects, fonts);
  }

  doc.end();
  return outputPromise;
}

module.exports = { buildCertificatePdf };

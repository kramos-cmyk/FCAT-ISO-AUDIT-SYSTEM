import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { FO_RI_05_META, WHY_FACTORS } from './constants.js';
import { isValidEvidenceUrl, parseJsonArray, parseWhyFactors } from './security.js';
import type { CarRecord } from './types.js';

function resolveSchoolLogoPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'public/fcat-logo.png'),
    path.resolve(process.cwd(), 'dist/fcat-logo.png'),
    path.resolve(process.cwd(), 'public/assets/aistudio/FCAT_LOGO_241e496f.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function formatDateText(raw: string | undefined | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

function evidenceLabel(url: string, idx: number): string {
  try {
    const clean = url.split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length <= 24) return decodeURIComponent(last);
  } catch {
    // ignore decode issues
  }
  return `Evidence ${idx + 1}`;
}

export async function generateCarPdfBuffer(
  rec: CarRecord,
  _company: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const HEADER_X = 42;
    const HEADER_Y = 34;
    const TOP_ROW_H = 62;
    const BOT_ROW_H = 30;
    const HEADER_BOTTOM = HEADER_Y + TOP_ROW_H + BOT_ROW_H + 10; // 136
    const BOTTOM_LIMIT = 750; // Letter height 792 - 42 bottom margin

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: HEADER_BOTTOM, bottom: 42, left: 42, right: 42 },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const BORDER = '#111111';
    const GRAY_BAR = '#CCCCCC';
    const TEXT = '#000000';
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right; // 528

    const logoPath = resolveSchoolLogoPath();
    const COL_LOGO_W = 112;
    const COL_META_W = 152;
    const COL_TITLE_W = pageWidth - COL_LOGO_W - COL_META_W;
    const COL_GROUP_W = 178;
    const COL_EFF_W = pageWidth - COL_GROUP_W - COL_META_W;
    const META_X = HEADER_X + pageWidth - COL_META_W;
    const META_SPLIT_X = META_X + COL_META_W / 2;

    const drawHeader = (pageNum: number, totalPages: number) => {
      const x = HEADER_X;
      const y = HEADER_Y;
      const totalH = TOP_ROW_H + BOT_ROW_H;
      const midY = y + TOP_ROW_H / 2;
      const botY = y + TOP_ROW_H;

      doc.save();
      doc.rect(x, y, pageWidth, totalH).fill('#FFFFFF');
      doc.strokeColor(BORDER).lineWidth(0.9);
      doc.rect(x, y, pageWidth, totalH).stroke();

      // Horizontal dividers
      doc.moveTo(x, botY).lineTo(x + pageWidth, botY).stroke();
      doc.moveTo(META_X, midY).lineTo(x + pageWidth, midY).stroke();

      // Vertical solid dividers
      doc.moveTo(x + COL_LOGO_W, y).lineTo(x + COL_LOGO_W, botY).stroke();
      doc.moveTo(META_X, y).lineTo(META_X, y + totalH).stroke();
      doc.moveTo(x + COL_GROUP_W, botY).lineTo(x + COL_GROUP_W, y + totalH).stroke();

      // Vertical dotted dividers inside metadata & page number column
      doc.save();
      doc.dash(1.2, { space: 2 }).lineWidth(0.75).strokeColor('#222222');
      doc.moveTo(META_SPLIT_X, y).lineTo(META_SPLIT_X, y + totalH).stroke();
      doc.restore();

      // School logo centered in top-left box
      if (logoPath) {
        try {
          const imgSize = 52;
          doc.image(logoPath, x + (COL_LOGO_W - imgSize) / 2, y + (TOP_ROW_H - imgSize) / 2, {
            fit: [imgSize, imgSize],
            align: 'center',
            valign: 'center',
          });
        } catch {
          // Ignore image decode fallback
        }
      }

      // Title centered in top-middle box
      doc
        .fillColor(TEXT)
        .font('Times-Bold')
        .fontSize(12.5)
        .text('CORRECTIVE ACTION REPORT', x + COL_LOGO_W + 6, y + 24, {
          width: COL_TITLE_W - 12,
          align: 'center',
          lineBreak: false,
        });

      // Top-right metadata labels & values
      doc
        .fillColor(TEXT)
        .font('Times-Bold')
        .fontSize(9.5)
        .text('Document', META_X + 6, y + 5, { width: COL_META_W / 2 - 10, lineBreak: false })
        .text('Code', META_X + 6, y + 16, { width: COL_META_W / 2 - 10, lineBreak: false });
      doc
        .font('Times-Roman')
        .fontSize(9.5)
        .text(FO_RI_05_META.docCode, META_SPLIT_X + 6, y + 11, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        });

      doc
        .font('Times-Bold')
        .fontSize(9.5)
        .text('Rev. No.', META_X + 6, midY + 10, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        });
      doc
        .font('Times-Roman')
        .fontSize(9.5)
        .text(FO_RI_05_META.revNo, META_SPLIT_X + 6, midY + 10, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        });

      // Bottom-left Process Group / Department
      doc
        .font('Times-Roman')
        .fontSize(8.8)
        .text('Process Group/Department:', x + 6, botY + 4, {
          width: COL_GROUP_W - 12,
          lineBreak: false,
        });
      doc
        .font('Times-Bold')
        .fontSize(9.5)
        .text(FO_RI_05_META.processGroup, x + 6, botY + 16, {
          width: COL_GROUP_W - 12,
          lineBreak: false,
        });

      // Bottom-middle Effectivity Date
      doc
        .font('Times-Roman')
        .fontSize(9.5)
        .text('Effectivity Date: ', x + COL_GROUP_W + 8, botY + 10, {
          width: COL_EFF_W - 16,
          continued: true,
          lineBreak: false,
        })
        .font('Times-Bold')
        .text(FO_RI_05_META.effectivityDate, { lineBreak: false });

      // Bottom-right Page No. label and Page X of Y value
      doc
        .font('Times-Bold')
        .fontSize(9.5)
        .text('Page No.', META_X + 6, botY + 10, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        });
      doc
        .font('Times-Roman')
        .fontSize(9.5)
        .text(`Page ${pageNum} of ${totalPages}`, META_SPLIT_X + 6, botY + 10, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        });

      doc.restore();
    };

    const drawCheckbox = (x: number, y: number, checked: boolean, label: string, maxLabelW = 170) => {
      const boxSize = 10;
      doc.save();
      doc.strokeColor(BORDER).lineWidth(0.9).rect(x, y, boxSize, boxSize).stroke();
      if (checked) {
        doc
          .lineWidth(1.3)
          .strokeColor(TEXT)
          .moveTo(x + 2, y + 5.2)
          .lineTo(x + 4.3, y + 7.8)
          .lineTo(x + 8.3, y + 2.2)
          .stroke();
      }
      doc
        .fillColor(TEXT)
        .font('Times-Roman')
        .fontSize(9.5)
        .text(label, x + boxSize + 7, y + 0.5, { width: maxLabelW, lineBreak: false });
      doc.restore();
    };

    const drawBox = (x: number, y: number, w: number, h: number, fill?: string) => {
      doc.save();
      if (fill) {
        doc.rect(x, y, w, h).fillAndStroke(fill, BORDER);
      } else {
        doc.strokeColor(BORDER).lineWidth(0.85).rect(x, y, w, h).stroke();
      }
      doc.restore();
    };

    const drawCenteredText = (
      text: string,
      x: number,
      y: number,
      w: number,
      h: number,
      font: 'Times-Bold' | 'Times-Roman' = 'Times-Bold',
      fontSize = 9.5
    ) => {
      doc.save();
      doc.fillColor(TEXT).font(font).fontSize(fontSize);
      const th = doc.heightOfString(text, { width: w - 8, align: 'center' });
      const ty = y + Math.max(3, (h - th) / 2);
      doc.text(text, x + 4, ty, { width: w - 8, align: 'center' });
      doc.restore();
    };

    const drawGrayBanner = (y: number, h: number, text: string) => {
      drawBox(HEADER_X, y, pageWidth, h, GRAY_BAR);
      drawCenteredText(text, HEADER_X, y, pageWidth, h, 'Times-Bold', 9.5);
    };

    // =========================================================================
    // PAGE 1: FINDING DETAILS & CORRECTION (IMMEDIATE ACTION TAKEN)
    // =========================================================================
    let y = HEADER_BOTTOM;

    // Row 1: Source of Incident or Nonconformity | CAR No / Date Issued
    const R1_H = 74;
    const R1_LEFT_W = 398;
    const R1_RIGHT_W = pageWidth - R1_LEFT_W; // 130
    const R1_RIGHT_X = HEADER_X + R1_LEFT_W;
    const R1_CAR_H = 26;

    drawBox(HEADER_X, y, R1_LEFT_W, R1_H);
    drawBox(R1_RIGHT_X, y, R1_RIGHT_W, R1_CAR_H);
    drawBox(R1_RIGHT_X, y + R1_CAR_H, R1_RIGHT_W, R1_H - R1_CAR_H);

    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Source of Incident or Nonconformity', HEADER_X + 6, y + 5, { width: R1_LEFT_W - 12 });

    const srcLower = String(rec.Source || '').trim().toLowerCase();
    const knownSources = [
      'internal audit',
      'external audit',
      'customer complaint',
      'unmet kpis',
      'nonconforming output/services',
    ];
    const isKnownSource = knownSources.includes(srcLower);

    drawCheckbox(HEADER_X + 16, y + 22, srcLower === 'internal audit', 'Internal Audit');
    drawCheckbox(HEADER_X + 16, y + 39, srcLower === 'external audit', 'External Audit');
    drawCheckbox(HEADER_X + 16, y + 56, srcLower === 'customer complaint', 'Customer Complaint');

    drawCheckbox(HEADER_X + 198, y + 22, srcLower === 'unmet kpis', 'Unmet KPIs');
    drawCheckbox(
      HEADER_X + 198,
      y + 39,
      srcLower === 'nonconforming output/services',
      'Nonconforming Output/Services',
      190
    );
    drawCheckbox(
      HEADER_X + 198,
      y + 56,
      srcLower === 'others' || (Boolean(srcLower) && !isKnownSource),
      srcLower && !isKnownSource && srcLower !== 'others' ? `Others: ${rec.Source}` : 'Others',
      190
    );

    // CAR No & Date Issued
    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('CAR No: ', R1_RIGHT_X + 6, y + 7, { width: R1_RIGHT_W - 12, continued: true })
      .font('Times-Roman')
      .text(rec.CARNo || '');

    doc
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Date Issued:', R1_RIGHT_X + 6, y + R1_CAR_H + 6, { width: R1_RIGHT_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9.5)
      .text(formatDateText(rec.DateIssued), R1_RIGHT_X + 6, y + R1_CAR_H + 21, {
        width: R1_RIGHT_W - 12,
      });

    y += R1_H;

    // Row 2: Department / Type of Findings | Company Document / ISO 9001 Clause | Details
    const C1_W = 180;
    const C2_W = 90;
    const C3_W = pageWidth - C1_W - C2_W; // 258
    const C2_X = HEADER_X + C1_W;
    const C3_X = C2_X + C2_W;

    const deptValH = doc.font('Times-Roman').fontSize(9).heightOfString(rec.Department || '', { width: C1_W - 12 });
    const compValH = doc
      .font('Times-Roman')
      .fontSize(9)
      .heightOfString(rec.CompanyDocument || '', { width: C2_W - 12 });
    const topSubH = Math.max(46, 22 + deptValH + 8, 32 + compValH + 8);

    const isoValH = doc.font('Times-Roman').fontSize(9).heightOfString(rec.ISOClause || '', { width: C2_W - 12 });
    const botSubH = Math.max(54, 22 + isoValH + 8);

    const detailsValH = doc
      .font('Times-Roman')
      .fontSize(9)
      .heightOfString(rec.Details || '', { width: C3_W - 12 });
    const R2_TOTAL_H = Math.max(topSubH + botSubH, 24 + detailsValH + 10);
    const actualBotSubH = R2_TOTAL_H - topSubH;

    drawBox(HEADER_X, y, C1_W, topSubH);
    drawBox(HEADER_X, y + topSubH, C1_W, actualBotSubH);
    drawBox(C2_X, y, C2_W, topSubH);
    drawBox(C2_X, y + topSubH, C2_W, actualBotSubH);
    drawBox(C3_X, y, C3_W, R2_TOTAL_H);

    // Col 1 Top: Department:/Process:
    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Department:/Process:', HEADER_X + 6, y + 5, { width: C1_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9)
      .text(rec.Department || '', HEADER_X + 6, y + 20, { width: C1_W - 12 });

    // Col 1 Bottom: Type of Findings: [ ] NC  [ ] OFI
    const typeLower = String(rec.Type || '').trim().toLowerCase();
    const isNC = typeLower === 'nc' || typeLower.includes('(nc)') || typeLower.includes('nonconformity');
    const isOFI = typeLower === 'ofi' || typeLower.includes('(ofi)') || typeLower.includes('opportunity');

    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Type of Findings:', HEADER_X + 6, y + topSubH + 6, { width: C1_W - 12 });
    drawCheckbox(HEADER_X + 14, y + topSubH + 25, isNC, 'NC', 50);
    drawCheckbox(HEADER_X + 86, y + topSubH + 25, isOFI, 'OFI', 50);

    // Col 2 Top: Company Document:
    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Company', C2_X + 6, y + 5, { width: C2_W - 12 })
      .text('Document:', C2_X + 6, y + 16, { width: C2_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9)
      .text(rec.CompanyDocument || '', C2_X + 6, y + 29, { width: C2_W - 12 });

    // Col 2 Bottom: ISO 9001 Clause:
    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('ISO 9001 Clause:', C2_X + 6, y + topSubH + 6, { width: C2_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9)
      .text(rec.ISOClause || '', C2_X + 6, y + topSubH + 21, { width: C2_W - 12 });

    // Col 3: Details of Incident or Nonconformity
    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Details of Incident or Nonconformity', C3_X + 6, y + 5, { width: C3_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9)
      .text(rec.Details || '', C3_X + 6, y + 20, { width: C3_W - 12 });

    y += R2_TOTAL_H;

    // Row 3: Initiated By/Date | Received by/Date
    const R3_LEFT_W = C1_W; // aligned with Col 1 divider
    const R3_RIGHT_W = pageWidth - R3_LEFT_W;
    const initiatedText = [rec.RaisedBy, formatDateText(rec.DateIssued)].filter(Boolean).join(' / ');
    const receivedName = rec.EmployeeName && rec.EmployeeName !== '(Unassigned)' ? rec.EmployeeName : '';
    const receivedDate = formatDateText(rec.PreparedDate);
    const receivedText = [receivedName, receivedDate].filter(Boolean).join(' / ');

    const initH = doc.font('Times-Roman').fontSize(9).heightOfString(initiatedText, { width: R3_LEFT_W - 12 });
    const recvH = doc.font('Times-Roman').fontSize(9).heightOfString(receivedText, { width: R3_RIGHT_W - 12 });
    const R3_H = Math.max(40, 22 + Math.max(initH, recvH) + 8);

    drawBox(HEADER_X, y, R3_LEFT_W, R3_H);
    drawBox(HEADER_X + R3_LEFT_W, y, R3_RIGHT_W, R3_H);

    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Initiated By/Date:', HEADER_X + 6, y + 5, { width: R3_LEFT_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9)
      .text(initiatedText, HEADER_X + 6, y + 20, { width: R3_LEFT_W - 12 });

    doc
      .fillColor(TEXT)
      .font('Times-Bold')
      .fontSize(9.5)
      .text('Received by/Date:', HEADER_X + R3_LEFT_W + 6, y + 5, { width: R3_RIGHT_W - 12 });
    doc
      .font('Times-Roman')
      .fontSize(9)
      .text(receivedText, HEADER_X + R3_LEFT_W + 6, y + 20, { width: R3_RIGHT_W - 12 });

    y += R3_H;

    // Row 4: Gray Banner - To be filled out by the Process Owner
    const BANNER_H = 20;
    drawGrayBanner(y, BANNER_H, 'To be filled out by the Process Owner');
    y += BANNER_H;

    // Row 5+: Correction Table
    const CORR_COLS = [214, 84, 102, 128]; // sum = 528
    const CORR_HEADERS = ['Correction (Immediate Action Taken)', 'Date Completed', 'Person In-Charge', 'Result'];
    const CORR_HDR_H = 22;

    const drawCorrectionHeader = (atY: number) => {
      let cx = HEADER_X;
      CORR_HEADERS.forEach((h, i) => {
        drawBox(cx, atY, CORR_COLS[i], CORR_HDR_H);
        drawCenteredText(h, cx, atY, CORR_COLS[i], CORR_HDR_H, 'Times-Bold', 9.2);
        cx += CORR_COLS[i];
      });
      return atY + CORR_HDR_H;
    };

    y = drawCorrectionHeader(y);

    let corrections = parseJsonArray<Record<string, string>>(rec.CorrectionEntries);
    if (corrections.length === 0 && (rec.Correction || rec.DateCompleted || rec.PersonInCharge || rec.Result)) {
      corrections = [
        {
          Correction: rec.Correction || '',
          DateCompleted: rec.DateCompleted || '',
          PersonInCharge: rec.PersonInCharge || '',
          Result: rec.Result || '',
        },
      ];
    }

    const paddedCorrections: Array<[string, string, string, string]> = corrections.map((c) => [
      c.Correction || '',
      formatDateText(c.DateCompleted),
      c.PersonInCharge || '',
      c.Result || '',
    ]);
    while (paddedCorrections.length < 2) {
      paddedCorrections.push(['', '', '', '']);
    }

    const remainingPage1 = Math.max(120, BOTTOM_LIMIT - y - 4);
    const defaultCorrRowH = Math.max(76, Math.floor(remainingPage1 / paddedCorrections.length));

    paddedCorrections.forEach((row) => {
      const cellHeights = row.map((cell, i) =>
        doc.font('Times-Roman').fontSize(9).heightOfString(cell || '', { width: CORR_COLS[i] - 10 })
      );
      const rowH = Math.max(defaultCorrRowH, ...cellHeights.map((h) => h + 14));
      if (y + rowH > BOTTOM_LIMIT) {
        doc.addPage();
        y = HEADER_BOTTOM;
        y = drawCorrectionHeader(y);
      }
      let cx = HEADER_X;
      row.forEach((cell, i) => {
        drawBox(cx, y, CORR_COLS[i], rowH);
        if (cell) {
          doc
            .fillColor(TEXT)
            .font('Times-Roman')
            .fontSize(9)
            .text(cell, cx + 6, y + 7, {
              width: CORR_COLS[i] - 12,
              align: i === 1 ? 'center' : 'left',
            });
        }
        cx += CORR_COLS[i];
      });
      y += rowH;
    });

    // =========================================================================
    // PAGE 2: ROOT CAUSE ANALYSIS (5 WHYS MATRIX)
    // =========================================================================
    doc.addPage();
    y = HEADER_BOTTOM;

    const RCA_COLS = [84, 88.8, 88.8, 88.8, 88.8, 88.8]; // sum = 528
    const RCA_TITLE_H = 22;
    const RCA_HDR_H = 22;

    const drawRcaHeader = (atY: number) => {
      drawBox(HEADER_X, atY, pageWidth, RCA_TITLE_H);
      drawCenteredText('Root Cause Analysis', HEADER_X, atY, pageWidth, RCA_TITLE_H, 'Times-Bold', 10);
      const hdrY = atY + RCA_TITLE_H;
      const rcaHeaders = ['Factors', 'Why 1?', 'Why 2?', 'Why 3?', 'Why 4?', 'Why 5?'];
      let cx = HEADER_X;
      rcaHeaders.forEach((h, i) => {
        drawBox(cx, hdrY, RCA_COLS[i], RCA_HDR_H);
        drawCenteredText(h, cx, hdrY, RCA_COLS[i], RCA_HDR_H, 'Times-Bold', 9.5);
        cx += RCA_COLS[i];
      });
      return hdrY + RCA_HDR_H;
    };

    y = drawRcaHeader(y);

    const whys = parseWhyFactors(rec.RootCauseFactors);
    const availRcaH = Math.max(400, BOTTOM_LIMIT - y - 4);
    const defaultFactorH = Math.floor(availRcaH / WHY_FACTORS.length);

    WHY_FACTORS.forEach((factor) => {
      const cells = whys[factor] || ['', '', '', '', ''];
      const rowTexts = [factor, cells[0] || '', cells[1] || '', cells[2] || '', cells[3] || '', cells[4] || ''];
      const cellHeights = rowTexts.map((t, i) =>
        doc
          .font(i === 0 ? 'Times-Bold' : 'Times-Roman')
          .fontSize(i === 0 ? 9.5 : 8.8)
          .heightOfString(t, { width: RCA_COLS[i] - 10 })
      );
      const rowH = Math.max(defaultFactorH, ...cellHeights.map((h) => h + 14));
      if (y + rowH > BOTTOM_LIMIT) {
        doc.addPage();
        y = HEADER_BOTTOM;
        y = drawRcaHeader(y);
      }

      let cx = HEADER_X;
      rowTexts.forEach((cell, i) => {
        drawBox(cx, y, RCA_COLS[i], rowH);
        if (i === 0) {
          drawCenteredText(cell, cx, y, RCA_COLS[i], rowH, 'Times-Bold', 9.5);
        } else if (cell) {
          doc
            .fillColor(TEXT)
            .font('Times-Roman')
            .fontSize(8.8)
            .text(cell, cx + 5, y + 6, { width: RCA_COLS[i] - 10 });
        }
        cx += RCA_COLS[i];
      });
      y += rowH;
    });

    // =========================================================================
    // PAGE 3: POSSIBLE ROOT CAUSE, CORRECTIVE ACTION, SIGN-OFFS, AUDITOR F-UP
    // =========================================================================
    doc.addPage();
    y = HEADER_BOTTOM;

    // 3A. Possible Root Cause/s | Validation Method | Date | Results of Validation
    const PRC_COLS = [168, 168, 68, 124]; // sum = 528
    const PRC_HDR_H = 22;
    const prcHeaders = ['Possible Root Cause/s', 'Validation Method', 'Date', 'Results of Validation'];
    let px = HEADER_X;
    prcHeaders.forEach((h, i) => {
      drawBox(px, y, PRC_COLS[i], PRC_HDR_H);
      drawCenteredText(h, px, y, PRC_COLS[i], PRC_HDR_H, 'Times-Bold', 9.2);
      px += PRC_COLS[i];
    });
    y += PRC_HDR_H;

    let rootCauses = parseJsonArray<string>(rec.PossibleRootCauseEntries);
    if (rootCauses.length === 0 && rec.PossibleRootCause) rootCauses = [rec.PossibleRootCause];
    const rcText = rootCauses.length > 1 ? rootCauses.map((r) => `• ${r}`).join('\n') : rootCauses[0] || '';
    const prcVals = [
      rcText,
      rec.ValidationMethod || '',
      formatDateText(rec.ValidationDate),
      rec.ValidationResult || '',
    ];
    const prcHeights = prcVals.map((v, i) =>
      doc.font('Times-Roman').fontSize(9).heightOfString(v, { width: PRC_COLS[i] - 10 })
    );
    const PRC_BODY_H = Math.max(66, ...prcHeights.map((h) => h + 14));

    px = HEADER_X;
    prcVals.forEach((v, i) => {
      drawBox(px, y, PRC_COLS[i], PRC_BODY_H);
      if (v) {
        doc
          .fillColor(TEXT)
          .font('Times-Roman')
          .fontSize(9)
          .text(v, px + 5, y + 6, {
            width: PRC_COLS[i] - 10,
            align: i === 2 ? 'center' : 'left',
          });
      }
      px += PRC_COLS[i];
    });
    y += PRC_BODY_H;

    // 3B. True Root Cause | Corrective Action: | Person In-Charge/ Target Date | Evidence/ Record | Date Implemented
    const CA_COLS = [90, 124, 124, 92, 98]; // sum = 528
    const CA_HDR_H = 34;
    const caHeaders = [
      'True Root Cause',
      'Corrective Action:',
      'Person In-Charge/\nTarget Date',
      'Evidence/\nRecord',
      'Date Implemented',
    ];
    const drawCaHeader = (atY: number) => {
      let cx = HEADER_X;
      caHeaders.forEach((h, i) => {
        drawBox(cx, atY, CA_COLS[i], CA_HDR_H);
        drawCenteredText(h, cx, atY, CA_COLS[i], CA_HDR_H, 'Times-Bold', 9.2);
        cx += CA_COLS[i];
      });
      return atY + CA_HDR_H;
    };
    y = drawCaHeader(y);

    let cas = parseJsonArray<Record<string, string>>(rec.CorrectiveActionEntries);
    if (cas.length === 0 && (rec.CorrectiveAction || rec.ActionOwnerTargetDate || rec.DateImplemented)) {
      cas = [
        {
          CorrectiveAction: rec.CorrectiveAction || '',
          ActionOwnerTargetDate: rec.ActionOwnerTargetDate || '',
          DateImplemented: rec.DateImplemented || '',
        },
      ];
    }
    const evLinks = Array.from(
      new Set([
        ...parseJsonArray<string>(rec.EvidenceLinks),
        ...(rec.EvidenceLink ? [rec.EvidenceLink] : []),
      ])
    ).filter((u) => isValidEvidenceUrl(u));

    const caRows =
      cas.length > 0
        ? cas.map((c) => ({
            action: c.CorrectiveAction || '',
            ownerTarget: c.ActionOwnerTargetDate || '',
            implemented: formatDateText(c.DateImplemented),
          }))
        : [{ action: '', ownerTarget: '', implemented: '' }];

    const trueRcH = doc
      .font('Times-Roman')
      .fontSize(9)
      .heightOfString(rec.TrueRootCause || '', { width: CA_COLS[0] - 10 });
    const evTextH = evLinks.length > 0 ? evLinks.length * 14 + 10 : 0;

    const caRowHeights = caRows.map((r) => {
      const aH = doc.font('Times-Roman').fontSize(9).heightOfString(r.action, { width: CA_COLS[1] - 10 });
      const oH = doc.font('Times-Roman').fontSize(9).heightOfString(r.ownerTarget, { width: CA_COLS[2] - 10 });
      const dH = doc.font('Times-Roman').fontSize(9).heightOfString(r.implemented, { width: CA_COLS[4] - 10 });
      return Math.max(caRows.length === 1 ? 76 : 34, aH + 12, oH + 12, dH + 12);
    });
    const minMergedH = Math.max(76, trueRcH + 14, evTextH + 12);
    let totalCaH = caRowHeights.reduce((a, b) => a + b, 0);
    if (totalCaH < minMergedH) {
      caRowHeights[caRowHeights.length - 1] += minMergedH - totalCaH;
      totalCaH = minMergedH;
    }

    const drawEvidenceInCell = (cellX: number, cellY: number, cellW: number) => {
      if (evLinks.length === 0) return;
      let ey = cellY + 6;
      evLinks.forEach((url, idx) => {
        const label = evidenceLabel(url, idx);
        const isHttp = /^https?:\/\//i.test(url);
        doc
          .fillColor(isHttp ? '#1D4ED8' : TEXT)
          .font('Times-Roman')
          .fontSize(8.2)
          .text(label, cellX + 5, ey, {
            width: cellW - 10,
            underline: isHttp,
            link: isHttp ? url : undefined,
          });
        ey = doc.y + 3;
      });
    };

    if (y + totalCaH <= BOTTOM_LIMIT - 210) {
      // Draw merged Col 1 (True Root Cause) and merged Col 4 (Evidence/Record) cleanly
      const col2X = HEADER_X + CA_COLS[0];
      const col3X = col2X + CA_COLS[1];
      const col4X = col3X + CA_COLS[2];
      const col5X = col4X + CA_COLS[3];

      drawBox(HEADER_X, y, CA_COLS[0], totalCaH);
      if (rec.TrueRootCause) {
        doc
          .fillColor(TEXT)
          .font('Times-Roman')
          .fontSize(9)
          .text(rec.TrueRootCause, HEADER_X + 5, y + 6, { width: CA_COLS[0] - 10 });
      }

      drawBox(col4X, y, CA_COLS[3], totalCaH);
      drawEvidenceInCell(col4X, y, CA_COLS[3]);

      let ry = y;
      caRows.forEach((r, idx) => {
        const rh = caRowHeights[idx];
        drawBox(col2X, ry, CA_COLS[1], rh);
        drawBox(col3X, ry, CA_COLS[2], rh);
        drawBox(col5X, ry, CA_COLS[4], rh);
        if (r.action) {
          doc.fillColor(TEXT).font('Times-Roman').fontSize(9).text(r.action, col2X + 5, ry + 6, {
            width: CA_COLS[1] - 10,
          });
        }
        if (r.ownerTarget) {
          doc.fillColor(TEXT).font('Times-Roman').fontSize(9).text(r.ownerTarget, col3X + 5, ry + 6, {
            width: CA_COLS[2] - 10,
          });
        }
        if (r.implemented) {
          doc.fillColor(TEXT).font('Times-Roman').fontSize(9).text(r.implemented, col5X + 5, ry + 6, {
            width: CA_COLS[4] - 10,
            align: 'center',
          });
        }
        ry += rh;
      });
      y += totalCaH;
    } else {
      caRows.forEach((r, idx) => {
        const rh = Math.max(caRowHeights[idx], idx === 0 ? minMergedH : 34);
        if (y + rh > BOTTOM_LIMIT) {
          doc.addPage();
          y = HEADER_BOTTOM;
          y = drawCaHeader(y);
        }
        const cells = [
          idx === 0 ? rec.TrueRootCause || '' : '',
          r.action,
          r.ownerTarget,
          '',
          r.implemented,
        ];
        let cx = HEADER_X;
        cells.forEach((val, ci) => {
          drawBox(cx, y, CA_COLS[ci], rh);
          if (ci === 3 && idx === 0) {
            drawEvidenceInCell(cx, y, CA_COLS[ci]);
          } else if (val) {
            doc
              .fillColor(TEXT)
              .font('Times-Roman')
              .fontSize(9)
              .text(val, cx + 5, y + 6, {
                width: CA_COLS[ci] - 10,
                align: ci === 4 ? 'center' : 'left',
              });
          }
          cx += CA_COLS[ci];
        });
        y += rh;
      });
    }

    // 3C. Sign-off Block (Prepared by / Approved by / Conformed by)
    const SIGNOFF_H = 132;
    if (y + SIGNOFF_H + BANNER_H + 80 > BOTTOM_LIMIT) {
      doc.addPage();
      y = HEADER_BOTTOM;
    }
    drawBox(HEADER_X, y, pageWidth, SIGNOFF_H);

    const signColW = pageWidth / 3; // 176
    const signCols = [
      {
        title: 'Prepared by',
        role: '(Process Owner)',
        name: rec.PreparedBy || '',
        dateLabel: 'Date:',
        dateVal: formatDateText(rec.PreparedDate),
      },
      {
        title: 'Approved by:',
        role: '(Immediate Head)',
        name: rec.ApprovedBy || '',
        dateLabel: 'Date:',
        dateVal: formatDateText(rec.ApprovedDate),
      },
      {
        title: 'Conformed by:',
        role: '(Auditor)',
        name: rec.SignOffConformedBy || '',
        dateLabel: 'Date received:',
        dateVal: formatDateText(rec.SignOffConformedDate),
      },
    ];

    signCols.forEach((col, i) => {
      const sx = HEADER_X + i * signColW;
      if (col.name) {
        doc
          .fillColor(TEXT)
          .font('Times-Bold')
          .fontSize(9.5)
          .text(col.name, sx + 10, y + 14, { width: signColW - 20, align: 'center' });
      }
      doc
        .fillColor(TEXT)
        .font('Times-Bold')
        .fontSize(9.5)
        .text(col.title, sx + 10, y + 36, { width: signColW - 20, align: 'center' })
        .text(col.role, sx + 10, y + 54, { width: signColW - 20, align: 'center' });
      doc
        .font('Times-Bold')
        .fontSize(9.5)
        .text(`${col.dateLabel}${col.dateVal ? ` ${col.dateVal}` : ''}`, sx + 10, y + 92, {
          width: signColW - 20,
          align: 'center',
        });
    });

    y += SIGNOFF_H;

    // 3D. Gray Banner - To be filled out by the Auditor
    drawGrayBanner(y, BANNER_H, 'To be filled out by the Auditor');
    y += BANNER_H;

    // 3E. Ff-up/ Verification of Corrective Action Table
    const FUP_COLS = [66, 120, 102, 122, 118]; // sum = 528
    const FUP_TOP_H = 18;
    const FUP_BOT_H = 30;
    const FUP_HDR_H = FUP_TOP_H + FUP_BOT_H;

    const drawFollowUpHeader = (atY: number) => {
      const rightX = HEADER_X + FUP_COLS[0];
      const rightW = pageWidth - FUP_COLS[0];
      // Date cell spans both header rows
      drawBox(HEADER_X, atY, FUP_COLS[0], FUP_HDR_H);
      drawCenteredText('Date', HEADER_X, atY, FUP_COLS[0], FUP_HDR_H, 'Times-Bold', 9.2);

      // Top spanning cell: Ff-up/ Verification of Corrective Action
      drawBox(rightX, atY, rightW, FUP_TOP_H);
      drawCenteredText(
        'Ff-up/ Verification of Corrective Action',
        rightX,
        atY,
        rightW,
        FUP_TOP_H,
        'Times-Bold',
        9.2
      );

      // Second header row
      const subHeaders = [
        'Result of Verification',
        'Status (Closed/\nOpen)',
        'Verified By (Auditor)',
        'Conformed By',
      ];
      let fx = rightX;
      subHeaders.forEach((h, i) => {
        const w = FUP_COLS[i + 1];
        drawBox(fx, atY + FUP_TOP_H, w, FUP_BOT_H);
        drawCenteredText(h, fx, atY + FUP_TOP_H, w, FUP_BOT_H, 'Times-Bold', 9);
        fx += w;
      });
      return atY + FUP_HDR_H;
    };

    if (y + FUP_HDR_H + 54 > BOTTOM_LIMIT) {
      doc.addPage();
      y = HEADER_BOTTOM;
    }
    y = drawFollowUpHeader(y);

    let followUps = parseJsonArray<Record<string, string>>(rec.FollowUpEntries);
    if (followUps.length === 0 && rec.FollowUpDate) {
      followUps = [
        {
          FollowUpDate: rec.FollowUpDate,
          ResultOfVerification: rec.ResultOfVerification || '',
          VerifiedBy: rec.VerifiedBy || '',
          ConformedBy: rec.ConformedBy || '',
        },
      ];
    }

    const fupRows: Array<[string, string, string, string, string]> =
      followUps.length > 0
        ? followUps.map((f, idx) => [
            formatDateText(f.FollowUpDate),
            f.ResultOfVerification || '',
            idx === followUps.length - 1 ? rec.Status || 'Open' : '',
            f.VerifiedBy || '',
            f.ConformedBy || '',
          ])
        : [['', '', '', '', '']];

    const remFupSpace = Math.max(76, BOTTOM_LIMIT - y - 4);
    const defaultFupRowH = Math.max(46, Math.floor(remFupSpace / fupRows.length));

    fupRows.forEach((r) => {
      const heights = r.map((cell, i) =>
        doc.font('Times-Roman').fontSize(9).heightOfString(cell, { width: FUP_COLS[i] - 10 })
      );
      const rh = Math.max(defaultFupRowH, ...heights.map((h) => h + 14));
      if (y + rh > BOTTOM_LIMIT) {
        doc.addPage();
        y = HEADER_BOTTOM;
        y = drawFollowUpHeader(y);
      }
      let fx = HEADER_X;
      r.forEach((cell, i) => {
        drawBox(fx, y, FUP_COLS[i], rh);
        if (cell) {
          doc
            .fillColor(TEXT)
            .font('Times-Roman')
            .fontSize(9)
            .text(cell, fx + 5, y + 6, {
              width: FUP_COLS[i] - 10,
              align: i === 0 || i === 2 ? 'center' : 'left',
            });
        }
        fx += FUP_COLS[i];
      });
      y += rh;
    });

    // Stamp FO-RI-05 header with accurate Page X of Y on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawHeader(i + 1, range.count);
    }

    doc.end();
  });
}

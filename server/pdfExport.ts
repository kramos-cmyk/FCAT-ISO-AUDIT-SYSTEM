import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { APP_NAME, FO_RI_05_META, WHY_FACTORS } from './constants.js';
import { isValidEvidenceUrl, nowIso, parseJsonArray, parseWhyFactors } from './security.js';
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

export async function generateCarPdfBuffer(
  rec: CarRecord,
  company: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const MAROON = '#6B1A25';
    const MAROON_DARK = '#4A1219';
    const GOLD = '#C9A227';
    const TEXT = '#2B2323';
    const MUTED = '#6E6363';
    const BG_SOFT = '#F8F4F0';
    const LINE = '#DFD0CC';
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        drawHeader(doc.bufferedPageRange().count);
      }
    };

    const logoPath = resolveSchoolLogoPath();
    const HEADER_X = 42;
    const HEADER_Y = 34;
    const TOP_ROW_H = 62;
    const BOT_ROW_H = 30;
    const COL_LOGO_W = 112;
    const COL_META_W = 152;
    const COL_TITLE_W = pageWidth - COL_LOGO_W - COL_META_W;
    const COL_GROUP_W = 178;
    const COL_EFF_W = pageWidth - COL_GROUP_W - COL_META_W;
    const META_X = HEADER_X + pageWidth - COL_META_W;
    const META_SPLIT_X = META_X + COL_META_W / 2;

    const drawHeader = (_pageNum: number) => {
      const x = HEADER_X;
      const y = HEADER_Y;
      const totalH = TOP_ROW_H + BOT_ROW_H;
      const midY = y + TOP_ROW_H / 2;
      const botY = y + TOP_ROW_H;

      doc.save();
      doc.rect(x, y, pageWidth, totalH).fill('#FFFFFF');
      doc.strokeColor('#111111').lineWidth(0.9);
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
        .fillColor('#000000')
        .font('Times-Bold')
        .fontSize(12.5)
        .text('CORRECTIVE ACTION REPORT', x + COL_LOGO_W + 6, y + 24, {
          width: COL_TITLE_W - 12,
          align: 'center',
          lineBreak: false,
        });

      // Top-right metadata labels & values
      doc
        .fillColor('#000000')
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

      // Bottom-right Page No. label (page X of Y value stamped at end across all pages)
      doc
        .font('Times-Bold')
        .fontSize(9.5)
        .text('Page No.', META_X + 6, botY + 10, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        });

      doc.restore();
      doc.y = y + totalH + 10;
    };

    const banner = (title: string) => {
      ensureSpace(34);
      const y = doc.y;
      doc.save();
      doc.rect(42, y, pageWidth, 22).fill(MAROON);
      doc.rect(42, y, 4, 22).fill(GOLD);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(title, 52, y + 6);
      doc.restore();
      doc.y = y + 28;
    };

    const kvRow = (pairs: Array<[string, string | undefined]>) => {
      ensureSpace(26);
      const colW = pageWidth / pairs.length;
      const startY = doc.y;
      let maxY = startY;
      pairs.forEach(([label, val], i) => {
        const x = 42 + i * colW;
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, startY, { width: colW - 10 });
        const valueText = val && String(val).trim() ? String(val) : '—';
        doc.fillColor(TEXT).font('Helvetica').fontSize(9.5).text(valueText, x, doc.y + 1, { width: colW - 10 });
        if (doc.y > maxY) maxY = doc.y;
      });
      doc.y = maxY + 7;
    };

    const checkboxGroup = (title: string, options: string[], selected: string) => {
      ensureSpace(24 + options.length * 13);
      doc.fillColor(MAROON_DARK).font('Helvetica-Bold').fontSize(9).text(title, 42, doc.y);
      doc.y += 3;
      options.forEach((opt) => {
        const checked = String(selected || '').trim() === opt;
        doc
          .fillColor(checked ? MAROON_DARK : TEXT)
          .font(checked ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .text(`${checked ? '[X]' : '[ ]'}  ${opt}`, 48, doc.y);
        doc.y += 1;
      });
      doc.y += 6;
    };

    const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
      if (rows.length === 0) {
        ensureSpace(20);
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('None recorded.', 42, doc.y);
        doc.y += 8;
        return;
      }

      const drawHeaderRow = () => {
        ensureSpace(28);
        const y = doc.y;
        doc.save();
        doc.rect(42, y, pageWidth, 20).fill('#F3E7E4').strokeColor(LINE).lineWidth(0.75).stroke();
        let x = 42;
        headers.forEach((h, i) => {
          doc.fillColor(MAROON_DARK).font('Helvetica-Bold').fontSize(8.5).text(h, x + 5, y + 6, { width: colWidths[i] - 10 });
          x += colWidths[i];
        });
        doc.restore();
        doc.y = y + 20;
      };

      drawHeaderRow();
      rows.forEach((r) => {
        const heights = r.map((cell, i) =>
          doc.font('Helvetica').fontSize(8.5).heightOfString(cell || '—', { width: colWidths[i] - 10 })
        );
        const rowH = Math.max(20, ...heights) + 10;
        if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          drawHeader(doc.bufferedPageRange().count);
          drawHeaderRow();
        }
        const y = doc.y;
        doc.save();
        doc.rect(42, y, pageWidth, rowH).strokeColor(LINE).lineWidth(0.5).stroke();
        let x = 42;
        r.forEach((cell, i) => {
          if (i > 0) {
            doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor(LINE).lineWidth(0.5).stroke();
          }
          doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(cell || '—', x + 5, y + 5, { width: colWidths[i] - 10 });
          x += colWidths[i];
        });
        doc.restore();
        doc.y = y + rowH;
      });
      doc.y += 8;
    };

    // Page 1
    drawHeader(1);
    const statusLabel = rec.AdminFlag === 'Needs Attention' ? 'Needs Attention' : rec.Status || 'Open';
    doc.save();
    doc.rect(42, doc.y, pageWidth, 24).fill(BG_SOFT);
    doc.fillColor(MAROON_DARK).font('Helvetica-Bold').fontSize(10.5).text(`CAR No.: ${rec.CARNo}     |     Status: ${statusLabel}`, 50, doc.y + 7);
    doc.restore();
    doc.y += 32;

    banner('1. Finding Details');
    kvRow([
      ['Raised By (Auditor)', rec.RaisedBy],
      ['Received By', rec.EmployeeName && rec.EmployeeName !== '(Unassigned)' ? rec.EmployeeName : 'Unclaimed'],
    ]);
    checkboxGroup('Type of Finding', ['Nonconformity (NC)', 'Opportunity for Improvement (OFI)'], rec.Type);
    checkboxGroup(
      'Source of Incident or Nonconformity',
      ['Internal Audit', 'External Audit', 'Customer Complaint', 'Unmet KPIs', 'Nonconforming Output/Services', 'Others'],
      rec.Source
    );
    kvRow([
      ['Department / Process', rec.Department],
      ['Date Issued', rec.DateIssued],
    ]);
    kvRow([
      ['ISO 9001 Clause', rec.ISOClause],
      ['Related Company Document', rec.CompanyDocument],
    ]);
    kvRow([['Details of Incident or Nonconformity', rec.Details]]);

    banner('2. Correction (Immediate Action Taken)');
    let corrections = parseJsonArray<Record<string, string>>(rec.CorrectionEntries);
    if (corrections.length === 0 && (rec.Correction || rec.DateCompleted || rec.PersonInCharge || rec.Result)) {
      corrections = [
        {
          Correction: rec.Correction,
          DateCompleted: rec.DateCompleted,
          PersonInCharge: rec.PersonInCharge,
          Result: rec.Result,
        },
      ];
    }
    drawTable(
      ['Correction', 'Date Completed', 'Person In-Charge', 'Result'],
      corrections.map((c) => [c.Correction || '', c.DateCompleted || '', c.PersonInCharge || '', c.Result || '']),
      [pageWidth * 0.36, pageWidth * 0.16, pageWidth * 0.22, pageWidth * 0.26]
    );

    banner('3. Root Cause Analysis');
    doc.fillColor(MAROON_DARK).font('Helvetica-Bold').fontSize(9).text('Contributing Factors (5 Whys)', 42, doc.y);
    doc.y += 4;
    const whys = parseWhyFactors(rec.RootCauseFactors);
    drawTable(
      ['Factor', 'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5'],
      WHY_FACTORS.map((f) => [f, ...(whys[f] || ['', '', '', '', ''])]),
      [pageWidth * 0.15, pageWidth * 0.17, pageWidth * 0.17, pageWidth * 0.17, pageWidth * 0.17, pageWidth * 0.17]
    );

    let rootCauses = parseJsonArray<string>(rec.PossibleRootCauseEntries);
    if (rootCauses.length === 0 && rec.PossibleRootCause) rootCauses = [rec.PossibleRootCause];
    doc.fillColor(MAROON_DARK).font('Helvetica-Bold').fontSize(9).text('Possible Root Cause(s)', 42, doc.y);
    doc.y += 3;
    if (rootCauses.length === 0) {
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('None recorded.', 42, doc.y);
    } else {
      rootCauses.forEach((rc) => {
        ensureSpace(16);
        doc.fillColor(TEXT).font('Helvetica').fontSize(9).text(`•  ${rc}`, 48, doc.y, { width: pageWidth - 10 });
        doc.y += 2;
      });
    }
    doc.y += 6;
    kvRow([
      ['Validation Method', rec.ValidationMethod],
      ['Validation Date', rec.ValidationDate],
    ]);
    kvRow([['Results of Validation', rec.ValidationResult]]);

    banner('4. Corrective Action Plan');
    kvRow([['True Root Cause', rec.TrueRootCause]]);
    let cas = parseJsonArray<Record<string, string>>(rec.CorrectiveActionEntries);
    if (cas.length === 0 && (rec.CorrectiveAction || rec.ActionOwnerTargetDate || rec.DateImplemented)) {
      cas = [
        {
          CorrectiveAction: rec.CorrectiveAction,
          ActionOwnerTargetDate: rec.ActionOwnerTargetDate,
          DateImplemented: rec.DateImplemented,
        },
      ];
    }
    drawTable(
      ['Corrective Action', 'Person In-Charge / Target Date', 'Date Implemented'],
      cas.map((c) => [c.CorrectiveAction || '', c.ActionOwnerTargetDate || '', c.DateImplemented || '']),
      [pageWidth * 0.5, pageWidth * 0.3, pageWidth * 0.2]
    );

    banner('5. General Evidence / Record');
    const evLinks = Array.from(
      new Set([
        ...parseJsonArray<string>(rec.EvidenceLinks),
        ...(rec.EvidenceLink ? [rec.EvidenceLink] : []),
      ])
    ).filter((u) => isValidEvidenceUrl(u));
    if (evLinks.length === 0) {
      kvRow([['Evidence', 'None attached']]);
    } else {
      evLinks.forEach((url, idx) => {
        ensureSpace(18);
        doc.fillColor(MAROON).font('Helvetica').fontSize(9).text(`Evidence file ${idx + 1}: ${url}`, 42, doc.y, {
          width: pageWidth,
        });
        doc.y += 3;
      });
      doc.y += 6;
    }

    banner('6. Sign-off');
    drawTable(
      ['Prepared by (Process Owner)', 'Approved by (Immediate Head)', 'Conformed by (Process Owner)'],
      [
        [rec.PreparedBy || '—', rec.ApprovedBy || '—', rec.SignOffConformedBy || '—'],
        [
          `Date: ${rec.PreparedDate || '—'}`,
          `Date: ${rec.ApprovedDate || '—'}`,
          `Date: ${rec.SignOffConformedDate || '—'}`,
        ],
      ],
      [pageWidth / 3, pageWidth / 3, pageWidth / 3]
    );

    banner('7. Auditor Follow-up / Verification History');
    let followUps = parseJsonArray<Record<string, string>>(rec.FollowUpEntries);
    if (followUps.length === 0 && rec.FollowUpDate) {
      followUps = [
        {
          FollowUpDate: rec.FollowUpDate,
          ResultOfVerification: rec.ResultOfVerification,
          VerifiedBy: rec.VerifiedBy,
          ConformedBy: rec.ConformedBy,
        },
      ];
    }
    if (followUps.length === 0) {
      kvRow([['Follow-up', 'None recorded yet.']]);
    } else {
      followUps.forEach((f) => {
        kvRow([
          ['Follow-up Date', f.FollowUpDate],
          ['Verified By', f.VerifiedBy],
        ]);
        kvRow([
          ['Result of Verification', f.ResultOfVerification],
          ['Conformed By', f.ConformedBy || '—'],
        ]);
      });
    }

    if (rec.AdminFlag === 'Needs Attention' && rec.AdminNote) {
      banner('Flagged by an Auditor');
      kvRow([['Note', rec.AdminNote]]);
    }

    ensureSpace(22);
    doc
      .fillColor(MUTED)
      .font('Helvetica-Oblique')
      .fontSize(7.5)
      .text(`Generated ${nowIso()} from ${APP_NAME} — record ${rec.CARNo}`, 42, doc.y + 6);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .save()
        .fillColor('#000000')
        .font('Times-Roman')
        .fontSize(9.5)
        .text(`Page ${i + 1} of ${range.count}`, META_SPLIT_X + 6, HEADER_Y + TOP_ROW_H + 10, {
          width: COL_META_W / 2 - 10,
          lineBreak: false,
        })
        .restore();
    }

    doc.end();
  });
}

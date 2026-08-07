import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

interface PatientData {
  id?: number;
  patient_code?: string;
  full_name?: string;
  name?: string;
  age?: number | string;
  gender?: string;
  phone?: string;
  referred_by?: string;
  clinic_name?: string;
}

interface ReportData {
  id: number;
  exam_type?: string;
  study?: string;
  clinical_history?: string;
  findings?: string;
  key_findings?: string;
  impression?: string;
  advice?: string;
  report_date?: string;
  date?: string;
  report_time?: string;
  time?: string;
}

function formatQrDate(rawDate?: string): string {
  if (!rawDate) return '';
  const str = String(rawDate).trim();
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(str)) {
    return str;
  }
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = match[1];
    const monthNum = parseInt(match[2], 10) - 1;
    const day = match[3];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthNum >= 0 && monthNum < 12) {
      return `${day}-${months[monthNum]}-${year}`;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return str;
}

export function buildStructuredQrText(patient: PatientData, report: ReportData): string {
  const lines: string[] = ['MJ Ultrasound Reporting System', ''];

  const patientId = (patient.patient_code || (patient.id ? `PT-${patient.id}` : '')).trim();
  if (patientId) {
    lines.push(`Patient ID: ${patientId}`);
  }

  const patientName = (patient.full_name || patient.name || '').trim();
  if (patientName) {
    lines.push(`Patient Name: ${patientName}`);
  }

  if (patient.age !== undefined && patient.age !== null && String(patient.age).trim() !== '') {
    const rawAge = String(patient.age).trim();
    const ageStr = /years?|yrs?|y/i.test(rawAge) ? rawAge : `${rawAge} Years`;
    lines.push(`Age: ${ageStr}`);
  }

  if (patient.gender && String(patient.gender).trim()) {
    lines.push(`Gender: ${String(patient.gender).trim()}`);
  }

  if (patient.phone && String(patient.phone).trim()) {
    lines.push(`Phone: ${String(patient.phone).trim()}`);
  }

  const rawDate = report.report_date || report.date || '';
  const reportDateFormatted = formatQrDate(rawDate);
  if (reportDateFormatted) {
    lines.push(`Report Date: ${reportDateFormatted}`);
  }

  return lines.join('\n').trim();
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

export async function generateReportPdfBuffer(
  patient: PatientData,
  report: ReportData,
  verifyUrl: string
): Promise<Buffer> {
  // 1. Locate letterhead PDF
  const possiblePaths = [
    path.join(process.cwd(), 'static', 'images', 'letterhead.pdf'),
    path.join(process.cwd(), 'static', 'Letter head.pdf'),
  ];

  let templateBytes: Buffer | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      templateBytes = fs.readFileSync(p);
      break;
    }
  }

  let templateDoc: PDFDocument;
  let pdfDoc: PDFDocument;

  if (templateBytes) {
    templateDoc = await PDFDocument.load(templateBytes);
    pdfDoc = await PDFDocument.load(templateBytes);
  } else {
    // Fallback if no letterhead file exists
    pdfDoc = await PDFDocument.create();
    templateDoc = await PDFDocument.create();
    pdfDoc.addPage([612, 792]);
    templateDoc.addPage([612, 792]);
  }

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let currentPage = pdfDoc.getPages()[0];
  const { width, height } = currentPage.getSize();

  // Printable Area Dimensions
  const leftMargin = 40;
  const rightMargin = 40;
  const contentWidth = width - leftMargin - rightMargin; // ~532 pt
  const topMargin = 135; // Start content below top letterhead header
  const bottomMargin = 85; // Stop content above bottom letterhead footer

  let currentY = height - topMargin;

  // Function to create a new page with letterhead background if content overflows
  const checkPageBreak = async (neededHeight: number): Promise<PDFPage> => {
    if (currentY - neededHeight < bottomMargin) {
      if (templateBytes && templateDoc.getPageCount() > 0) {
        const [newPage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(newPage);
        currentPage = newPage;
      } else {
        currentPage = pdfDoc.addPage([width, height]);
      }
      currentY = height - topMargin;

      // Continuation Header
      currentPage.drawText('ULTRASOUND REPORT (Continued)', {
        x: leftMargin,
        y: currentY,
        size: 9,
        font: helveticaOblique,
        color: rgb(0.3, 0.3, 0.3),
      });
      currentY -= 18;
    }
    return currentPage;
  };

  // 2. Report Title & Study Name
  const reportTitle = 'ULTRASOUND EXAMINATION REPORT';
  const titleWidth = helveticaBold.widthOfTextAtSize(reportTitle, 13);
  currentPage.drawText(reportTitle, {
    x: (width - titleWidth) / 2,
    y: currentY,
    size: 13,
    font: helveticaBold,
    color: rgb(0.08, 0.18, 0.36), // Deep navy blue
  });
  currentY -= 16;

  const studyName = (report.study || report.exam_type || 'ULTRASOUND STUDY').toUpperCase();
  const studyWidth = helveticaBold.widthOfTextAtSize(studyName, 11);
  currentPage.drawText(studyName, {
    x: (width - studyWidth) / 2,
    y: currentY,
    size: 11,
    font: helveticaBold,
    color: rgb(0.12, 0.38, 0.8), // Medical Blue
  });
  currentY -= 18;

  // 3. Patient Information Box (3-column grid) & Top-Right Single QR Code
  const patientBoxHeight = 65;
  await checkPageBreak(patientBoxHeight + 10);

  // Patient Info Box width adjusted to fit QR code at top-right
  const patientBoxWidth = contentWidth - 62; // 532 - 62 = 470 pt

  // Draw background box with subtle border
  currentPage.drawRectangle({
    x: leftMargin,
    y: currentY - patientBoxHeight,
    width: patientBoxWidth,
    height: patientBoxHeight,
    color: rgb(0.97, 0.98, 0.99), // Very light gray-blue background
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 0.8,
  });

  const patientName = patient.full_name || patient.name || 'N/A';
  const patientCode = patient.patient_code || `PT-${patient.id || ''}`;
  const ageGender = `${patient.age || 'N/A'} Y / ${patient.gender || 'N/A'}`;
  const reportDate = report.report_date || report.date || new Date().toISOString().split('T')[0];
  const reportTime = report.report_time || report.time || '';
  const phone = patient.phone || 'N/A';
  const referredBy = patient.referred_by || 'Self / Direct';
  const clinicName = patient.clinic_name || 'Main Clinic';

  const col1X = leftMargin + 8;
  const col2X = leftMargin + 162;
  const col3X = leftMargin + 312;
  let boxY = currentY - 14;

  // Row 1
  currentPage.drawText('Patient ID:', { x: col1X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(patientCode, { x: col1X + 52, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });

  currentPage.drawText('Date:', { x: col2X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(`${reportDate} ${reportTime}`.trim(), { x: col2X + 32, y: boxY, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

  currentPage.drawText('Referred By:', { x: col3X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(referredBy.substring(0, 18), { x: col3X + 58, y: boxY, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

  boxY -= 16;
  // Row 2
  currentPage.drawText('Name:', { x: col1X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(patientName.substring(0, 22), { x: col1X + 52, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.05, 0.2, 0.5) });

  currentPage.drawText('Phone:', { x: col2X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(phone, { x: col2X + 32, y: boxY, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

  currentPage.drawText('Exam:', { x: col3X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText((report.exam_type || report.study || '').substring(0, 18), { x: col3X + 58, y: boxY, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

  boxY -= 16;
  // Row 3
  currentPage.drawText('Age / Sex:', { x: col1X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(ageGender, { x: col1X + 52, y: boxY, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

  currentPage.drawText('Center:', { x: col2X, y: boxY, size: 8.5, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
  currentPage.drawText(clinicName.substring(0, 18), { x: col2X + 32, y: boxY, size: 8.5, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

  // Single QR Code in Top-Right Corner of First Page (beside Patient Box)
  try {
    const qrText = buildStructuredQrText(patient, report);
    const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 140 });
    const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImage = await pdfDoc.embedPng(qrImageBytes);

    const qrSize = 52;
    const qrX = width - rightMargin - qrSize; // 612 - 40 - 52 = 520
    const qrY = currentY - patientBoxHeight + 8; // Beside top-right patient box

    currentPage.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });

    const labelText = 'Scan to verify';
    const labelWidth = helvetica.widthOfTextAtSize(labelText, 6.5);
    currentPage.drawText(labelText, {
      x: qrX + (qrSize - labelWidth) / 2,
      y: qrY - 7,
      size: 6.5,
      font: helvetica,
      color: rgb(0.35, 0.35, 0.35),
    });
  } catch (err) {
    console.error('Error generating top-right QR code for PDF:', err);
  }

  currentY -= (patientBoxHeight + 15);

  // 4. Clinical History (if present)
  if (report.clinical_history && report.clinical_history.trim()) {
    await checkPageBreak(30);
    currentPage.drawText('CLINICAL HISTORY / INDICATION:', {
      x: leftMargin,
      y: currentY,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.15, 0.25, 0.45),
    });
    currentY -= 14;

    const historyLines = wrapText(report.clinical_history.trim(), helvetica, 9, contentWidth);
    for (const line of historyLines) {
      await checkPageBreak(12);
      currentPage.drawText(line, {
        x: leftMargin,
        y: currentY,
        size: 9,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      currentY -= 12;
    }
    currentY -= 6;
  }

  // 5. Findings Section Header
  const findingsText = (report.findings || report.key_findings || '').trim();
  if (findingsText) {
    await checkPageBreak(30);
    currentPage.drawRectangle({
      x: leftMargin,
      y: currentY - 14,
      width: contentWidth,
      height: 16,
      color: rgb(0.92, 0.95, 0.98),
    });
    currentPage.drawText('ULTRASOUND FINDINGS', {
      x: leftMargin + 6,
      y: currentY - 10,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.08, 0.25, 0.55),
    });
    currentY -= 22;

    const rawLines = findingsText.split(/\r?\n/);
    for (const rawLine of rawLines) {
      const lineStr = rawLine.trim();
      if (!lineStr) {
        currentY -= 6;
        continue;
      }

      const organMatch = lineStr.match(/^([A-Z\s\/]{2,20}:)\s*(.*)$/);
      if (organMatch) {
        const heading = organMatch[1];
        const body = organMatch[2];

        await checkPageBreak(14);
        currentPage.drawText(heading, {
          x: leftMargin,
          y: currentY,
          size: 9.5,
          font: helveticaBold,
          color: rgb(0.1, 0.1, 0.1),
        });

        const headingWidth = helveticaBold.widthOfTextAtSize(heading + ' ', 9.5);
        if (body) {
          const bodyLines = wrapText(body, helvetica, 9, contentWidth - headingWidth);
          if (bodyLines.length > 0) {
            currentPage.drawText(bodyLines[0], {
              x: leftMargin + headingWidth,
              y: currentY,
              size: 9,
              font: helvetica,
              color: rgb(0.2, 0.2, 0.2),
            });
            currentY -= 13;

            for (let i = 1; i < bodyLines.length; i++) {
              await checkPageBreak(13);
              currentPage.drawText(bodyLines[i], {
                x: leftMargin + 15,
                y: currentY,
                size: 9,
                font: helvetica,
                color: rgb(0.2, 0.2, 0.2),
              });
              currentY -= 13;
            }
          } else {
            currentY -= 13;
          }
        } else {
          currentY -= 13;
        }
      } else {
        const wrapped = wrapText(lineStr, helvetica, 9, contentWidth);
        for (const wLine of wrapped) {
          await checkPageBreak(13);
          currentPage.drawText(wLine, {
            x: leftMargin,
            y: currentY,
            size: 9,
            font: helvetica,
            color: rgb(0.2, 0.2, 0.2),
          });
          currentY -= 13;
        }
      }
    }
    currentY -= 8;
  }

  // 6. Impression / Conclusion Section
  const impressionText = (report.impression || '').trim();
  if (impressionText) {
    await checkPageBreak(35);
    currentPage.drawRectangle({
      x: leftMargin,
      y: currentY - 14,
      width: contentWidth,
      height: 16,
      color: rgb(0.92, 0.95, 0.98),
    });
    currentPage.drawText('IMPRESSION', {
      x: leftMargin + 6,
      y: currentY - 10,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.08, 0.25, 0.55),
    });
    currentY -= 22;

    const impLines = wrapText(impressionText, helveticaBold, 9.5, contentWidth - 10);
    for (const line of impLines) {
      if (!line.trim()) {
        currentY -= 4;
        continue;
      }
      await checkPageBreak(14);
      currentPage.drawText('• ' + line, {
        x: leftMargin + 4,
        y: currentY,
        size: 9.5,
        font: helveticaBold,
        color: rgb(0.1, 0.15, 0.25),
      });
      currentY -= 14;
    }
    currentY -= 8;
  }

  // 7. Advice Section
  const adviceText = (report.advice || '').trim();
  if (adviceText) {
    await checkPageBreak(30);
    currentPage.drawText('ADVICE / RECOMMENDATION:', {
      x: leftMargin,
      y: currentY,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.15, 0.25, 0.45),
    });
    currentY -= 14;

    const adviceLines = wrapText(adviceText, helvetica, 9, contentWidth);
    for (const line of adviceLines) {
      await checkPageBreak(12);
      currentPage.drawText(line, {
        x: leftMargin,
        y: currentY,
        size: 9,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      currentY -= 12;
    }
    currentY -= 10;
  }

  // 8. Bottom Footer Overlay (Doctor Signature Block)
  if (currentY < bottomMargin + 60) {
    await checkPageBreak(80);
  }

  const footerY = Math.max(currentY - 15, bottomMargin + 10);

  // Doctor Signature Block (Bottom Right)
  const sigX = width - rightMargin - 160;
  currentPage.drawText('___________________________________', {
    x: sigX,
    y: footerY - 10,
    size: 8,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.6),
  });

  currentPage.drawText('Dr. Consultant Radiologist', {
    x: sigX + 10,
    y: footerY - 23,
    size: 9.5,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  currentPage.drawText('M.B.B.S., M.D. (Radiology) / Sonologist', {
    x: sigX + 10,
    y: footerY - 34,
    size: 8,
    font: helveticaOblique,
    color: rgb(0.3, 0.3, 0.3),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

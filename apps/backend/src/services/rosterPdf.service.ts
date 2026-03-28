import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index';
import {
  dailyRosters,
  rosterEntries,
  staffMembers,
  dutyCategories,
  sectors,
  areas,
} from '../db/schema';

interface RosterEntryRow {
  staffName: string;
  staffRank: string | null;
  badgeId: string;
  categoryName: string | null;
  categoryNameUrdu: string | null;
  dutyLocation: string | null;
  beatRoute: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  notes: string | null;
}

interface RosterPdfData {
  areaName: string;
  sectorName: string;
  rosterDate: string;
  status: string;
  entries: RosterEntryRow[];
}

// ── Fetch roster data ──────────────────────────────────────

async function fetchRosterData(rosterId: string): Promise<RosterPdfData | null> {
  const [roster] = await db
    .select({
      id: dailyRosters.id,
      rosterDate: dailyRosters.rosterDate,
      status: dailyRosters.status,
      sectorId: dailyRosters.sectorId,
    })
    .from(dailyRosters)
    .where(eq(dailyRosters.id, rosterId))
    .limit(1);

  if (!roster) return null;

  const [sector] = await db
    .select({ name: sectors.name, areaId: sectors.areaId })
    .from(sectors)
    .where(eq(sectors.id, roster.sectorId))
    .limit(1);

  const [area] = await db
    .select({ name: areas.name })
    .from(areas)
    .where(eq(areas.id, sector?.areaId ?? ''))
    .limit(1);

  const entries = await db
    .select({
      staffName: staffMembers.fullName,
      staffRank: staffMembers.rank,
      badgeId: staffMembers.badgeId,
      categoryName: dutyCategories.name,
      categoryNameUrdu: dutyCategories.nameUrdu,
      dutyLocation: rosterEntries.dutyLocation,
      beatRoute: rosterEntries.beatRoute,
      shiftStart: rosterEntries.shiftStart,
      shiftEnd: rosterEntries.shiftEnd,
      notes: rosterEntries.notes,
    })
    .from(rosterEntries)
    .leftJoin(staffMembers, eq(rosterEntries.staffId, staffMembers.id))
    .leftJoin(dutyCategories, eq(rosterEntries.dutyCategoryId, dutyCategories.id))
    .where(eq(rosterEntries.rosterId, rosterId));

  return {
    areaName: area?.name ?? 'Unknown Area',
    sectorName: sector?.name ?? 'Unknown Sector',
    rosterDate: roster.rosterDate,
    status: roster.status,
    entries: entries.map((e) => ({
      staffName: e.staffName ?? 'Unknown',
      staffRank: e.staffRank,
      badgeId: e.badgeId ?? '-',
      categoryName: e.categoryName,
      categoryNameUrdu: e.categoryNameUrdu,
      dutyLocation: e.dutyLocation,
      beatRoute: e.beatRoute,
      shiftStart: e.shiftStart,
      shiftEnd: e.shiftEnd,
      notes: e.notes,
    })),
  };
}

// ── HTML template ──────────────────────────────────────────

function buildHtml(data: RosterPdfData): string {
  const formattedDate = new Date(data.rosterDate + 'T00:00:00').toLocaleDateString('en-PK', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const rows = data.entries
    .map(
      (e, i) => `
    <tr>
      <td class="sn">${i + 1}</td>
      <td class="name">${escapeHtml(e.staffName)}${e.staffRank ? `<br><small>${escapeHtml(e.staffRank)}</small>` : ''}</td>
      <td class="badge">${escapeHtml(e.badgeId)}</td>
      <td class="duty">${escapeHtml(e.categoryName ?? '-')}${e.categoryNameUrdu ? `<br><span class="urdu">${escapeHtml(e.categoryNameUrdu)}</span>` : ''}</td>
      <td class="location">${escapeHtml(e.dutyLocation ?? '-')}${e.beatRoute ? `<br><small>Route: ${escapeHtml(e.beatRoute)}</small>` : ''}</td>
      <td class="shift">${e.shiftStart ?? '-'} – ${e.shiftEnd ?? '-'}</td>
      <td class="notes">${escapeHtml(e.notes ?? '')}</td>
    </tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      padding: 20px 25px;
      background: #fff;
    }
    .header {
      text-align: center;
      border-bottom: 3px double #1A3A5C;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 18px;
      color: #1A3A5C;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .header h2 {
      font-size: 14px;
      color: #333;
      margin-top: 4px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 11px;
      color: #555;
    }
    .meta strong { color: #1A3A5C; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    thead th {
      background: #1A3A5C;
      color: #fff;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 6px;
      text-align: left;
      border: 1px solid #1A3A5C;
    }
    tbody td {
      padding: 6px;
      border: 1px solid #ddd;
      vertical-align: top;
      font-size: 10.5px;
    }
    tbody tr:nth-child(even) { background: #f8f9fa; }
    tbody tr:hover { background: #e8f0fe; }
    .sn { width: 30px; text-align: center; }
    .name { width: 130px; }
    .badge { width: 70px; text-align: center; }
    .duty { width: 110px; }
    .location { width: 130px; }
    .shift { width: 85px; text-align: center; }
    .notes { width: auto; }
    .urdu { font-size: 12px; color: #666; }
    small { color: #777; font-size: 9.5px; }
    .footer {
      text-align: center;
      font-size: 9px;
      color: #888;
      border-top: 1px solid #ddd;
      padding-top: 8px;
      margin-top: 8px;
    }
    .summary {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: #333;
      margin-bottom: 8px;
    }
    .stamp {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
    }
    .stamp-box {
      width: 200px;
      text-align: center;
      border-top: 1px solid #333;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>City Traffic Police Lahore</h1>
    <h2>Daily Duty Roster</h2>
  </div>

  <div class="meta">
    <div><strong>Area:</strong> ${escapeHtml(data.areaName)}</div>
    <div><strong>Sector:</strong> ${escapeHtml(data.sectorName)}</div>
    <div><strong>Date:</strong> ${escapeHtml(formattedDate)}</div>
    <div><strong>Status:</strong> ${escapeHtml(data.status.toUpperCase())}</div>
  </div>

  <div class="summary">
    <span>Total Staff: <strong>${data.entries.length}</strong></span>
    <span>Generated: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>S#</th>
        <th>Name / Rank</th>
        <th>Badge ID</th>
        <th>Duty Category</th>
        <th>Location / Route</th>
        <th>Shift</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" style="text-align:center;padding:20px;">No entries found</td></tr>'}
    </tbody>
  </table>

  <div class="stamp">
    <div class="stamp-box">DSP Signature</div>
    <div class="stamp-box">SSP Signature</div>
  </div>

  <div class="footer">
    CTPL Traffic Management System — Confidential — For Official Use Only
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Generate PDF buffer ────────────────────────────────────

async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath =
    process.env.CHROMIUM_PATH || (await chromium.executablePath());

  const browser = await puppeteer.launch({
    executablePath,
    args: chromium.args,
    headless: true,
    defaultViewport: chromium.defaultViewport,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ── Generate image buffer (PNG) ────────────────────────────

async function pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  // Use sharp to convert the first page to PNG
  // sharp can read PDFs if built with poppler support;
  // fallback: render HTML directly to screenshot
  try {
    const image = await sharp(pdfBuffer, { pages: 0 })
      .resize({ width: 1920 })
      .png({ quality: 90 })
      .toBuffer();
    return image;
  } catch {
    // If sharp can't read PDF, return empty — caller should use the PDF
    console.warn('[RosterPdf] sharp PDF→PNG failed, falling back to screenshot');
    return Buffer.alloc(0);
  }
}

async function htmlToScreenshot(html: string): Promise<Buffer> {
  const executablePath =
    process.env.CHROMIUM_PATH || (await chromium.executablePath());

  const browser = await puppeteer.launch({
    executablePath,
    args: chromium.args,
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
    });

    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}

// ── Public API ─────────────────────────────────────────────

export interface RosterPdfResult {
  pdf: Buffer;
  image: Buffer;
  fileName: string;
}

export async function generateRosterPdf(rosterId: string): Promise<RosterPdfResult | null> {
  const data = await fetchRosterData(rosterId);
  if (!data) return null;

  const html = buildHtml(data);
  const pdf = await htmlToPdf(html);

  // Try sharp PDF→PNG, fallback to Puppeteer screenshot
  let image = await pdfToImage(pdf);
  if (image.length === 0) {
    image = await htmlToScreenshot(html);
  }

  const safeName = `${data.sectorName.replace(/\s+/g, '_')}_${data.rosterDate}`;

  return {
    pdf,
    image,
    fileName: safeName,
  };
}

export async function generateRosterHtml(rosterId: string): Promise<string | null> {
  const data = await fetchRosterData(rosterId);
  if (!data) return null;
  return buildHtml(data);
}

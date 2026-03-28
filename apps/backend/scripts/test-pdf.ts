/**
 * Test script for PDF/Image generation
 * Usage: npx tsx scripts/test-pdf.ts [rosterId]
 *
 * Without a rosterId, generates a sample PDF with mock data.
 */
import fs from 'fs';
import path from 'path';

// Load env
import 'dotenv/config';

async function main() {
  const rosterId = process.argv[2];

  if (rosterId) {
    // Generate from actual DB roster
    const { generateRosterPdf } = await import('../src/services/rosterPdf.service');
    console.log(`Generating PDF for roster: ${rosterId}`);
    const result = await generateRosterPdf(rosterId);
    if (!result) {
      console.error('Roster not found');
      process.exit(1);
    }
    const outDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${result.fileName}.pdf`), result.pdf);
    fs.writeFileSync(path.join(outDir, `${result.fileName}.png`), result.image);
    console.log(`✓ PDF: tmp/${result.fileName}.pdf`);
    console.log(`✓ PNG: tmp/${result.fileName}.png`);
  } else {
    // Generate a sample HTML to verify Puppeteer works
    console.log('No rosterId provided — testing Puppeteer + Sharp setup...\n');

    const puppeteer = await import('puppeteer-core');
    const chromium = await import('@sparticuz/chromium');

    const execPath =
      process.env.CHROMIUM_PATH || (await chromium.default.executablePath());
    console.log(`Chromium path: ${execPath}`);

    const browser = await puppeteer.default.launch({
      executablePath: execPath,
      args: chromium.default.args,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(`
      <html>
      <body style="font-family:Arial;padding:40px;text-align:center;">
        <h1 style="color:#1A3A5C;">CTPL Traffic Management System</h1>
        <h2>PDF Generation Test</h2>
        <p>If you can read this, Puppeteer is working correctly.</p>
        <p style="color:#888;margin-top:20px;">Generated at: ${new Date().toISOString()}</p>
      </body>
      </html>
    `, { waitUntil: 'networkidle0' });

    const outDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const pdfPath = path.join(outDir, 'test-output.pdf');
    const pdfBuf = await page.pdf({ format: 'A4', printBackground: true });
    fs.writeFileSync(pdfPath, pdfBuf);
    console.log(`✓ PDF saved: tmp/test-output.pdf (${pdfBuf.length} bytes)`);

    const screenshotPath = path.join(outDir, 'test-output.png');
    const screenshot = await page.screenshot({ type: 'png', fullPage: true });
    fs.writeFileSync(screenshotPath, screenshot);
    console.log(`✓ PNG saved: tmp/test-output.png (${screenshot.length} bytes)`);

    await browser.close();

    // Test sharp
    const sharp = await import('sharp');
    const resized = await sharp.default(screenshot as Buffer)
      .resize({ width: 800 })
      .png()
      .toBuffer();
    console.log(`✓ Sharp resize: ${resized.length} bytes (800px wide)`);

    console.log('\n✓ All checks passed — PDF generation is ready.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

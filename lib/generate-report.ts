import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { LocalOrder, CapturedAsset } from "./types";

/**
 * Generate an HTML string for the order report PDF.
 */
function buildReportHtml(order: LocalOrder): string {
  const ro = order.razorOrder;
  const fullAddress = [ro.locationAddress, ro.locationCity, ro.locationState, ro.locationZip]
    .filter(Boolean)
    .join(", ");

  const reportDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const pickupDate = (ro.pickupStartDate || ro.pickupEndDate)
    ? new Date((ro.pickupStartDate || ro.pickupEndDate)!).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Not scheduled";

  // Build asset rows
  const assetRows = order.assets
    .map((asset: CapturedAsset, index: number) => {
      const capturedTime = new Date(asset.capturedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });

      const gpsInfo =
        asset.captureLatitude != null && asset.captureLongitude != null
          ? `${asset.captureLatitude.toFixed(6)}, ${asset.captureLongitude.toFixed(6)}`
          : "N/A";

      const gpsAddress = asset.captureLocationAddress || "";

      return `
        <tr>
          <td style="text-align:center;">${index + 1}</td>
          <td>${escapeHtml(asset.assetType || "Other")}</td>
          <td>${escapeHtml(asset.make)}</td>
          <td>${escapeHtml(asset.model)}</td>
          <td style="font-family:monospace;font-size:11px;">${escapeHtml(asset.serialNumber)}</td>
          <td>
            <span class="condition-badge condition-${asset.condition.toLowerCase()}">${asset.condition}</span>
          </td>
          <td style="font-size:10px;">
            ${escapeHtml(capturedTime)}<br/>
            <span style="color:#666;">${gpsInfo}</span>
            ${gpsAddress ? `<br/><span style="color:#888;font-size:9px;">${escapeHtml(gpsAddress)}</span>` : ""}
          </td>
          <td style="font-size:10px;">${escapeHtml(asset.notes || "\u2014")}</td>
        </tr>`;
    })
    .join("");

  // Signature section
  let signatureHtml = "";
  if (order.signature) {
    const sigTime = new Date(order.signature.capturedAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    signatureHtml = `
      <div class="section">
        <h2>Client Signature</h2>
        <div class="signature-block">
          <div class="signature-image">
            <img src="${order.signature.signatureBase64.startsWith('data:') ? order.signature.signatureBase64 : `data:image/png;base64,${order.signature.signatureBase64}`}" alt="Signature" />
          </div>
          <div class="signature-details">
            <div class="sig-line">
              <strong>Name:</strong> ${escapeHtml(order.signature.signerName)}
            </div>
            <div class="sig-line">
              <strong>Title:</strong> ${escapeHtml(order.signature.signerTitle)}
            </div>
            <div class="sig-line">
              <strong>Signed:</strong> ${escapeHtml(sigTime)}
            </div>
          </div>
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page { margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      color: #1a1a1a;
      line-height: 1.5;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #1B6B3A, #2D8B4E);
      color: white;
      padding: 24px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 13px;
      opacity: 0.9;
    }
    .header .report-date {
      font-size: 11px;
      opacity: 0.75;
      margin-top: 8px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section h2 {
      font-size: 14px;
      font-weight: 700;
      color: #1B6B3A;
      border-bottom: 2px solid #1B6B3A;
      padding-bottom: 6px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 24px;
    }
    .info-item {
      margin-bottom: 4px;
    }
    .info-item .label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-item .value {
      font-size: 12px;
      font-weight: 500;
      color: #1a1a1a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead th {
      background: #f0f7f2;
      color: #1B6B3A;
      font-weight: 600;
      text-align: left;
      padding: 8px 6px;
      border-bottom: 2px solid #1B6B3A;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    tbody td {
      padding: 8px 6px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .condition-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }
    .condition-excellent { background: #d1fae5; color: #065f46; }
    .condition-good { background: #d1fae5; color: #065f46; }
    .condition-fair { background: #fef3c7; color: #92400e; }
    .condition-poor { background: #fee2e2; color: #991b1b; }
    .signature-block {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }
    .signature-image {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px;
      background: #fff;
      min-width: 200px;
      max-width: 300px;
    }
    .signature-image img {
      width: 100%;
      height: auto;
    }
    .signature-details {
      flex: 1;
    }
    .sig-line {
      margin-bottom: 6px;
      font-size: 12px;
    }
    .summary-bar {
      background: #f0f7f2;
      border: 1px solid #d1e7d8;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-item .num {
      font-size: 20px;
      font-weight: 700;
      color: #1B6B3A;
    }
    .summary-item .lbl {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 10px;
      color: #999;
    }
    .no-data {
      text-align: center;
      padding: 20px;
      color: #999;
      font-style: italic;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>${escapeHtml(ro.autoName || `Order #${ro.id}`)}</h1>
    <div class="subtitle">${escapeHtml(ro.customerName || "Unknown Customer")}</div>
    <div class="report-date">Report generated: ${escapeHtml(reportDate)}</div>
  </div>

  <!-- Summary Bar -->
  <div class="summary-bar">
    <div class="summary-item">
      <div class="num">${order.assets.length}</div>
      <div class="lbl">Assets Captured</div>
    </div>
    <div class="summary-item">
      <div class="num">${order.signature ? "Yes" : "No"}</div>
      <div class="lbl">Signature</div>
    </div>
    <div class="summary-item">
      <div class="num">${escapeHtml(order.localStatus)}</div>
      <div class="lbl">Status</div>
    </div>
  </div>

  <!-- Order Details -->
  <div class="section">
    <h2>Order Details</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="label">Order Number</div>
        <div class="value">${escapeHtml(ro.autoName || String(ro.id))}</div>
      </div>
      <div class="info-item">
        <div class="label">Customer</div>
        <div class="value">${escapeHtml(ro.customerName || "N/A")}</div>
      </div>
      <div class="info-item">
        <div class="label">Pickup Date</div>
        <div class="value">${escapeHtml(pickupDate)}</div>
      </div>
      <div class="info-item">
        <div class="label">Status</div>
        <div class="value">${escapeHtml(ro.statusName || order.localStatus)}</div>
      </div>
      ${fullAddress ? `
      <div class="info-item" style="grid-column: span 2;">
        <div class="label">Pickup Address</div>
        <div class="value">${escapeHtml(fullAddress)}</div>
      </div>` : ""}
      ${ro.contactName ? `
      <div class="info-item">
        <div class="label">Contact</div>
        <div class="value">${escapeHtml(ro.contactName)}</div>
      </div>` : ""}
      ${ro.contactPhone ? `
      <div class="info-item">
        <div class="label">Phone</div>
        <div class="value">${escapeHtml(ro.contactPhone)}</div>
      </div>` : ""}
      ${ro.contactEmail ? `
      <div class="info-item" style="grid-column: span 2;">
        <div class="label">Email</div>
        <div class="value">${escapeHtml(ro.contactEmail)}</div>
      </div>` : ""}
      ${ro.notes ? `
      <div class="info-item" style="grid-column: span 2;">
        <div class="label">Notes</div>
        <div class="value">${escapeHtml(ro.notes)}</div>
      </div>` : ""}
    </div>
  </div>

  <!-- Captured Assets -->
  <div class="section">
    <h2>Captured Assets (${order.assets.length})</h2>
    ${order.assets.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>Type</th>
          <th>Make</th>
          <th>Model</th>
          <th>Serial Number</th>
          <th>Condition</th>
          <th>Captured At / GPS</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${assetRows}
      </tbody>
    </table>` : `<div class="no-data">No assets have been captured for this order.</div>`}
  </div>

  <!-- Signature -->
  ${signatureHtml || `
  <div class="section">
    <h2>Client Signature</h2>
    <div class="no-data">No signature has been collected for this order.</div>
  </div>`}

  <!-- Footer -->
  <div class="footer">
    Razor Field Companion &mdash; Electronics Recycling Asset Report<br/>
    Generated on ${escapeHtml(reportDate)}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate a PDF report for the given order and share it.
 * Returns the file URI on success, or throws on failure.
 */
export async function generateAndShareReport(order: LocalOrder): Promise<string> {
  const html = buildReportHtml(order);
  const orderName = order.razorOrder.autoName || `Order-${order.razorOrder.id}`;
  const safeFileName = orderName.replace(/[^a-zA-Z0-9-_]/g, "_");

  if (Platform.OS === "web") {
    // On web, open a new window with the HTML for printing
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
    return "web-print";
  }

  // On native, generate PDF file and share
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  await shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: `${orderName} Report`,
    UTI: "com.adobe.pdf",
  });

  return uri;
}

/**
 * Generate a PDF and open the native print dialog.
 */
export async function printReport(order: LocalOrder): Promise<void> {
  const html = buildReportHtml(order);
  await Print.printAsync({ html });
}

/**
 * Generate a PDF report and return its base64 content and a filename.
 * Used for uploading to Razor ERP Files tab.
 */
export async function generatePdfForUpload(order: LocalOrder): Promise<{
  base64: string;
  fileName: string;
}> {
  const html = buildReportHtml(order);
  const orderName = order.razorOrder.autoName || `Order-${order.razorOrder.id}`;
  const safeFileName = orderName.replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = `report_${safeFileName}_${Date.now()}.pdf`;

  if (Platform.OS === "web") {
    // On web, we cannot easily generate a file URI, so throw
    throw new Error("PDF upload to Razor ERP is not supported on web. Use a mobile device.");
  }

  // Generate the PDF file
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  // Read the PDF file as base64
  const base64Content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { base64: base64Content, fileName };
}

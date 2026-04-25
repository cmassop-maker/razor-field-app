import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { LocalOrder, CapturedAsset } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  // Handle "HH:mm" format
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  try {
    return new Date(timeStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timeStr;
  }
}

/**
 * Build HTML for a Bill of Lading document.
 */
function buildBolHtml(order: LocalOrder): string {
  const ro = order.razorOrder;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const pickupDate = formatDate(ro.pickupStartDate || ro.pickupEndDate);
  const pickupWindow =
    ro.pickupTimeWindowFrom && ro.pickupTimeWindowTo
      ? `${formatTime(ro.pickupTimeWindowFrom)} – ${formatTime(ro.pickupTimeWindowTo)}`
      : "";

  const fullAddress = ro.customerAddress || [
    ro.locationAddress,
    ro.locationCity,
    ro.locationState,
    ro.locationZip,
  ].filter(Boolean).join(", ");

  // Group assets by type for the commodity table
  const assetsByType: Record<string, CapturedAsset[]> = {};
  for (const asset of order.assets) {
    const type = asset.assetType || "Other";
    if (!assetsByType[type]) assetsByType[type] = [];
    assetsByType[type].push(asset);
  }

  const commodityRows = Object.entries(assetsByType)
    .map(([type, assets]) => {
      const makes = [...new Set(assets.map((a) => a.make).filter(Boolean))].join(", ");
      return `
        <tr>
          <td>${assets.length}</td>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(makes || "Various")}</td>
          <td>${escapeHtml(assets.map((a) => a.serialNumber).join(", "))}</td>
          <td></td>
        </tr>`;
    })
    .join("");

  // Individual asset rows
  const assetDetailRows = order.assets
    .map((asset, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${escapeHtml(asset.razorUid || asset.localId.substring(0, 8))}</td>
        <td>${escapeHtml(asset.assetType || "Other")}</td>
        <td>${escapeHtml(asset.make)}</td>
        <td>${escapeHtml(asset.model)}</td>
        <td style="font-family:monospace;font-size:10px;">${escapeHtml(asset.serialNumber)}</td>
        <td>${escapeHtml(asset.condition)}</td>
      </tr>`)
    .join("");

  // Signature section
  let signatureHtml = "";
  if (order.signature) {
    signatureHtml = `
      <div class="sig-box">
        <div class="sig-image">
          <img src="${order.signature.signatureBase64.startsWith("data:") ? order.signature.signatureBase64 : `data:image/png;base64,${order.signature.signatureBase64}`}" alt="Signature" />
        </div>
        <div class="sig-name">${escapeHtml(order.signature.signerName)}</div>
        <div class="sig-title">${escapeHtml(order.signature.signerTitle)}</div>
      </div>`;
  } else {
    signatureHtml = `
      <div class="sig-box">
        <div class="sig-line-placeholder"></div>
        <div class="sig-label">Signature</div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 12mm 10mm; size: letter; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      line-height: 1.4;
    }
    .bol-header {
      text-align: center;
      border-bottom: 3px solid #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .bol-header h1 {
      font-size: 20px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .bol-header .subtitle {
      font-size: 11px;
      color: #444;
      margin-top: 2px;
    }
    .bol-number {
      font-size: 13px;
      font-weight: 700;
      margin-top: 4px;
    }
    .row {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
    }
    .col { flex: 1; }
    .col-2 { flex: 2; }
    .box {
      border: 1px solid #000;
      padding: 6px 8px;
      margin-bottom: 6px;
    }
    .box-title {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #333;
      margin-bottom: 3px;
      letter-spacing: 0.5px;
    }
    .box-value {
      font-size: 11px;
      font-weight: 500;
      min-height: 14px;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      background: #000;
      color: #fff;
      padding: 4px 8px;
      margin: 10px 0 6px 0;
      letter-spacing: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th {
      background: #e8e8e8;
      font-weight: 700;
      text-align: left;
      padding: 5px 6px;
      border: 1px solid #000;
      font-size: 9px;
      text-transform: uppercase;
    }
    td {
      padding: 4px 6px;
      border: 1px solid #999;
      vertical-align: top;
    }
    .sig-section {
      margin-top: 16px;
      display: flex;
      gap: 24px;
    }
    .sig-box {
      flex: 1;
      text-align: center;
    }
    .sig-image {
      border: 1px solid #ccc;
      padding: 4px;
      margin-bottom: 4px;
      min-height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sig-image img {
      max-width: 200px;
      max-height: 60px;
    }
    .sig-line-placeholder {
      border-bottom: 1px solid #000;
      height: 50px;
      margin-bottom: 4px;
    }
    .sig-label {
      font-size: 9px;
      color: #666;
      text-transform: uppercase;
    }
    .sig-name {
      font-size: 11px;
      font-weight: 600;
    }
    .sig-title {
      font-size: 10px;
      color: #444;
    }
    .terms {
      font-size: 8px;
      color: #666;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #ccc;
      line-height: 1.3;
    }
    .footer {
      margin-top: 10px;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="bol-header">
    <h1>Bill of Lading</h1>
    <div class="subtitle">Straight Bill of Lading — Short Form — Not Negotiable</div>
    <div class="bol-number">BOL #: ${escapeHtml(ro.bolNumber || ro.autoName || `ORD-${ro.id}`)}</div>
  </div>

  <!-- Ship From / Ship To -->
  <div class="row">
    <div class="col">
      <div class="box">
        <div class="box-title">Ship From (Shipper)</div>
        <div class="box-value">${escapeHtml(ro.customerName || "")}</div>
        <div class="box-value">${escapeHtml(fullAddress || "")}</div>
        ${ro.contactName ? `<div class="box-value">Contact: ${escapeHtml(ro.contactName)}</div>` : ""}
        ${ro.contactPhone ? `<div class="box-value">Phone: ${escapeHtml(ro.contactPhone)}</div>` : ""}
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">Ship To (Consignee)</div>
        <div class="box-value">${escapeHtml(ro.warehouseName || "Monwire Warehouse")}</div>
        <div class="box-value">${escapeHtml(ro.repUserName ? `Rep: ${ro.repUserName}` : "")}</div>
      </div>
    </div>
  </div>

  <!-- Order Info Row -->
  <div class="row">
    <div class="col">
      <div class="box">
        <div class="box-title">Order Number</div>
        <div class="box-value">${escapeHtml(ro.autoName || String(ro.id))}</div>
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">Date</div>
        <div class="box-value">${escapeHtml(today)}</div>
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">Pickup Date</div>
        <div class="box-value">${escapeHtml(pickupDate || "TBD")}</div>
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">Pickup Window</div>
        <div class="box-value">${escapeHtml(pickupWindow || "N/A")}</div>
      </div>
    </div>
  </div>

  <!-- Additional Info -->
  <div class="row">
    <div class="col">
      <div class="box">
        <div class="box-title">Carrier / Logistics</div>
        <div class="box-value">${escapeHtml(ro.logisticTypeName || "N/A")}</div>
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">PO Number</div>
        <div class="box-value">${escapeHtml(ro.poNumber || "N/A")}</div>
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">Est. Weight</div>
        <div class="box-value">${ro.totalEstimatedWeight ? `${ro.totalEstimatedWeight} lbs` : "N/A"}</div>
      </div>
    </div>
    <div class="col">
      <div class="box">
        <div class="box-title">Pallets</div>
        <div class="box-value">${ro.palletCount ?? "N/A"}</div>
      </div>
    </div>
  </div>

  ${ro.reference1 || ro.reference2 || ro.reference3 ? `
  <div class="row">
    ${ro.reference1 ? `<div class="col"><div class="box"><div class="box-title">Reference 1</div><div class="box-value">${escapeHtml(ro.reference1)}</div></div></div>` : ""}
    ${ro.reference2 ? `<div class="col"><div class="box"><div class="box-title">Reference 2</div><div class="box-value">${escapeHtml(ro.reference2)}</div></div></div>` : ""}
    ${ro.reference3 ? `<div class="col"><div class="box"><div class="box-title">Reference 3</div><div class="box-value">${escapeHtml(ro.reference3)}</div></div></div>` : ""}
  </div>` : ""}

  <!-- Commodity Summary -->
  <div class="section-title">Commodity Description</div>
  ${Object.keys(assetsByType).length > 0 ? `
  <table>
    <thead>
      <tr>
        <th style="width:50px;">Qty</th>
        <th>Description</th>
        <th>Make(s)</th>
        <th>Serial Numbers</th>
        <th style="width:80px;">Weight</th>
      </tr>
    </thead>
    <tbody>
      ${commodityRows}
      <tr style="font-weight:700;background:#f0f0f0;">
        <td>${order.assets.length}</td>
        <td colspan="3">TOTAL PIECES</td>
        <td>${ro.totalEstimatedWeight ? `${ro.totalEstimatedWeight} lbs` : ""}</td>
      </tr>
    </tbody>
  </table>` : `<p style="padding:8px;color:#666;font-style:italic;">No items recorded.</p>`}

  <!-- Asset Detail Table -->
  ${order.assets.length > 0 ? `
  <div class="section-title">Asset Detail</div>
  <table>
    <thead>
      <tr>
        <th style="width:25px;">#</th>
        <th>UID</th>
        <th>Type</th>
        <th>Make</th>
        <th>Model</th>
        <th>Serial Number</th>
        <th>Condition</th>
      </tr>
    </thead>
    <tbody>
      ${assetDetailRows}
    </tbody>
  </table>` : ""}

  <!-- Special Instructions -->
  ${ro.onsiteNotes || ro.workInstructions || ro.receivingNotes ? `
  <div class="section-title">Special Instructions</div>
  <div class="box">
    ${ro.onsiteNotes ? `<div class="box-value"><strong>Onsite Notes:</strong> ${escapeHtml(ro.onsiteNotes)}</div>` : ""}
    ${ro.workInstructions ? `<div class="box-value"><strong>Work Instructions:</strong> ${escapeHtml(ro.workInstructions)}</div>` : ""}
    ${ro.receivingNotes ? `<div class="box-value"><strong>Receiving Notes:</strong> ${escapeHtml(ro.receivingNotes)}</div>` : ""}
  </div>` : ""}

  <!-- Signatures -->
  <div class="section-title">Signatures</div>
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-label">Shipper Signature</div>
      ${signatureHtml}
    </div>
    <div class="sig-box">
      <div class="sig-line-placeholder"></div>
      <div class="sig-label">Driver Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line-placeholder"></div>
      <div class="sig-label">Consignee Signature</div>
    </div>
  </div>

  <!-- Terms -->
  <div class="terms">
    <strong>TERMS AND CONDITIONS:</strong> The property described above is received in apparent good order, except as noted. 
    The carrier shall not be liable for any loss or damage to the goods described herein unless such loss or damage is caused by the negligence of the carrier. 
    This shipment is subject to all terms and conditions of the carrier's applicable tariff. 
    Shipper hereby certifies that the above-named materials are properly classified, described, packaged, marked, and labeled, and are in proper condition for transportation.
  </div>

  <div class="footer">
    Generated by Razor Field Companion &mdash; ${escapeHtml(today)}
  </div>

</body>
</html>`;
}

/**
 * Generate a BOL PDF and share it.
 */
export async function generateAndShareBol(order: LocalOrder): Promise<string> {
  const html = buildBolHtml(order);
  const orderName = order.razorOrder.autoName || `Order-${order.razorOrder.id}`;
  const safeFileName = orderName.replace(/[^a-zA-Z0-9-_]/g, "_");

  if (Platform.OS === "web") {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
    return "web-print";
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: `BOL - ${orderName}`,
    UTI: "com.adobe.pdf",
  });
  return uri;
}

/**
 * Generate a BOL PDF and open the native print dialog.
 */
export async function printBol(order: LocalOrder): Promise<void> {
  const html = buildBolHtml(order);
  await Print.printAsync({ html });
}

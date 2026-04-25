import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
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

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "";
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
 * Build HTML for a Work Order document.
 */
function buildWorkOrderHtml(order: LocalOrder): string {
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

  // Asset rows
  const assetRows = order.assets
    .map((asset: CapturedAsset, i: number) => {
      const capturedTime = formatDateTime(asset.capturedAt);
      const gps =
        asset.captureLatitude != null && asset.captureLongitude != null
          ? `${asset.captureLatitude.toFixed(5)}, ${asset.captureLongitude.toFixed(5)}`
          : "";
      return `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td style="font-family:monospace;font-size:10px;font-weight:600;">${escapeHtml(asset.razorUid || asset.localId.substring(0, 10))}</td>
          <td>${escapeHtml(asset.assetType || "Other")}</td>
          <td>${escapeHtml(asset.make)}</td>
          <td>${escapeHtml(asset.model)}</td>
          <td style="font-family:monospace;font-size:10px;">${escapeHtml(asset.serialNumber)}</td>
          <td>${escapeHtml(asset.condition)}</td>
          <td style="font-size:9px;">${escapeHtml(capturedTime)}${gps ? `<br/><span style="color:#666;">${gps}</span>` : ""}${asset.captureLocationAddress ? `<br/><span style="color:#888;font-size:8px;">${escapeHtml(asset.captureLocationAddress)}</span>` : ""}</td>
          <td style="font-size:9px;">${escapeHtml(asset.notes || "—")}</td>
        </tr>`;
    })
    .join("");

  // Asset summary by type
  const typeCounts: Record<string, number> = {};
  for (const a of order.assets) {
    const t = a.assetType || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const summaryRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<tr><td>${escapeHtml(type)}</td><td style="text-align:center;">${count}</td></tr>`)
    .join("");

  // Condition breakdown
  const condCounts: Record<string, number> = {};
  for (const a of order.assets) {
    condCounts[a.condition] = (condCounts[a.condition] || 0) + 1;
  }
  const condRows = Object.entries(condCounts)
    .map(([cond, count]) => `<tr><td>${escapeHtml(cond)}</td><td style="text-align:center;">${count}</td></tr>`)
    .join("");

  // Signature section
  let signatureHtml = "";
  if (order.signature) {
    const sigTime = formatDateTime(order.signature.capturedAt);
    signatureHtml = `
      <div class="sig-block">
        <div class="sig-img">
          <img src="${order.signature.signatureBase64.startsWith("data:") ? order.signature.signatureBase64 : `data:image/png;base64,${order.signature.signatureBase64}`}" alt="Signature" />
        </div>
        <div class="sig-info">
          <strong>${escapeHtml(order.signature.signerName)}</strong><br/>
          ${escapeHtml(order.signature.signerTitle)}<br/>
          <span style="color:#666;font-size:9px;">Signed: ${escapeHtml(sigTime)}</span>
        </div>
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
    .wo-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px double #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .wo-header-left h1 {
      font-size: 20px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .wo-header-left .wo-sub {
      font-size: 11px;
      color: #444;
    }
    .wo-header-right {
      text-align: right;
    }
    .wo-number {
      font-size: 16px;
      font-weight: 700;
      color: #1B6B3A;
    }
    .wo-date {
      font-size: 10px;
      color: #666;
    }
    .row {
      display: flex;
      gap: 10px;
      margin-bottom: 6px;
    }
    .col { flex: 1; }
    .field {
      border: 1px solid #bbb;
      padding: 4px 6px;
      margin-bottom: 4px;
      border-radius: 2px;
    }
    .field-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      color: #555;
      letter-spacing: 0.5px;
    }
    .field-value {
      font-size: 11px;
      font-weight: 500;
      min-height: 13px;
    }
    .section-bar {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      background: #1B6B3A;
      color: #fff;
      padding: 4px 8px;
      margin: 10px 0 6px 0;
      letter-spacing: 1px;
      border-radius: 2px;
    }
    .section-bar-dark {
      background: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th {
      background: #f0f7f2;
      color: #1B6B3A;
      font-weight: 700;
      text-align: left;
      padding: 5px 6px;
      border: 1px solid #1B6B3A;
      font-size: 9px;
      text-transform: uppercase;
    }
    td {
      padding: 4px 6px;
      border: 1px solid #ccc;
      vertical-align: top;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .summary-table th {
      background: #e8e8e8;
      color: #333;
      border-color: #999;
    }
    .summary-table td {
      border-color: #ccc;
    }
    .notes-box {
      border: 1px solid #bbb;
      padding: 8px;
      min-height: 40px;
      border-radius: 2px;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .notes-box .notes-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 4px;
    }
    .checklist {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      margin-bottom: 8px;
    }
    .check-item {
      font-size: 10px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .checkbox {
      width: 12px;
      height: 12px;
      border: 1px solid #000;
      display: inline-block;
      text-align: center;
      line-height: 12px;
      font-size: 10px;
    }
    .sig-section {
      margin-top: 12px;
      display: flex;
      gap: 20px;
    }
    .sig-block {
      flex: 1;
      border: 1px solid #ccc;
      padding: 8px;
      border-radius: 4px;
    }
    .sig-img {
      border-bottom: 1px solid #ddd;
      padding-bottom: 4px;
      margin-bottom: 4px;
      min-height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sig-img img {
      max-width: 180px;
      max-height: 50px;
    }
    .sig-info {
      font-size: 10px;
    }
    .sig-placeholder {
      flex: 1;
      border-bottom: 1px solid #000;
      min-height: 50px;
      margin-bottom: 4px;
    }
    .sig-label {
      font-size: 9px;
      color: #666;
      text-transform: uppercase;
      text-align: center;
    }
    .footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #ccc;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="wo-header">
    <div class="wo-header-left">
      <h1>Work Order</h1>
      <div class="wo-sub">Electronics Recycling &amp; Asset Recovery</div>
    </div>
    <div class="wo-header-right">
      <div class="wo-number">${escapeHtml(ro.autoName || `#${ro.id}`)}</div>
      <div class="wo-date">Date: ${escapeHtml(today)}</div>
      <div class="wo-date">Status: ${escapeHtml(ro.statusName || order.localStatus)}</div>
    </div>
  </div>

  <!-- Customer & Pickup Info -->
  <div class="row">
    <div class="col">
      <div class="field">
        <div class="field-label">Customer</div>
        <div class="field-value">${escapeHtml(ro.customerName || "N/A")}</div>
      </div>
      <div class="field">
        <div class="field-label">Pickup Address</div>
        <div class="field-value">${escapeHtml(fullAddress || "N/A")}</div>
      </div>
      ${ro.contactName ? `
      <div class="field">
        <div class="field-label">Onsite Contact</div>
        <div class="field-value">${escapeHtml(ro.contactName)}${ro.contactPhone ? ` — ${escapeHtml(ro.contactPhone)}` : ""}${ro.contactEmail ? ` — ${escapeHtml(ro.contactEmail)}` : ""}</div>
      </div>` : ""}
    </div>
    <div class="col">
      <div class="field">
        <div class="field-label">Pickup Date</div>
        <div class="field-value">${escapeHtml(pickupDate || "TBD")}</div>
      </div>
      <div class="field">
        <div class="field-label">Pickup Window</div>
        <div class="field-value">${escapeHtml(pickupWindow || "N/A")}</div>
      </div>
      <div class="field">
        <div class="field-label">Logistics</div>
        <div class="field-value">${escapeHtml(ro.logisticTypeName || "N/A")}</div>
      </div>
      <div class="field">
        <div class="field-label">Assigned Driver</div>
        <div class="field-value">${escapeHtml(ro.employee || "N/A")}</div>
      </div>
    </div>
  </div>

  <!-- Order Details -->
  <div class="row">
    <div class="col">
      <div class="field">
        <div class="field-label">Service Type</div>
        <div class="field-value">${escapeHtml(ro.serviceTypeName || "N/A")}</div>
      </div>
    </div>
    <div class="col">
      <div class="field">
        <div class="field-label">Priority</div>
        <div class="field-value">${escapeHtml(ro.priorityName || "Standard")}</div>
      </div>
    </div>
    <div class="col">
      <div class="field">
        <div class="field-label">Est. Weight</div>
        <div class="field-value">${ro.totalEstimatedWeight ? `${ro.totalEstimatedWeight} lbs` : "N/A"}</div>
      </div>
    </div>
    <div class="col">
      <div class="field">
        <div class="field-label">Pallets</div>
        <div class="field-value">${ro.palletCount ?? "N/A"}</div>
      </div>
    </div>
  </div>

  ${ro.poNumber ? `
  <div class="row">
    <div class="col">
      <div class="field">
        <div class="field-label">PO Number</div>
        <div class="field-value">${escapeHtml(ro.poNumber)}</div>
      </div>
    </div>
    ${ro.destructionTypeName ? `<div class="col"><div class="field"><div class="field-label">Destruction Type</div><div class="field-value">${escapeHtml(ro.destructionTypeName)}</div></div></div>` : `<div class="col"></div>`}
  </div>` : ""}

  <!-- Work Instructions / Notes -->
  ${ro.workInstructions || ro.onsiteNotes || ro.internalComments || ro.receivingNotes ? `
  <div class="section-bar">Instructions &amp; Notes</div>
  ${ro.workInstructions ? `<div class="notes-box"><div class="notes-label">Work Instructions</div>${escapeHtml(ro.workInstructions)}</div>` : ""}
  ${ro.onsiteNotes ? `<div class="notes-box"><div class="notes-label">Onsite Notes</div>${escapeHtml(ro.onsiteNotes)}</div>` : ""}
  ${ro.internalComments ? `<div class="notes-box"><div class="notes-label">Internal Comments</div>${escapeHtml(ro.internalComments)}</div>` : ""}
  ${ro.receivingNotes ? `<div class="notes-box"><div class="notes-label">Receiving Notes</div>${escapeHtml(ro.receivingNotes)}</div>` : ""}
  ` : ""}

  <!-- Driver Checklist -->
  <div class="section-bar section-bar-dark">Driver Checklist</div>
  <div class="checklist">
    <div class="check-item"><span class="checkbox"></span> Arrived at location</div>
    <div class="check-item"><span class="checkbox"></span> Contacted onsite person</div>
    <div class="check-item"><span class="checkbox"></span> Verified equipment list</div>
    <div class="check-item"><span class="checkbox"></span> All serials scanned</div>
    <div class="check-item"><span class="checkbox"></span> Photos taken</div>
    <div class="check-item"><span class="checkbox"></span> Signature collected</div>
    <div class="check-item"><span class="checkbox"></span> Equipment loaded</div>
    <div class="check-item"><span class="checkbox"></span> Area cleared</div>
  </div>

  <!-- Asset Summary -->
  <div class="section-bar">Asset Summary (${order.assets.length} Items)</div>
  <div class="row">
    <div class="col">
      <table class="summary-table">
        <thead><tr><th>Asset Type</th><th style="width:60px;">Count</th></tr></thead>
        <tbody>${summaryRows || `<tr><td colspan="2" style="color:#999;text-align:center;">No assets</td></tr>`}</tbody>
      </table>
    </div>
    <div class="col">
      <table class="summary-table">
        <thead><tr><th>Condition</th><th style="width:60px;">Count</th></tr></thead>
        <tbody>${condRows || `<tr><td colspan="2" style="color:#999;text-align:center;">—</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <!-- Asset Detail Table -->
  ${order.assets.length > 0 ? `
  <div class="section-bar">Asset Detail</div>
  <table>
    <thead>
      <tr>
        <th style="width:22px;">#</th>
        <th>UID</th>
        <th>Type</th>
        <th>Make</th>
        <th>Model</th>
        <th>Serial Number</th>
        <th>Cond.</th>
        <th>Captured At / Location</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${assetRows}
    </tbody>
  </table>` : ""}

  <!-- Client Signature -->
  <div class="section-bar">Signatures</div>
  <div class="sig-section">
    ${signatureHtml || `
    <div style="flex:1;">
      <div class="sig-placeholder"></div>
      <div class="sig-label">Client Signature / Date</div>
    </div>`}
    <div style="flex:1;">
      <div class="sig-placeholder"></div>
      <div class="sig-label">Driver Signature / Date</div>
    </div>
  </div>

  <div class="footer">
    Work Order generated by Razor Field Companion &mdash; ${escapeHtml(today)}
  </div>

</body>
</html>`;
}

/**
 * Generate a Work Order PDF and share it.
 */
export async function generateAndShareWorkOrder(order: LocalOrder): Promise<string> {
  const html = buildWorkOrderHtml(order);
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
    dialogTitle: `Work Order - ${orderName}`,
    UTI: "com.adobe.pdf",
  });
  return uri;
}

/**
 * Generate a Work Order PDF and open the native print dialog.
 */
export async function printWorkOrder(order: LocalOrder): Promise<void> {
  const html = buildWorkOrderHtml(order);
  await Print.printAsync({ html });
}

# Razor Field Companion — Design Document

## Overview

A mobile field app for electronics recycling drivers. Drivers use this app on-site at client locations to view assigned pickup orders from Razor ERP, capture asset information (make, model, serial number) using manual entry or camera-based scanning, collect client signatures as proof of pickup, and sync everything back to Razor ERP.

## Screen List

| Screen | Purpose |
|--------|---------|
| Login | Authenticate with Razor ERP API credentials (API URL + API key) |
| Orders (Home Tab) | List of assigned inbound orders pulled from Razor ERP |
| Order Detail | Full order info: client name, address, notes, equipment list, status |
| Asset Capture | Form to add/edit an asset: make, model, serial number, condition, notes |
| Scanner | Camera view for scanning serial numbers / barcodes via OCR |
| Signature | Full-screen signature pad for client sign-off |
| Order Summary | Review all captured assets + signature before submitting |
| Settings Tab | API configuration, sync status, offline queue, about |

## Primary Content and Functionality

### Login Screen
- Fields: Razor ERP API Base URL, API Key
- "Connect" button that validates credentials against the API
- Persists credentials in SecureStore for future sessions

### Orders Screen (Home Tab)
- Pull-to-refresh FlatList of inbound orders from Razor ERP
- Each card shows: Order number (autoName), customer name, pickup date, status badge
- Tap a card to navigate to Order Detail
- Search/filter bar at top
- Color-coded status badges: Pending (amber), In Progress (blue), Completed (green)

### Order Detail Screen
- Header: Order number, customer name, pickup address
- Section: Location details and equipment/supplies required
- Section: Captured Assets list (FlatList) with add button
- Section: Notes field (editable, syncs to order notes)
- Bottom action bar: "Capture Asset" button, "Collect Signature" button
- Once signature is collected, show "Submit to Razor" button

### Asset Capture Screen
- Form fields: Make (text input), Model (text input), Serial Number (text input with scan icon button), Condition (picker: Excellent/Good/Fair/Poor), Notes (multiline)
- Scan button opens camera scanner for serial number OCR
- Save button adds asset to the local order asset list
- Edit mode for existing assets

### Scanner Screen
- Full-screen camera viewfinder
- Supports barcode scanning (Code128, QR, etc.) via expo-camera
- Also supports text OCR for serial number plates
- Detected value auto-populates the serial number field
- Manual entry fallback always available

### Signature Screen
- Full-screen white canvas for finger drawing
- Client name / title text fields at top
- Clear button to reset
- Confirm button to save signature as base64 image
- Landscape-friendly layout

### Order Summary Screen
- Review list of all captured assets for the order
- Signature preview thumbnail
- "Submit All to Razor ERP" button
- Shows sync progress and success/failure status

### Settings Screen (Tab)
- API connection status indicator (green/red dot)
- Razor ERP URL display (editable)
- Offline queue count and manual sync button
- App version and about info
- Logout / clear credentials button

## Key User Flows

### Flow 1: View and Select Order
1. Driver opens app → sees Orders list (auto-fetched from Razor ERP)
2. Driver taps an order card → Order Detail screen
3. Driver reviews client info, address, and any existing notes

### Flow 2: Capture Assets On-Site
1. From Order Detail, driver taps "Capture Asset"
2. Asset Capture form opens with empty fields
3. Driver enters Make and Model manually
4. Driver taps scan icon next to Serial Number → Scanner opens
5. Camera detects barcode/serial → auto-fills serial number field
6. Driver selects condition, optionally adds notes
7. Driver taps "Save Asset" → returns to Order Detail with asset added
8. Repeat for additional assets

### Flow 3: Collect Signature
1. From Order Detail, driver taps "Collect Signature"
2. Signature screen opens with blank canvas
3. Client signs with finger on screen
4. Client enters name/title
5. Driver taps "Confirm" → signature saved, returns to Order Detail

### Flow 4: Submit to Razor ERP
1. Driver reviews all captured assets and signature on Order Summary
2. Taps "Submit All to Razor ERP"
3. App sends each asset via POST /api/v1/Asset
4. App uploads signature via POST /api/v1/InboundOrder/file-upload/{id}
5. App updates order notes via PATCH /api/v1/InboundOrder/{id}/notes
6. Success confirmation shown; order marked as completed locally

### Flow 5: Offline Mode
1. If no network, captured assets and signatures are queued locally
2. Settings tab shows pending sync count
3. When connectivity returns, driver taps "Sync Now" or auto-sync triggers
4. Queued items are sent to Razor ERP in order

## Color Choices

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #1B6B3A | #2ECC71 | Green — recycling industry brand, action buttons |
| background | #FFFFFF | #121212 | Screen backgrounds |
| surface | #F0F4F0 | #1E2A1E | Cards, elevated surfaces (slight green tint) |
| foreground | #1A1A1A | #E8E8E8 | Primary text |
| muted | #6B7280 | #9CA3AF | Secondary text, labels |
| border | #D1D5DB | #374151 | Dividers, card borders |
| success | #16A34A | #4ADE80 | Completed status, sync success |
| warning | #D97706 | #FBBF24 | Pending status, alerts |
| error | #DC2626 | #F87171 | Failed sync, validation errors |

The green primary color reflects the electronics recycling / sustainability brand identity. The surface color has a subtle green tint to reinforce the environmental theme.

## Navigation Structure

- Tab Navigator (2 tabs):
  - Orders (home icon) → Stack: Orders List → Order Detail → Asset Capture / Scanner / Signature / Summary
  - Settings (gear icon)
- Modal: Scanner (presented modally over Asset Capture)

## Typography

- Headers: System bold, 24-28pt
- Body: System regular, 16pt
- Labels: System medium, 14pt
- Captions: System regular, 12pt, muted color

## Interaction Patterns

- Pull-to-refresh on Orders list
- Haptic feedback on primary actions (save, submit, scan detect)
- Scale press feedback on buttons (0.97)
- Swipe-to-delete on asset list items
- Loading spinners during API calls
- Toast notifications for success/error states

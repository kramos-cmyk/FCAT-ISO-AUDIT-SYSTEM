# FCAT ISO Audit Management System

Full-stack Node.js + Express + React/TypeScript conversion of the FCAT ISO 9001:2015 Corrective Action Report (`FO-RI-05`) management portal, ready for GitHub and Render deployment.

## Features
- **Role-Based Access**: Auditor Accounts (`Admin`) and Process Owners (`Employee`, multi-department capable).
- **CAR / NC / OFI Lifecycle**: Finding details, repeatable immediate corrections, 5-Whys Contributing Factors (`Man`, `Method`, `Machine`, `Material`, `Environment`), root cause validation, corrective action plans, multi-file evidence uploads, sign-off, and Auditor follow-up history.
- **Collaboration & Notifications**: CAR comments, Auditor deadlines with overdue indicators, department notifications with mark-as-read, and Company Announcements with image attachments and edit history.
- **Direct PDF Export**: Generates official `FO-RI-05 Corrective Action Report.pdf` server-side via PDFKit.
- **Dual Database & Existing Google Sheet Support**:
  - Works out of the box with a persistent **SQLite database** (`better-sqlite3`).
  - Can connect directly to your **existing Google Sheet** (matching all 12 Apps Script tabs: `Users`, `CAR_Records`, `CAR_WhyWhy`, `Notifications`, `CompanyDetails`, `Settings`, `AuditLog`, `CAR_Comments`, `Announcements`, `Announcement_History`, `Announcement_Comments`, `Departments`).
  - Includes a built-in **Import / Backup Sync tool** under **Company Details** for Auditors.

## Default Seeded Admin Account
- **Email:** `admin@fcat.com.ph`
- **Password:** `FCATsince1993!`
*(Change this immediately after your first login under **My Profile**.)*

---

## Deploying to Render from GitHub

1. **Push this repository to GitHub.**
2. **Create a Web Service on Render** (or use the included `render.yaml` Blueprint):
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
3. **Add a Persistent Disk on Render** (recommended when using SQLite & local file uploads):
   - Mount Path: `/var/data`
   - Set environment variables:
     - `DB_PATH=/var/data/fcat_audit.db`
     - `UPLOAD_DIR=/var/data/uploads`
     - `JWT_SECRET=<generate a strong random string>`

---

## Connecting Your Existing Google Sheet (Optional)

If you want the live app to read/write directly to your existing Google Spreadsheet:

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Sheets API** (and optionally **Google Drive API**).
2. Create a **Service Account** and download its JSON key.
3. Open your existing Google Sheet and click **Share**, then add the Service Account's `client_email` as **Editor**.
4. Copy the Spreadsheet ID from the URL (`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`).
5. Set these Environment Variables in Render (or `.env` locally):
   - `GOOGLE_SPREADSHEET_ID=<your spreadsheet ID>`
   - `GOOGLE_SERVICE_ACCOUNT_JSON=<paste the entire JSON key on one line>`
   - *(Optional)* `GOOGLE_DRIVE_EVIDENCE_FOLDER_ID` and `GOOGLE_DRIVE_ANNOUNCEMENT_FOLDER_ID` (share those Drive folders with the Service Account email as Editor).

When both variables are set, the app automatically connects to your Google Sheet on startup and preserves compatibility with existing `Users` password hashes.

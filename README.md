# Comunify Multi-Tenant Enterprise SaaS Platform
**Developers By- quisoft.in**

Comunify is a multi-tenant enterprise-grade Community Management Software-as-a-Service (SaaS) platform. It allows unlimited housing societies to onboard, configure custom billing schedules, monitor smart meters, manage gate visitors with QR pass verification, stream public CCTV feeds, coordinate e-voting resolutions, and interact with a resident AI Assistant.

This platform implements strict **logical database isolation** using dynamic Mongoose connection switching to ensure tenant data privacy.

---

## Technical Specifications
- **Runtime:** Node.js (v20+)
- **Framework:** Express.js
- **Database:** MongoDB & Mongoose (Multi-database connection pool)
- **Styling:** Vanilla CSS (Modern Dark & Glassmorphic theme)
- **Visualization:** Chart.js (Dashboard metrics, platform revenue, e-voting results)
- **Integrations:** Stripe SDK (Maintenance checkout), html2pdf.js (Invoice PDF generation)

---

## Portals & Roles
1. **Super Admin Portal:** Manage society onboarding, subscription plans (Bronze, Silver, Gold, Enterprise), revenue dashboards, and broadcast system announcements.
2. **Society Admin Portal:** Manage Wings/Towers, flat allocations, approve resident registrations, configure monthly maintenance schedules, and audit helpdesk logs.
3. **Committee Member Portal:** Create resolution voting pools, generate announcements via the AI Notice tool, and audit emergency networks.
4. **Security Guard Portal:** Register manual visitors, scan guest QR gate passes, catalog package deliveries, log wrong-parking violations, and broadcast SOS alarms.
5. **Resident Portal (Owner/Tenant/Resident):** Pre-approve visitor QR passes, request NOCs, vote on AGM polls, purchase marketplace items, pay bills, and chat with the AI Resident Assistant.

---

## Installation & Setup

### Local Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure your environment variables in `.env`:
   ```env
   MONGO_URI=mongodb://localhost:27017/comunify
   SESSION_SECRET=danish_society_secret_key
   SECRET_KEY=sk_test_stripe_secret_key
   PORT=3000
   ```
3. Start the application:
   ```bash
   npm run dev
   ```
4. Access the portal at `http://localhost:3000`.

### Containerized Deployment (Docker)
1. Build and run via Docker Compose:
   ```bash
   docker-compose up --build -d
   ```
2. The platform web server will spin up on port `3000` and link to an isolated local MongoDB instance container.

---

## API Documentation

### 1. Authentication
- `POST /login` - User login credentials check.
- `GET /logout` - Clear user session.
- `POST /signup` - Resident signup (places user in 'applied' standby state).
- `POST /register` - Register a new society (places society in 'pending' standby state).

### 2. Super Admin Portal
- `GET /superadmin` - Panel overview of all onboarded societies, revenue analytics, and audit logs.
- `POST /superadmin/society/approve` - Approve pending society onboarding.
- `POST /superadmin/society/suspend` - Suspend society access.
- `POST /superadmin/society/change-plan` - Change subscription tier and storage quota mapping.
- `POST /superadmin/broadcast` - Broadcast announcement notice to all society noticeboards.

### 3. Maintenance Billing & Utilities
- `GET /bill` - Retrieve invoice particulars, smart meter metrics, and e-receipts.
- `POST /bill/simulate-payment` - Locally simulate invoice payment and update receipt logs.
- `POST /editBill` - Update society maintenance base charges configuration.

### 4. Visitor Management & Security
- `GET /guard` - Guard desk check-in queue, parcel registers, and active visitor counts.
- `POST /guard/visitor/verify-qr` - Verify resident pre-approved guest QR codes.
- `POST /guard/visitor/manual-entry` - Log manual gate check-in.
- `POST /guard/visitor/checkout` - Mark visitor checkout.
- `POST /guard/sos/trigger` - Broadcast society-wide emergency alert.

### 5. AI Assistant Operations
- `POST /home/ai-assistant` - Conversation endpoint. Resolves context-aware questions (dues, receipts, visitor logs, AGM schedule).
- `POST /notice/ai-generate` - Generates notice text from shorthand description.

### 6. Document Vault
- `GET /documents` - Review society bylaws, AGM minutes, invoices.
- `POST /documents/upload` - Upload file to tenant directory (adds to society storage quota).
- `POST /documents/noc/request` - Submit resident NOC certificate request.

---

**Developers By- quisoft.in**

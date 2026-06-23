# Credit Analyzer — USB Fulfillment Tool

Internal admin tool for generating customer Keygen licenses and preparing
USB drives for shipping. This is **separate from and does not modify**
the customer-facing Credit Analyzer application.

---

## What this does

1. Enter or import customer information.
2. Generate a unique Keygen license for that customer.
3. Detect a connected USB drive.
4. Format it (exFAT, labeled `CREDIT_ANALYZER`).
5. Copy the production installers onto it.
6. Write the customer's license to `license.json`.
7. Generate a `START-HERE.pdf` that tells the customer what's on the drive.
8. Verify everything is present and correct.
9. Log a fulfillment record.
10. Mark the USB **Ready To Ship**.

## A Note On The License File

The license is written to a top-level `license.json` file:

```json
{
  "licenseKey": "7JHF-XLVN-JT4E-WXCU-TJ43-FCX3-PEEV-UPTH",
  "customerName": "Customer Name",
  "customerEmail": "customer@email.com",
  "product": "Credit Report Analyzer Pro"
}
```

The fulfillment UI only shows a **masked** version of the key. The full key is
used server-side to write `license.json`, then discarded from memory.

If you want stronger anti-sharing protection than file-level masking,
the right tool is **Keygen device binding / activation limits** on your
policy, so a copied `license.json` won't activate past your configured
seat count — not concealment of the file itself.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

> **Note:** `better-sqlite3` compiles a native module on install. If you're
> on a machine without build tools, install them first:
> - macOS: `xcode-select --install`
> - Windows: `npm install --global windows-build-tools` (run as admin) or install Visual Studio Build Tools
> - Linux: `sudo apt install build-essential python3`

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

```
KEYGEN_ACCOUNT_ID=your-keygen-account-id
KEYGEN_PRODUCT_ID=your-keygen-product-id
KEYGEN_POLICY_ID=your-keygen-policy-id
KEYGEN_API_TOKEN=your-keygen-api-token

ADMIN_API_SECRET=          # generate with the command below
ADMIN_SEED_EMAIL=you@yourcompany.com
ADMIN_SEED_PASSWORD=choose-a-strong-password

APP_VERSION=1.0.0
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The seed admin account is only created the **first time** the database
file is initialized. Change the password via the database directly (or
add a password-change route) for ongoing use — don't leave seed
credentials as the permanent login.

### 3. Add production installers

Place these two files in `/installers`:

- `CreditAnalyzer-Windows.exe`
- `CreditAnalyzer-Mac.dmg`

Run `npm run usb:prepare` to confirm both are present.

### 4. Run it

```bash
npm run usb:dev
```

This starts the backend (port 4001) and frontend (port 5173) together.
Open `http://localhost:5173` and log in with your seed admin credentials.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run usb:dev` | Runs backend + frontend together for local development |
| `npm run usb:build` | Builds the frontend for production |
| `npm run usb:prepare` | Verifies both installer files exist before a fulfillment session |

---

## Project structure

```
/usb-fulfillment-tool
  /src                  React frontend
    /components         Dashboard sections (Customer, USB Detection, etc.)
    /pages               Login + Dashboard
    /hooks               useAuth
    /services            api.js — talks to the backend
  /server                Express backend
    /routes              auth, customer/license, USB, bulk import
    /services            Keygen, USB detection, format, write, verify
    /middleware          JWT auth guard
    /scripts             Installer presence check
  /installers            Drop production .exe/.dmg here (gitignored)
  /logs                  Reserved for future log output (gitignored)
  .env.example
```

---

## Security notes

- The frontend **never** receives a full Keygen license key — only a
  masked version for display.
- `ADMIN_API_SECRET`, `KEYGEN_API_TOKEN`, and all other secrets stay
  server-side, read from `.env`, never sent to the browser.
- All `/admin/*` routes require a valid JWT obtained via `/admin/auth/login`.
- The fulfillment database stores only masked license values — never the
  full key at rest.
- Never put OpenAI, Claude, Railway, or Keygen admin keys inside the app or USB.
- The customer-facing app should call Railway for `/api/license/activate`,
  `/api/license/validate`, `/api/analyze-report`, and `/api/generate-letter`.
- A defensive check in `usbWriteService.js` refuses to write any of:
  `src`, `server`, `node_modules`, `.env`, `.env.local`, `package.json`,
  `package-lock.json`, `.git`, `logs` to a customer USB, even if called
  incorrectly elsewhere in the code.

---

## What's NOT included on the customer USB

By design, the only things ever written to a customer drive are:

```
CreditAnalyzer-Windows.exe
CreditAnalyzer-Mac.dmg
license.json
START-HERE.pdf
```

Nothing else — no source code, no `.env`, no backend files, no build
tooling, no database files.

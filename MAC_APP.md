# Credit Analyzer USB Key Mac App

This project now builds a local macOS desktop app with no operator login.

## Run Locally

```bash
npm run mac:dev
```

If your shell has `ELECTRON_RUN_AS_NODE=1`, the script unsets it before
launching Electron.

## Build Installer

```bash
npm run mac:build
```

Generated files:

- `dist/Credit Analyzer USB Key-1.0.0.dmg`
- `dist/Credit Analyzer USB Key-1.0.0-mac.zip`
- `dist/mac/Credit Analyzer USB Key.app`

The local build is unsigned unless an Apple Developer ID certificate is
available. Unsigned builds may require right-clicking the app and choosing
Open, or signing/notarizing before distribution.

## Required Runtime Configuration

For development, the app reads `.env` from this project folder.

For an installed packaged app, create:

```text
~/Library/Application Support/Credit Analyzer USB Key/.env
```

with:

```text
KEYGEN_ACCOUNT_ID=your-keygen-account-id
KEYGEN_PRODUCT_ID=your-keygen-product-id
KEYGEN_POLICY_ID=your-keygen-policy-id
KEYGEN_API_TOKEN=your-keygen-api-token
APP_VERSION=1.0.0
```

The app stores its local fulfillment database in the same Application Support
folder.

You can create/open that file by double-clicking:

```text
Linked Mac App Install/Configure Keygen.command
```

Railway environment variables configure the Railway backend only. They do not
automatically configure this local Mac fulfillment app.

## Required Installer Files

Put production installers in `installers/` before building:

- `CreditAnalyzer-Windows.exe`
- `CreditAnalyzer-Mac.dmg`

Packaged builds include the contents of `installers/` as app resources.

## USB Key Behavior

The one-button flow:

1. Uses the selected customer.
2. Requires exactly one mounted removable USB drive.
3. Creates a fresh Keygen license.
4. Copies `CreditAnalyzer-Windows.exe` and `CreditAnalyzer-Mac.dmg` to the USB.
5. Writes `license.json`.
6. Writes `START-HERE.pdf`.
7. Records the fulfillment locally.

Each prepared USB should contain only:

```text
CreditAnalyzer-Windows.exe
CreditAnalyzer-Mac.dmg
license.json
START-HERE.pdf
```

`license.json` is written as:

```json
{
  "licenseKey": "7JHF-XLVN-JT4E-WXCU-TJ43-FCX3-PEEV-UPTH",
  "customerName": "Customer Name",
  "customerEmail": "customer@email.com",
  "product": "Credit Report Analyzer Pro"
}
```

The customer-facing Credit Analyzer app must read `license.json` from the
plugged-in USB at launch/runtime and reject access when the USB key is not
present.

## Customer App Runtime Checks

The installed Credit Analyzer app should unlock only after all checks pass:

1. USB is plugged in.
2. USB contains `license.json`.
3. License key matches Keygen.
4. License is active.
5. Current computer is allowed by Keygen machine policy.

If the USB is removed, show:

```text
USB License Key Not Detected
Please plug in your Credit Analyzer USB to continue.
```

Keygen must still control access. Configure the policy with:

- Max Machines = 1
- Machine Matching = Match All
- License Status gates = Active / Expired / Suspended

Do not put OpenAI, Claude, Railway, or Keygen admin secrets inside the app or
USB. The customer app should call the Railway backend for:

- `/api/license/activate`
- `/api/license/validate`
- `/api/analyze-report`
- `/api/generate-letter`

## Publishing Flow

For every customer:

1. Customer pays.
2. Create/select the customer in this app.
3. This app creates a license in Keygen.
4. This app creates `license.json`.
5. This app copies the installer files and license file to USB.
6. Ship the USB.
7. Customer installs Credit Analyzer.
8. Customer plugs in USB.
9. Credit Analyzer reads `license.json`.
10. Credit Analyzer validates with Railway and Keygen.
11. Credit Analyzer unlocks.

If a customer stops paying, suspend the license in Keygen. The next time the
customer app calls `/api/license/validate`, the Railway backend should return a
locked/invalid response and the app should lock.

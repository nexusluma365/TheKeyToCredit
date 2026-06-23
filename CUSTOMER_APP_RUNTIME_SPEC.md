# Customer App Runtime License Checks

This USB fulfillment app prepares the USB key. The customer-facing Credit
Analyzer app must enforce access at runtime.

## Required USB Contents

Each prepared USB contains:

```text
CreditAnalyzer-Windows.exe
CreditAnalyzer-Mac.dmg
license.json
START-HERE.pdf
```

`license.json` must use this shape:

```json
{
  "licenseKey": "7JHF-XLVN-JT4E-WXCU-TJ43-FCX3-PEEV-UPTH",
  "customerName": "Customer Name",
  "customerEmail": "customer@email.com",
  "product": "Credit Report Analyzer Pro"
}
```

## Unlock Rules

The customer-facing app should unlock the dashboard only when all checks pass:

1. A USB drive is plugged in.
2. The USB contains `license.json`.
3. `license.json.product` equals `Credit Report Analyzer Pro`.
4. The license key matches Keygen through the Railway backend.
5. The license status is active.
6. The current computer is allowed by Keygen machine policy.

If the USB is removed, lock the dashboard and show:

```text
USB License Key Not Detected
Please plug in your Credit Analyzer USB to continue.
```

## Keygen Policy

Keygen remains the source of truth. Configure the policy so copied USBs do not
unlock extra computers:

```text
Max Machines = 1
Machine Matching = Match All
License Status = Active / Expired / Suspended
```

If a customer stops paying, suspend the license in Keygen. The next validation
call should lock the app.

## Railway Backend

The customer app should call Railway for:

```text
POST /api/license/activate
POST /api/license/validate
POST /api/analyze-report
POST /api/generate-letter
```

Never put OpenAI, Claude, or Keygen admin keys inside:

- the customer-facing app
- this USB fulfillment app
- `license.json`
- the USB drive

Only the Railway backend should hold server-side API secrets.

## Publishing Flow

For every customer:

1. Customer pays.
2. Create/select the customer in the USB fulfillment app.
3. The fulfillment app creates a license in Keygen.
4. The fulfillment app creates `license.json`.
5. The fulfillment app copies the installer files and `license.json` to USB.
6. Ship the prepared USB.
7. Customer installs Credit Analyzer.
8. Customer plugs in the USB.
9. Credit Analyzer reads `license.json`.
10. Credit Analyzer validates with Railway and Keygen.
11. Credit Analyzer unlocks only when the license is active and this computer is allowed.

If the customer stops paying, suspend the license in Keygen. On the next
`/api/license/validate` call, Railway should return a locked/invalid response
and Credit Analyzer should lock the dashboard.

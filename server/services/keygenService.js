import fetch from 'node-fetch';

const KEYGEN_API_BASE = 'https://api.keygen.sh/v1';

function assertConfigured() {
  const required = ['KEYGEN_ACCOUNT_ID', 'KEYGEN_PRODUCT_ID', 'KEYGEN_POLICY_ID', 'KEYGEN_API_TOKEN'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Keygen is not configured. Missing env vars: ${missing.join(', ')}`);
  }
}

/**
 * Masks a license key for display/storage purposes.
 * Full key is NEVER returned from this module's exported functions
 * except createLicenseForCustomer's internal-only return value, which
 * routes must not forward to the frontend response body.
 */
export function maskLicense(fullKey) {
  if (!fullKey || fullKey.length < 8) return '••••-••••';
  const visible = fullKey.slice(-4);
  return `••••-••••-••••-${visible}`;
}

/**
 * Creates a new Keygen license tied to a customer.
 * Returns both the full key (for one-time use writing license.json)
 * and a masked version (safe for UI/logs). Callers MUST discard
 * the full key after writing it to the USB and must never send it
 * to the frontend.
 */
export async function createLicenseForCustomer(customer) {
  assertConfigured();

  const accountId = process.env.KEYGEN_ACCOUNT_ID;

  const response = await fetch(`${KEYGEN_API_BASE}/accounts/${accountId}/licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      Authorization: `Bearer ${process.env.KEYGEN_API_TOKEN}`,
    },
    body: JSON.stringify({
      data: {
        type: 'licenses',
        attributes: {
          metadata: {
            customerId: customer.id,
            customerEmail: customer.email,
            customerName: `${customer.firstName} ${customer.lastName}`,
            orderId: customer.orderId || null,
          },
        },
        relationships: {
          policy: { data: { type: 'policies', id: process.env.KEYGEN_POLICY_ID } },
          product: { data: { type: 'products', id: process.env.KEYGEN_PRODUCT_ID } },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Keygen license creation failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  const fullKey = json.data.attributes.key;
  const keygenLicenseId = json.data.id;

  return {
    fullKey, // sensitive — caller must not log or forward to frontend
    keygenLicenseId,
    masked: maskLicense(fullKey),
  };
}

/**
 * Revokes/suspends a license in Keygen, e.g. if a fulfillment is cancelled.
 */
export async function suspendLicense(keygenLicenseId) {
  assertConfigured();
  const accountId = process.env.KEYGEN_ACCOUNT_ID;

  const response = await fetch(
    `${KEYGEN_API_BASE}/accounts/${accountId}/licenses/${keygenLicenseId}/actions/suspend`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${process.env.KEYGEN_API_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Keygen license suspension failed (${response.status}): ${body}`);
  }

  return true;
}

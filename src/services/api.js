const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4001';

function getToken() {
  return sessionStorage.getItem('admin_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    Object.assign(error, data);
    throw error;
  }

  return data;
}

export const api = {
  login: (email, password) =>
    request('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getCustomers: () => request('/admin/customers'),

  createCustomer: (payload) =>
    request('/admin/create-customer', { method: 'POST', body: JSON.stringify(payload) }),

  deleteCustomer: (id) => request(`/admin/customers/${id}`, { method: 'DELETE' }),

  getCustomer: (id) => request(`/admin/customers/${id}`),

  generateLicense: (customerId) =>
    request('/admin/create-customer-license', { method: 'POST', body: JSON.stringify({ customerId }) }),

  detectUsb: () => request('/admin/usb/detect'),

  formatUsb: (devicePath, mountPath, confirmationText) =>
    request('/admin/usb/format', {
      method: 'POST',
      body: JSON.stringify({ devicePath, mountPath, confirmationText }),
    }),

  prepareUsbRecord: (payload) =>
    request('/admin/prepare-usb-record', { method: 'POST', body: JSON.stringify(payload) }),

  shipUsb: (recordId) =>
    request('/admin/ship-usb', { method: 'POST', body: JSON.stringify({ recordId }) }),

  getFulfillmentRecords: () => request('/admin/fulfillment-records'),

  fulfillCustomer: (payload) =>
    request('/admin/local/fulfill-customer', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bulkImport: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/admin/bulk/import', { method: 'POST', body: formData });
  },

  configStatus: () => request('/admin/config-status'),
};

export { getToken };

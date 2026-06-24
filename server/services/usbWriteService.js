import fs from 'fs/promises';
import path from 'path';

export const USB_FILES = {
  windowsInstaller: 'CreditAnalyzer-Windows.exe',
  macInstaller: 'CreditAnalyzer-Mac.dmg',
  license: 'license.json',
  startHere: 'START-HERE.pdf',
};

export const PRODUCT_NAME = 'Credit Report Analyzer Pro';

const INSTALLER_SOURCES = [
  {
    destination: USB_FILES.windowsInstaller,
    candidates: [
      USB_FILES.windowsInstaller,
      'CreditAnalyzer Setup.exe',
      'Credit Report Analyzer Pro Setup 0.1.0.exe',
    ],
  },
  {
    destination: USB_FILES.macInstaller,
    candidates: [
      USB_FILES.macInstaller,
      'CreditAnalyzer.dmg',
      'Credit Report Analyzer Pro-0.1.0.dmg',
    ],
  },
];

/**
 * Files that must NEVER be written to a customer USB, even by accident.
 * Used as a defensive check before any copy operation.
 */
const FORBIDDEN_NAMES = [
  'src', 'server', 'node_modules', '.env', '.env.local',
  'package.json', 'package-lock.json', '.git', 'logs',
];

function assertNotForbidden(filename) {
  const base = path.basename(filename).toLowerCase();
  if (FORBIDDEN_NAMES.some((f) => base === f.toLowerCase())) {
    throw new Error(`Refusing to write forbidden file/folder to USB: ${filename}`);
  }
}

async function findInstallerSource(installersDir, candidates) {
  for (const filename of candidates) {
    const sourcePath = path.join(installersDir, filename);
    try {
      await fs.access(sourcePath);
      return { filename, sourcePath };
    } catch {
      // Try the next supported build output name.
    }
  }

  return null;
}

export async function assertUsbWritable(usbMountPath) {
  if (!usbMountPath) {
    const err = new Error('USB License Key Not Detected. Please plug in your Credit Analyzer USB to continue.');
    err.code = 'USB_DISCONNECTED';
    throw err;
  }

  try {
    const stat = await fs.stat(usbMountPath);
    if (!stat.isDirectory()) throw new Error('USB mount path is not a directory.');
    await fs.access(usbMountPath);
  } catch {
    const err = new Error('USB has been disconnected. Reconnect the USB and try again.');
    err.code = 'USB_DISCONNECTED';
    err.mountPath = usbMountPath;
    throw err;
  }
}

/**
 * Copies the two production installers onto the USB.
 */
export async function copyInstallers(installersDir, usbMountPath) {
  const copied = [];
  await assertUsbWritable(usbMountPath);

  for (const installer of INSTALLER_SOURCES) {
    await assertUsbWritable(usbMountPath);
    assertNotForbidden(installer.destination);

    const source = await findInstallerSource(installersDir, installer.candidates);
    if (!source) {
      throw new Error(
        `Missing required installer in ${installersDir}: ${installer.destination}. ` +
        `Also checked: ${installer.candidates.join(', ')}`
      );
    }

    const dest = path.join(usbMountPath, installer.destination);
    await fs.copyFile(source.sourcePath, dest);
    await assertUsbWritable(usbMountPath);
    copied.push({ source: source.filename, destination: installer.destination });
  }

  return copied;
}

/**
 * Writes the customer license payload read by the customer-facing app.
 * The full license key is intentionally present on the USB, but Keygen
 * remains the source of truth for activation, machine limits, and status.
 */
export async function writeLicenseJson(usbMountPath, customer, fullLicenseKey) {
  await assertUsbWritable(usbMountPath);
  assertNotForbidden(USB_FILES.license);
  const payload = {
    licenseKey: fullLicenseKey,
    customerName: `${customer.first_name} ${customer.last_name}`,
    customerEmail: customer.email,
    product: PRODUCT_NAME,
  };

  const filePath = path.join(usbMountPath, USB_FILES.license);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await assertUsbWritable(usbMountPath);
  return filePath;
}

/**
 * Generates a small customer-facing PDF.
 */
export async function writeStartHerePdf(usbMountPath) {
  await assertUsbWritable(usbMountPath);
  assertNotForbidden(USB_FILES.startHere);

  const lines = [
    'Welcome to Credit Report Analyzer Pro',
    '',
    '1. Keep this USB plugged in while using the app.',
    `2. Windows installer: ${USB_FILES.windowsInstaller}`,
    `3. Mac installer: ${USB_FILES.macInstaller}`,
    `4. The license is stored in ${USB_FILES.license}.`,
    '5. The app validates this USB license through the secure backend.',
    '6. Keygen controls active, expired, suspended, and machine access.',
    '7. If the USB is removed, plug it back in to continue.',
    '8. Do not delete, rename, or edit license.json.',
    '',
    'Need help? Contact support with your order information.',
  ];

  const filePath = path.join(usbMountPath, USB_FILES.startHere);
  await fs.writeFile(filePath, createSimplePdf(lines));
  await assertUsbWritable(usbMountPath);
  return filePath;
}

function escapePdfText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createSimplePdf(lines) {
  const content = [
    'BT',
    '/F1 20 Tf',
    '72 720 Td',
    ...lines.flatMap((line, index) => {
      const font = index === 0 ? ['/F1 20 Tf'] : index === 1 ? ['/F1 12 Tf'] : [];
      return [...font, `(${escapePdfText(line)}) Tj`, '0 -28 Td'];
    }),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf-8');
}

import QRCode from 'qrcode';
import { zipSync, strToU8 } from 'fflate';
import type { ExportedBusinessCode } from '../services/api';

/**
 * Builds the "download all QR codes" zip: one PNG per business, named after
 * the business, plus codes.csv listing each business's typed code so the
 * chamber can print it under the QR as a fallback when a scan will not read.
 *
 * The PNGs encode exactly what the single-business QR dialog and the business
 * page encode, the bare code, so a poster made from either source scans the
 * same way.
 */

/** File names that survive Windows, macOS and the zip format. */
const fileSafe = (name: string) =>
  name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80) || 'Business';

/**
 * Quote a CSV cell, and defuse anything Excel would run as a formula. A
 * business name is chamber-entered, but it came in through a CSV upload.
 */
const csvCell = (value: string) => {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
};

const dataUrlBytes = (url: string) => {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const buildQrZip = async (
  codes: ExportedBusinessCode[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> => {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const rows: string[][] = [['Business', 'Town', 'Typed Code', 'QR File']];
  const sorted = [...codes].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const base = fileSafe(c.name);
    let file = `${base}.png`;
    // Two branches of the same business can share a name.
    for (let n = 2; used.has(file.toLowerCase()); n++) file = `${base} (${n}).png`;
    used.add(file.toLowerCase());

    // Level H matches the business page, and 1024px prints cleanly at poster size.
    const png = await QRCode.toDataURL(c.code, { errorCorrectionLevel: 'H', width: 1024, margin: 2 });
    files[`QR Codes/${file}`] = dataUrlBytes(png);
    rows.push([c.name, c.town, c.code, file]);
    onProgress?.(i + 1, sorted.length);
  }

  // BOM so Excel opens it as UTF-8 and accented business names survive.
  files['codes.csv'] = strToU8('﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'));

  // PNG is already compressed, so storing beats deflating it again.
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
};

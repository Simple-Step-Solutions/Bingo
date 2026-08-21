import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

/**
 * Serialize an inline <svg> element to a data URL usable as an <img> src.
 *
 * Uses percent-encoding rather than btoa: btoa throws on any code point above
 * U+00FF, so a business name with a curly apostrophe or an accent was enough to
 * break the QR download and print sheet.
 */
export function svgToDataUrl(svg: Element): string {
  const markup = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/**
 * Collision-resistant document id.
 *
 * Replaces `Math.random().toString(36).substr(2, 9)`, which used a deprecated
 * API, drew from a non-cryptographic PRNG, and produced a variable-length string
 * (trailing zeros get dropped) with far less entropy than it looks. Business ids
 * are written with setDoc, so a collision silently overwrites a real business.
 */
export function newDocId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

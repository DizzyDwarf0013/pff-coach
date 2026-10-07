// Minimal RFC 4180 CSV parser plus a client-list mapper (for website / OfferingTree exports).
import type { Client } from './types.js';
import { emptyIntake } from './logic.js';
import { today, uid } from './util.js';

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface ClientImport { clients: Client[]; columns: Record<string, string>; skipped: number }

const truthy = (v: string) => /^(y|yes|true|1|subscribed|opted in|opt-in)$/i.test(v.trim());

export function mapClients(rows: string[][], pinkFitness: boolean, existingEmails: Set<string>): ClientImport {
  const [head, ...data] = rows;
  const h = head.map((x) => x.trim().toLowerCase());
  const find = (...pats: RegExp[]) => h.findIndex((x) => pats.some((p) => p.test(x)));
  const idx = {
    first: find(/^first/, /first name/, /given/),
    last: find(/^last/, /last name/, /surname/, /family/),
    full: find(/^name$/, /full name/, /client name/, /customer name/),
    email: find(/e-?mail/),
    phone: find(/phone/, /mobile/, /cell/),
    dob: find(/birth/, /dob/),
    emailOk: find(/marketing/, /subscri/, /newsletter/, /email.*(opt|consent)/),
    smsOk: find(/sms/, /text.*(opt|consent)/),
  };
  const columns: Record<string, string> = {};
  (Object.keys(idx) as (keyof typeof idx)[]).forEach((k) => { if (idx[k] >= 0) columns[k] = head[idx[k]]; });
  const now = new Date().toISOString();
  const clients: Client[] = [];
  let skipped = 0;
  for (const r of data) {
    const get = (i: number) => (i >= 0 ? (r[i] || '').trim() : '');
    let first = get(idx.first), last = get(idx.last);
    if (!first && idx.full >= 0) { const parts = get(idx.full).split(/\s+/); first = parts.shift() || ''; last = parts.join(' '); }
    const email = get(idx.email).toLowerCase();
    if (!first && !email) { skipped++; continue; }
    if (email && existingEmails.has(email)) { skipped++; continue; }
    if (email) existingEmails.add(email);
    const dobRaw = get(idx.dob);
    const dobDate = dobRaw ? new Date(dobRaw) : null;
    clients.push({
      id: uid(), firstName: first || email.split('@')[0], lastName: last, email, phone: get(idx.phone),
      dob: dobDate && !isNaN(+dobDate) ? dobDate.toISOString().slice(0, 10) : undefined,
      isPinkFitness: pinkFitness, status: 'active', source: 'import',
      consent: { email: idx.emailOk >= 0 ? truthy(get(idx.emailOk)) : false, sms: idx.smsOk >= 0 ? truthy(get(idx.smsOk)) : false, updatedAt: today() },
      intake: emptyIntake(), createdAt: now, updatedAt: now,
    });
  }
  return { clients, columns, skipped };
}

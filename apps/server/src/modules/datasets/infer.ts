import type { BaseType } from '@mini/shared';

// Schema inference and value parsing for uploads (03-data-model §5). Pure functions, no database.

export const INFER_SAMPLE_ROWS = 5_000;
const INFER_THRESHOLD = 0.98;

// Order matters: the first type where ≥ 98 % of non-empty sample values parse wins.
const INFERENCE_ORDER: BaseType[] = ['integer', 'double', 'boolean', 'date', 'timestamp'];

const NULL_TOKENS = new Set(['', 'none', 'null', 'nan']);

export function isNullToken(raw: string | undefined | null): boolean {
  return raw == null || NULL_TOKENS.has(raw.trim().toLowerCase());
}

// Canonical text for COPY, or `undefined` when the value doesn't parse as the type.
// Callers handle null tokens first.
export function parseAs(type: BaseType, raw: string): string | undefined {
  const v = raw.trim();
  switch (type) {
    case 'string':
      return raw;
    case 'integer':
      return parseInteger(v);
    case 'double':
      return parseDouble(v);
    case 'boolean':
      return parseBoolean(v);
    case 'date':
      return parseDate(v);
    case 'timestamp':
      return parseTimestamp(v);
  }
}

const INT_RE = /^[+-]?\d+$/;
const INT64_MAX = 9223372036854775807n;

function parseInteger(v: string): string | undefined {
  if (!INT_RE.test(v)) return undefined;
  const digits = v.replace(/^[+-]/, '');
  // "007" is a code, not a number: keep leading zeros as text.
  if (digits.length > 1 && digits.startsWith('0')) return undefined;
  const n = BigInt(v);
  if (n > INT64_MAX || n < -INT64_MAX) return undefined;
  return n.toString();
}

const DOUBLE_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

function parseDouble(v: string): string | undefined {
  if (!DOUBLE_RE.test(v)) return undefined;
  const intPart = v.replace(/^[+-]/, '').split(/[.,eE]/)[0] ?? '';
  if (intPart.length > 1 && intPart.startsWith('0')) return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : undefined;
}

const TRUE_TOKENS = new Set(['true', 'yes', '1']);
const FALSE_TOKENS = new Set(['false', 'no', '0']);

function parseBoolean(v: string): string | undefined {
  const l = v.toLowerCase();
  if (TRUE_TOKENS.has(l)) return 'true';
  if (FALSE_TOKENS.has(l)) return 'false';
  return undefined;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FR_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function parseDate(v: string): string | undefined {
  let m = ISO_DATE_RE.exec(v);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = FR_DATE_RE.exec(v);
  if (m) return ymd(Number(m[3]), Number(m[2]), Number(m[1]));
  return undefined;
}

const ISO_TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const FR_TS_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function parseTimestamp(v: string): string | undefined {
  let m = ISO_TS_RE.exec(v);
  if (m) {
    const date = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    const time = hms(Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
    if (!date || !time) return undefined;
    const fraction = m[7] ?? '';
    if (!m[8]) return `${date} ${time}${fraction}`; // local times stay as written
    // The column is `timestamp`, where Postgres silently ignores an offset: convert to UTC here.
    const off = m[8] === 'Z' ? 0 : (m[8][0] === '-' ? -1 : 1) * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(-2)));
    const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) - off * 60_000);
    const iso = utc.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)}${fraction}`;
  }
  m = FR_TS_RE.exec(v);
  if (m) {
    const date = ymd(Number(m[3]), Number(m[2]), Number(m[1]));
    const time = hms(Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
    return date && time ? `${date} ${time}` : undefined;
  }
  // A date alone in a timestamp column is midnight.
  const date = parseDate(v);
  return date ? `${date} 00:00:00` : undefined;
}

function ymd(y: number, mo: number, d: number): string | undefined {
  if (mo < 1 || mo > 12 || d < 1) return undefined;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > daysInMonth) return undefined;
  return `${String(y).padStart(4, '0')}-${pad2(mo)}-${pad2(d)}`;
}

function hms(h: number, mi: number, s: number): string | undefined {
  if (h > 23 || mi > 59 || s > 59) return undefined;
  return `${pad2(h)}:${pad2(mi)}:${pad2(s)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function inferType(values: readonly string[]): BaseType {
  const present = values.filter((v) => !isNullToken(v));
  if (present.length === 0) return 'string';
  for (const type of INFERENCE_ORDER) {
    let ok = 0;
    for (const v of present) if (parseAs(type, v) !== undefined) ok++;
    if (ok / present.length >= INFER_THRESHOLD) return type;
  }
  return 'string';
}

// Header → snake_case SQL name: accents removed, lowercase, other characters → '_' (03-data-model §4).
export function toSqlName(header: string): string {
  let s = header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = 'column';
  if (!/^[a-z]/.test(s)) s = `c_${s}`;
  return s.slice(0, 63);
}

// SQL names for every header, unique and never the reserved `_row`.
export function toSqlNames(headers: readonly string[]): string[] {
  const used = new Set<string>(['_row']);
  return headers.map((h) => {
    const base = toSqlName(h);
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base.slice(0, 60)}_${i}`;
    used.add(name);
    return name;
  });
}

// The JSON value shown in samples and previews for a canonical text value.
export function sampleValue(type: BaseType, canonical: string): string | number | boolean {
  switch (type) {
    case 'integer':
    case 'double':
      return Number(canonical);
    case 'boolean':
      return canonical === 'true';
    default:
      return canonical;
  }
}

export const SQL_TYPES: Record<BaseType, string> = {
  string: 'text',
  integer: 'bigint',
  double: 'double precision',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamp',
};

// The most common delimiter of the header line among , ; tab.
export function detectDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

// COPY text format: escape backslash, tab, newline, carriage return; NULL is \N.
export function copyEscape(v: string | null): string {
  if (v === null) return '\\N';
  return v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

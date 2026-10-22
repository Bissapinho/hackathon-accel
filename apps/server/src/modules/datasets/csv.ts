import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createGunzip, gunzipSync } from 'node:zlib';
import { parse, type Parser } from 'csv-parse';
import { detectDelimiter } from './infer.js';

// Reading uploaded .csv / .csv.gz files as streams of records (gzip detected from the magic bytes).

const BOM = 0xfeff;

export async function isGzip(path: string): Promise<boolean> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(2);
    const { bytesRead } = await fh.read(buf, 0, 2, 0);
    return bytesRead === 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  } finally {
    await fh.close();
  }
}

async function firstLine(path: string, gz: boolean): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    let text: string;
    if (gz) {
      // Partial gzip: inflate what we have, ignoring the truncated end.
      try {
        text = gunzipSync(buf.subarray(0, bytesRead), { finishFlush: 2 /* Z_SYNC_FLUSH */ }).toString('utf8');
      } catch {
        text = '';
      }
    } else {
      text = buf.subarray(0, bytesRead).toString('utf8');
    }
    if (text.charCodeAt(0) === BOM) text = text.slice(1);
    return text.split(/\r?\n/)[0] ?? '';
  } finally {
    await fh.close();
  }
}

export type CsvReader = { header: string[]; records: AsyncIterable<string[]>; close(): void };

// Opens the file and returns its header and an iterator over the data records (line 2 onward).
export async function openCsv(path: string): Promise<CsvReader> {
  const gz = await isGzip(path);
  const delimiter = detectDelimiter(await firstLine(path, gz));
  const file = createReadStream(path);
  const source: Readable = gz ? file.pipe(createGunzip()) : file;
  const parser: Parser = source.pipe(
    parse({ delimiter, bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }),
  );
  const iterator = parser[Symbol.asyncIterator]() as AsyncIterator<string[]>;
  const close = () => {
    parser.destroy();
    file.destroy();
  };
  let first: IteratorResult<string[]>;
  try {
    first = await iterator.next();
  } catch (err) {
    close(); // a header that doesn't parse must not leave the file open
    throw err;
  }
  if (first.done) {
    close();
    throw new Error('empty file');
  }
  const header = first.value.map((h) => h.trim());
  return { header, records: { [Symbol.asyncIterator]: () => iterator }, close };
}

// Header + the first `n` records, for inference.
export async function readSample(path: string, n: number): Promise<{ header: string[]; rows: string[][] }> {
  const reader = await openCsv(path);
  const rows: string[][] = [];
  try {
    for await (const rec of reader.records) {
      rows.push(rec);
      if (rows.length >= n) break;
    }
  } finally {
    reader.close();
  }
  return { header: reader.header, rows };
}

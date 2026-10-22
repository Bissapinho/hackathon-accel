import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readSample } from '../src/modules/datasets/csv.js';
import { copyEscape, detectDelimiter, inferType, isNullToken, parseAs, toSqlName, toSqlNames } from '../src/modules/datasets/infer.js';

// Pure unit tests: run without Postgres with `VITEST_NO_DB=1 pnpm test infer`.

describe('type inference (03-data-model §5)', () => {
  it('picks the first type where ≥ 98 % of non-empty values parse', () => {
    expect(inferType(['1', '2', '-3', ''])).toBe('integer');
    expect(inferType(['1.5', '2', '3,25'])).toBe('double');
    expect(inferType(['True', 'False', 'true', 'false'])).toBe('boolean'); // D2 and the fixture's lowercase
    expect(inferType(['yes', 'no'])).toBe('boolean');
    expect(inferType(['2025-10-14', '14/10/2025'])).toBe('date');
    expect(inferType(['14/10/2025 08:30', '2025-10-14T08:30:00'])).toBe('timestamp');
    expect(inferType(['J+3', 'J+5'])).toBe('string'); // DLC
    expect(inferType(['69.0%', '12%'])).toBe('string');
    expect(inferType(['350g'])).toBe('string');
    expect(inferType(['', 'None', 'NaN', 'null'])).toBe('string');
  });

  it('tolerates 2 % of bad values, not more', () => {
    const ints = Array.from({ length: 98 }, (_, i) => String(i + 1));
    expect(inferType([...ints, 'abc', 'def'])).toBe('integer');
    expect(inferType([...ints.slice(0, 97), 'abc', 'def', 'ghi'])).toBe('string');
  });

  it('keeps codes with leading zeros as text', () => {
    expect(inferType(['007', '012'])).toBe('string');
    expect(parseAs('integer', '0')).toBe('0');
  });

  it('0/1 columns are integers (integer comes before boolean)', () => {
    expect(inferType(['0', '1', '1'])).toBe('integer');
  });
});

describe('value parsing', () => {
  it('normalizes dates and timestamps to ISO', () => {
    expect(parseAs('date', '14/10/2025')).toBe('2025-10-14');
    expect(parseAs('date', '1/2/2025')).toBe('2025-02-01');
    expect(parseAs('date', '31/02/2025')).toBeUndefined();
    expect(parseAs('timestamp', '14/10/2025 08:30')).toBe('2025-10-14 08:30:00');
    expect(parseAs('timestamp', '2025-10-14T08:30:12Z')).toBe('2025-10-14 08:30:12Z');
    expect(parseAs('timestamp', '2025-10-14')).toBe('2025-10-14 00:00:00');
    expect(parseAs('timestamp', '14/10/2025 25:00')).toBeUndefined();
  });

  it('parses booleans case-insensitively and doubles with a comma', () => {
    expect(parseAs('boolean', 'TRUE')).toBe('true');
    expect(parseAs('boolean', 'False')).toBe('false');
    expect(parseAs('double', '3,5')).toBe('3.5');
    expect(parseAs('integer', 'abc')).toBeUndefined();
  });

  it('treats empty, None, null and NaN as NULL', () => {
    for (const v of ['', '  ', 'None', 'NULL', 'nan']) expect(isNullToken(v)).toBe(true);
    expect(isNullToken('0')).toBe(false);
  });
});

describe('column names (03-data-model §4)', () => {
  it('snake_cases headers, removes accents, keeps Cat_gorie as cat_gorie', () => {
    expect(toSqlName('Date_de_cr_ation')).toBe('date_de_cr_ation');
    expect(toSqlName('Cat_gorie')).toBe('cat_gorie');
    expect(toSqlName('Catégorie Produit')).toBe('categorie_produit');
    expect(toSqlName('ID_Interne_Client_Netsuite')).toBe('id_interne_client_netsuite');
    expect(toSqlName('2025 total')).toBe('c_2025_total');
    expect(toSqlName('%%')).toBe('column');
  });

  it('dedupes and never uses _row', () => {
    expect(toSqlNames(['A', 'a', 'A ', '_row'])).toEqual(['a', 'a_2', 'a_3', 'row']);
  });
});

describe('CSV reading', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mini-csv-'));

  it('detects the delimiter', () => {
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b')).toBe(',');
    expect(detectDelimiter('a\tb')).toBe('\t');
  });

  it('reads .csv with a BOM and .csv.gz the same way', async () => {
    const text = '﻿No_Transaction;Quantite\nSO-1;2\n"RMA-1";-1\n';
    const plain = path.join(dir, 'x.csv');
    const gz = path.join(dir, 'x.csv.gz');
    writeFileSync(plain, text);
    writeFileSync(gz, gzipSync(text));
    for (const f of [plain, gz]) {
      const s = await readSample(f, 10);
      expect(s.header).toEqual(['No_Transaction', 'Quantite']);
      expect(s.rows).toEqual([
        ['SO-1', '2'],
        ['RMA-1', '-1'],
      ]);
    }
  });

  it('escapes values for COPY', () => {
    expect(copyEscape('a\tb\\c\nd')).toBe('a\\tb\\\\c\\nd');
    expect(copyEscape(null)).toBe('\\N');
  });
});

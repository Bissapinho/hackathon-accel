import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { checkReadOnlySql, tokenize } from '../src/modules/sql/parse.js';

// T-16 parser check (no database): accept / reject table (O3) and the tokenizer.

const accepted: string[] = [
  'SELECT 1',
  'select 1;',
  '  SELECT 1 ;  -- trailing comment',
  'SELECT 1; /* trailing block */',
  'WITH x AS (SELECT 1 AS a) SELECT a FROM x',
  'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5) SELECT * FROM n',
  '(SELECT 1) UNION (SELECT 2)',
  "SELECT 'DELETE FROM t; DROP TABLE x' AS s",
  "SELECT 'it''s; update' AS s",
  "SELECT '(' AS open, \"a)\" FROM data.t",
  "SELECT E'a\\'; delete' AS s",
  'SELECT $$ drop table x; $$ AS s',
  'SELECT $tag$ insert $x$ ; $tag$ AS s',
  'SELECT "delete", "update" FROM data.t',
  'SELECT 1 -- ; DROP TABLE x\n',
  'SELECT /* nested /* ; delete */ still comment */ 1',
  '-- leading comment\nSELECT count(*) FROM logic.cuisine_jour',
  'SELECT pg_sleep(6)',
  'SELECT substring(nom FROM 1 FOR 3) FROM data.t',
  "SELECT date_trunc('month', d)::date, sum(q) FROM data.t GROUP BY 1 ORDER BY 1",
  'SELECT a$b FROM data.t',
  'SELECT 1.5e-3, .5, 0x1F',
  'SELECT updated_at, created_by, deleted FROM data.t',
];

const rejectedCases: [string, RegExp][] = [
  ['DELETE FROM data.t', /DELETE statement/],
  ['UPDATE data.t SET a = 1', /UPDATE statement/],
  ['DROP TABLE data.t', /DROP statement/],
  ['INSERT INTO data.t VALUES (1)', /INSERT statement/],
  ['ALTER TABLE data.t ADD COLUMN b int', /ALTER/],
  ['CREATE TABLE data.x (a int)', /CREATE/],
  ['TRUNCATE data.t', /TRUNCATE/],
  ['GRANT SELECT ON data.t TO public', /GRANT/],
  ["COPY data.t TO '/tmp/x'", /COPY/],
  ['CALL p()', /CALL/],
  ["DO $$ BEGIN PERFORM 1; END $$", /DO statement/],
  ["SET role mini_app", /SET statement/],
  ['RESET ROLE', /RESET/],
  ['EXPLAIN SELECT 1', /EXPLAIN/],
  ['VALUES (1)', /SELECT or WITH/],
  ['SELECT 1; SELECT 2', /one statement/],
  ['SELECT 1; DELETE FROM data.t', /one statement/],
  ['SELECT 1;;', /one statement/],
  ['WITH x AS (DELETE FROM data.t RETURNING *) SELECT * FROM x', /DELETE/],
  ['WITH x AS (UPDATE data.t SET a = 1 RETURNING *) SELECT * FROM x', /UPDATE/],
  ['WITH x AS (INSERT INTO data.t VALUES (1) RETURNING *) SELECT 1', /INSERT/],
  ['SELECT * INTO data.copy FROM data.t', /INTO/],
  ['SELECT * FROM data.t FOR UPDATE', /FOR UPDATE/],
  ['SELECT * FROM data.t FOR SHARE', /FOR UPDATE/],
  ['SELECT * FROM data.t FOR NO KEY UPDATE', /FOR UPDATE/],
  ["SELECT set_config('role', 'mini_app', true)", /set_config/],
  ["SELECT pg_catalog.set_config('role', 'mini_app', true)", /set_config/],
  ['SELECT "set_config"(\'role\', \'mini_app\', true)', /set_config/],
  ['SELECT pg_terminate_backend(123)', /pg_terminate_backend/],
  ['SELECT pg_cancel_backend(123)', /pg_cancel_backend/],
  ["SELECT lo_import('/etc/passwd')", /lo_import/],
  ["SELECT dblink('host=x', 'select 1')", /dblink/],
  ["SELECT query_to_xml('delete from data.t', true, true, '')", /query_to_xml/],
  ["SELECT pg_read_file('/etc/passwd')", /pg_read_file/],
  ["SELECT pg_advisory_lock(1)", /pg_advisory_lock/],
  ["SELECT nextval('s')", /nextval/],
  ['SELECT U&"d\\0061ta" FROM x', /Unicode/],
  ["SELECT 'unterminated", /never closed/],
  ['SELECT "unterminated', /never closed/],
  ['SELECT /* unterminated', /never closed/],
  ['SELECT $$ unterminated', /never closed/],
  ['', /empty/],
  ['  -- only a comment\n ;', /empty/],
  ['SELECT 1) AS _i LIMIT 0) AS _q ON true', /never opened/],
  ['SELECT (1', /never closed/],
  ["SELECT ')' AS s)", /never opened/],
];

describe('checkReadOnlySql', () => {
  it.each(accepted)('accepts %j', (q) => {
    expect(() => checkReadOnlySql(q)).not.toThrow();
  });

  it.each(rejectedCases)('rejects %j', (q, message) => {
    let err: unknown;
    try { checkReadOnlySql(q); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.code).toBe('SQL_REJECTED');
    expect(e.status).toBe(400);
    expect(e.message).toMatch(message);
    expect(e.extra.hint).toBeTruthy();
  });

  it('cuts the body after the last token, dropping the semicolon and trailing comments only', () => {
    expect(checkReadOnlySql('SELECT 1 ; -- done').body).toBe('SELECT 1');
    expect(checkReadOnlySql('-- why\nSELECT 1 /* x */').body).toBe('-- why\nSELECT 1');
    expect(checkReadOnlySql("SELECT 'a;b'").body).toBe("SELECT 'a;b'");
  });
});

describe('tokenize', () => {
  it('skips comments and keeps literals and quoted names whole', () => {
    const t = tokenize(`SELECT "Nom ""x""", 'a''b', $q$ ; $q$, $1 -- c\nFROM /* d */ data.t;`);
    expect(t.map((x) => [x.kind, x.value])).toEqual([
      ['word', 'select'], ['qident', 'Nom "x"'], ['punct', ','], ['string', "'a''b'"], ['punct', ','],
      ['string', '$q$ ; $q$'], ['punct', ','], ['param', '$1'], ['word', 'from'], ['word', 'data'], ['punct', '.'],
      ['word', 't'], ['punct', ';'],
    ]);
  });
});

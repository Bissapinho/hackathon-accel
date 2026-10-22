// Parser check of the read-only SQL module (T-16, 09 §4.3): accepts one SELECT or WITH … SELECT
// statement and rejects everything else with SQL_REJECTED (an ApiError) before the query reaches Postgres.
// A small tokenizer skips comments, string literals, quoted identifiers and dollar-quoted bodies,
// so keywords and semicolons inside them don't count. The read-only role stays the real guard;
// this check gives the agent a clear message and blocks the escapes the role can't: set_config('role', …)
// switches the role back to mini_app inside the transaction, which BEGIN READ ONLY still stops from
// writing but not from reading meta.*. Balanced parentheses keep the statement inside the service's wrapper.

import { sqlRejected as rejected } from './errors.js';

export type TokenKind = 'word' | 'qident' | 'string' | 'number' | 'param' | 'punct' | 'op';
/** `value`: lower-cased for words, unescaped for quoted identifiers, the raw text otherwise. */
export type Token = { kind: TokenKind; value: string; start: number; end: number };

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿]/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;
const PUNCT = new Set([';', '(', ')', ',', '[', ']', '.']);

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const n = text.length;
  let i = 0;

  const readQuoted = (from: number, quote: string, backslashEscapes: boolean, what: string): number => {
    let j = from + 1;
    for (;;) {
      if (j >= n) throw rejected(`The query has ${what} that is never closed.`, 'Close every quote and comment, then try again.');
      const c = text.charAt(j);
      if (backslashEscapes && c === '\\') { j += 2; continue; }
      if (c === quote) {
        if (text[j + 1] === quote) { j += 2; continue; }
        return j + 1;
      }
      j++;
    }
  };

  while (i < n) {
    const c = text.charAt(i);
    const next = text[i + 1];
    if (/\s/.test(c)) { i++; continue; }

    if (c === '-' && next === '-') {
      const eol = text.indexOf('\n', i);
      i = eol === -1 ? n : eol + 1;
      continue;
    }
    if (c === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (depth > 0) {
        if (j >= n) throw rejected('The query has a comment that is never closed.', 'Close every quote and comment, then try again.');
        if (text[j] === '/' && text[j + 1] === '*') { depth++; j += 2; } else if (text[j] === '*' && text[j + 1] === '/') { depth--; j += 2; } else j++;
      }
      i = j;
      continue;
    }

    if (c === "'") {
      const end = readQuoted(i, "'", false, 'a text value');
      tokens.push({ kind: 'string', value: text.slice(i, end), start: i, end });
      i = end;
      continue;
    }
    if (c === '"') {
      const end = readQuoted(i, '"', false, 'a quoted name');
      tokens.push({ kind: 'qident', value: text.slice(i + 1, end - 1).replaceAll('""', '"'), start: i, end });
      i = end;
      continue;
    }
    if (c === '$') {
      if (next !== undefined && /[0-9]/.test(next)) {
        let j = i + 1;
        while (j < n && /[0-9]/.test(text.charAt(j))) j++;
        tokens.push({ kind: 'param', value: text.slice(i, j), start: i, end: j });
        i = j;
        continue;
      }
      const tag = DOLLAR_TAG.exec(text.slice(i, i + 130));
      if (tag) {
        const close = text.indexOf(tag[0], i + tag[0].length);
        if (close === -1) throw rejected('The query has a $$-quoted text that is never closed.', 'Close every quote and comment, then try again.');
        const end = close + tag[0].length;
        tokens.push({ kind: 'string', value: text.slice(i, end), start: i, end });
        i = end;
        continue;
      }
    }

    if (WORD_START.test(c)) {
      let j = i + 1;
      while (j < n && WORD_PART.test(text.charAt(j))) j++;
      const word = text.slice(i, j).toLowerCase();
      // Prefixed literals: E'…' (backslash escapes), B'…', X'…', N'…'; U&'…' / U&"…" are refused.
      if (j - i === 1 && text[j] === "'" && 'ebxn'.includes(word)) {
        const end = readQuoted(j, "'", word === 'e', 'a text value');
        tokens.push({ kind: 'string', value: text.slice(i, end), start: i, end });
        i = end;
        continue;
      }
      if (word === 'u' && text[j] === '&' && (text[j + 1] === "'" || text[j + 1] === '"')) {
        throw rejected('Unicode-escaped names and texts (U&"…", U&\'…\') are not accepted here.', 'Write names and texts with their plain characters.');
      }
      tokens.push({ kind: 'word', value: word, start: i, end: j });
      i = j;
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && next !== undefined && /[0-9]/.test(next))) {
      let j = i + 1;
      while (j < n) {
        const d = text.charAt(j);
        if (/[0-9A-Za-z_.]/.test(d)) j++;
        else if ((d === '+' || d === '-') && /[eE]/.test(text.charAt(j - 1)) && !/^0[xX]/.test(text.slice(i, j))) j++;
        else break;
      }
      tokens.push({ kind: 'number', value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    tokens.push({ kind: PUNCT.has(c) ? 'punct' : 'op', value: c, start: i, end: i + 1 });
    i++;
  }
  return tokens;
}

/** Words that start a statement other than a query: named in the message when the query starts with one. */
const STATEMENTS = new Set([
  'insert', 'update', 'delete', 'merge', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy', 'call', 'do',
  'set', 'reset', 'lock', 'vacuum', 'analyze', 'analyse', 'cluster', 'reindex', 'refresh', 'comment', 'security',
  'listen', 'notify', 'unlisten', 'prepare', 'execute', 'deallocate', 'discard', 'explain', 'begin', 'start', 'commit',
  'rollback', 'abort', 'end', 'savepoint', 'release', 'checkpoint', 'load', 'import', 'values', 'table', 'show', 'fetch',
  'move', 'close', 'declare', 'reassign',
]);

/** Words that can only mean a write or a schema change inside a query (data-modifying CTEs included). */
const WRITE_WORDS = new Set(['insert', 'update', 'delete', 'merge', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy']);

/** Functions with side effects, or that run SQL passed as text (which this check can't see). */
const DENIED_FUNCTIONS = new Set([
  'set_config', 'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf', 'pg_rotate_logfile', 'pg_promote',
  'pg_switch_wal', 'pg_start_backup', 'pg_stop_backup', 'pg_backup_start', 'pg_backup_stop', 'pg_notify',
  'pg_log_backend_memory_contexts', 'pg_import_system_collations', 'pg_stat_file', 'nextval', 'setval', 'loread', 'lowrite',
  'query_to_xml', 'query_to_xmlschema', 'query_to_xml_and_xmlschema', 'cursor_to_xml', 'cursor_to_xmlschema', 'ts_stat', 'ts_rewrite',
]);
const DENIED_PREFIXES = [
  'lo_', 'dblink', 'pg_advisory_', 'pg_try_advisory_', 'pg_read_', 'pg_ls_', 'pg_file_', 'pg_create_', 'pg_drop_',
  'pg_replication_', 'pg_logical_', 'pg_wal_replay_', 'pg_stat_reset',
];

function deniedFunction(name: string): boolean {
  return DENIED_FUNCTIONS.has(name) || DENIED_PREFIXES.some((p) => name.startsWith(p));
}

export type CheckedSql = {
  /** The statement as sent, cut after its last token (no trailing semicolon or comment), ready to be wrapped. */
  body: string;
  tokens: Token[];
};

/** Throws ApiError SQL_REJECTED unless `text` is a single read-only SELECT / WITH … SELECT statement. */
export function checkReadOnlySql(text: string): CheckedSql {
  const all = tokenize(text);
  const semi = all.findIndex((t) => t.kind === 'punct' && t.value === ';');
  const tokens = semi === -1 ? all : all.slice(0, semi);
  if (semi !== -1 && semi < all.length - 1) {
    throw rejected('Only one statement can run at a time, and this text has several (separated by ";").', 'Send one SELECT query per call.');
  }
  if (tokens.length === 0) throw rejected('The query is empty.', 'Send a SELECT query.');

  const first = tokens.find((t) => !(t.kind === 'punct' && t.value === '('));
  if (!first || first.kind !== 'word' || (first.value !== 'select' && first.value !== 'with')) {
    const named = first?.kind === 'word' && STATEMENTS.has(first.value) ? `This is a ${first.value.toUpperCase()} statement. ` : '';
    throw rejected(`${named}Only queries that start with SELECT or WITH can run here; they read data and never change it.`);
  }

  let depth = 0;
  for (const [k, t] of tokens.entries()) {
    const next = tokens[k + 1];
    if (t.kind === 'punct' && t.value === '(') depth++;
    if (t.kind === 'punct' && t.value === ')' && --depth < 0) {
      throw rejected('The query closes a parenthesis that was never opened.', 'Check that every "(" has its ")".');
    }
    if (t.kind === 'word') {
      if (t.value === 'for' && next?.kind === 'word' && ['update', 'share', 'no', 'key'].includes(next.value)) {
        throw rejected('SELECT … FOR UPDATE / FOR SHARE locks rows, which a read-only query may not do.', 'Remove the FOR UPDATE / FOR SHARE clause.');
      }
      if (WRITE_WORDS.has(t.value)) {
        throw rejected(`The query contains ${t.value.toUpperCase()}, which changes data or structure; only reading is allowed here.`);
      }
      if (t.value === 'into') {
        throw rejected('SELECT … INTO creates a table, which a read-only query may not do.', 'Remove the INTO clause to get the rows back instead.');
      }
    }
    if ((t.kind === 'word' || t.kind === 'qident') && next?.kind === 'punct' && next.value === '(' && deniedFunction(t.value)) {
      throw rejected(
        `The function ${t.value}() changes the server's state or runs hidden SQL, so it can't be used here.`,
        'Use ordinary functions only (aggregates, dates, text, maths…).',
      );
    }
  }

  if (depth > 0) throw rejected('The query opens a parenthesis that is never closed.', 'Check that every "(" has its ")".');

  return { body: text.slice(0, tokens[tokens.length - 1]!.end), tokens };
}

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// A tiny Kumo-shaped sample written to a temp folder, following the facts of 07 §0.
// TODO(kumo-mini): switch the dataset tests to fixtures/kumo-mini/ once Alfred pushes T-02b,
// and assert the fixture's exact numbers (line count, Lieu_Production null count) from kumo-mini.facts.json.

export type KumoLike = {
  dir: string;
  files: { orders: string; clients: string; articles: string };
  facts: {
    orderLines: number;
    soLines: number;
    rmaLines: number;
    lieuProductionNulls: number;
    clients: number;
    articles: number;
  };
};

export function writeKumoLike(): KumoLike {
  const dir = mkdtempSync(path.join(tmpdir(), 'kumo-like-'));
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };

  const clients = Array.from({ length: 20 }, (_, i) => ({
    id: `C${String(400 + i).padStart(4, '0')}`,
    zone: i % 2 === 0 ? 'IDF' : 'LYON',
    actif: i < 18 ? 'true' : 'false', // 2 inactive; lowercase like the real files
  }));
  const clientsCsv =
    'ID_interne,Zone_Distribution,Actif\n' + clients.map((c) => `${c.id},${c.zone},${c.actif}`).join('\n') + '\n';

  const articles = Array.from({ length: 30 }, (_, i) => ({
    id: `A${String(100 + i).padStart(4, '0')}`,
    dlc: `J+${(i % 5) + 1}`,
    created: `${String((i % 28) + 1).padStart(2, '0')}/0${(i % 9) + 1}/2024 ${String(i % 24).padStart(2, '0')}:15`,
    actif: i % 7 === 0 ? 'False' : 'True', // D2 says True/False
  }));
  const articlesCsv =
    'ID_interne;Nom_Article;DLC;Date_de_cr_ation;Article_Actif\n' +
    articles.map((a) => `${a.id};Article ${a.id};${a.dlc};${a.created};${a.actif}`).join('\n') +
    '\n';

  // 120 SO- documents (positive quantities) and 60 RMA- documents (negative); 2 clients with none.
  const orderClients = clients.slice(0, 18);
  const lines: string[] = [];
  let soLines = 0;
  let rmaLines = 0;
  let lieuNulls = 0;
  const docs = [
    ...Array.from({ length: 120 }, (_, i) => ({ no: `SO-${String(81000 + i)}`, sign: 1 })),
    ...Array.from({ length: 60 }, (_, i) => ({ no: `RMA-${String(5000 + i)}`, sign: -1 })),
  ];
  for (const [d, doc] of docs.entries()) {
    // No documents in August or September (Alfred's fixture note); production place filled from August.
    const month = [1, 2, 3, 4, 5, 6, 7, 10, 11][d % 9]!;
    const day = (d % 28) + 1;
    const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2025`;
    const client = orderClients[d % orderClients.length]!.id;
    const nLines = 1 + Math.floor(rand() * 4);
    for (let l = 0; l < nLines; l++) {
      const article = articles[Math.floor(rand() * articles.length)]!.id;
      const qty = doc.sign * (1 + Math.floor(rand() * 9));
      const lieu = month >= 8 ? (d % 2 ? 'Gennevilliers' : 'Frepillon') : '';
      if (!lieu) lieuNulls++;
      lines.push(`${doc.no},${date},${client},${article},${qty},${lieu}`);
      if (doc.sign > 0) soLines++;
      else rmaLines++;
    }
  }
  // One line whose article is not in the articles file.
  lines.push(`SO-81000,02/01/2025,${orderClients[0]!.id},A9999,1,`);
  soLines++;
  lieuNulls++;
  const ordersCsv =
    'No_Transaction,Date,ID_Interne_Client_Netsuite,ID_Interne_Article,Quantite,Lieu_Production\n' + lines.join('\n') + '\n';

  const files = {
    orders: path.join(dir, 'COMMANDES_NETSUITE_2025.csv.gz'),
    clients: path.join(dir, 'CLIENTS_NETSUITE.csv'),
    articles: path.join(dir, 'ARTICLES_NETSUITE.csv'),
  };
  writeFileSync(files.orders, gzipSync(ordersCsv));
  writeFileSync(files.clients, clientsCsv);
  writeFileSync(files.articles, articlesCsv);
  // Not a data file: the seed script must ignore it.
  writeFileSync(path.join(dir, 'README.txt'), 'not a CSV');

  return {
    dir,
    files,
    facts: {
      orderLines: lines.length,
      soLines,
      rmaLines,
      lieuProductionNulls: lieuNulls,
      clients: clients.length,
      articles: articles.length,
    },
  };
}

// A multipart/form-data body for app.inject.
export function multipartBody(
  file: { name: string; content: Buffer | string },
  fields: Record<string, string> = {},
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----mini${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    ),
    Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

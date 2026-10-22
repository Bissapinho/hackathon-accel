// Generates fixtures/kumo-mini/: a small, fully synthetic sample with the file names, columns and
// value shapes of Kumo's NetSuite 2025 exports (task T-02b, facts of 07-acceptance-tests.md §0).
// No real value is used: codes, names and quantities all come from the seeded generator below.
// Output is byte-identical on every run. It also writes fixtures/kumo-mini.facts.json, the numbers
// the platform tests rely on, and refuses to write anything if a fact of 07 §0 does not hold.
//
// Run: node fixtures/generate-kumo-mini.ts   (Node >= 22.6 with type stripping, or tsx)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SEED = 20251014;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'kumo-mini');
const FACTS_FILE = join(HERE, 'kumo-mini.facts.json');

// ---------- seeded random ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number): boolean => rand() < p;
function sample<T>(xs: readonly T[], n: number): T[] {
  const copy = [...xs];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
const pad = (n: number, width: number): string => String(n).padStart(width, '0');
/** `count` distinct codes like C0421, in no particular order (codes carry no meaning). */
function codes(prefix: string, count: number, max: number, width = 4): string[] {
  const all = Array.from({ length: max }, (_, i) => i + 1);
  return sample(all, count).map((n) => prefix + pad(n, width));
}

// ---------- dates (all UTC, no clock reads) ----------

const DAY = 86_400_000;
const d = (iso: string): number => Date.parse(iso + 'T00:00:00Z');
const isoDate = (t: number): string => new Date(t).toISOString().slice(0, 10);
const isoDateTime = (t: number): string => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
function frDate(t: number): string {
  const x = new Date(t);
  return `${pad(x.getUTCDate(), 2)}/${pad(x.getUTCMonth() + 1, 2)}/${x.getUTCFullYear()}`;
}
function frDateTime(t: number): string {
  const x = new Date(t);
  return `${frDate(t)} ${pad(x.getUTCHours(), 2)}:${pad(x.getUTCMinutes(), 2)}`;
}
const timeOfDay = (minH: number, maxH: number): number => int(minH * 60, maxH * 60 - 1) * 60_000 + int(0, 59) * 1000;
/** App timestamps look like `2025-05-09 11:12:09.265-05`. */
function appTimestamp(t: number): string {
  return `${isoDateTime(t)}.${pad(int(0, 999999), 6).replace(/0+$/, '') || '0'}${pick(['-05', '-06'])}`;
}
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = d(from); t <= d(to); t += DAY) out.push(isoDate(t));
  return out;
}

// ---------- CSV ----------

type Row = Record<string, string | number | boolean | null>;
function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(columns: readonly string[], rows: readonly Row[]): string {
  for (const r of rows) {
    for (const k of Object.keys(r)) if (!columns.includes(k)) throw new Error(`unknown column ${k}`);
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
/** gzip with a fixed header (mtime 0, OS byte 3) so the bytes don't depend on the machine. */
function gzipStable(text: string): Buffer {
  const buf = gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
  buf.writeUInt32LE(0, 4);
  buf[9] = 3;
  return buf;
}

// ---------- columns (identical to the real exports) ----------

const COLUMNS = {
  CLIENTS_NETSUITE: ['ID_interne', 'Nom', 'Cat_gorie', 'Filiale_principale', 'Type_de_Contrat', 'Type_de_Commandes', 'Jours_de_Livraison', 'Pr_sentoir', 'Mix_Produit', 'Mode_de_Production_pour_Livraison', 'Zone_Distribution', 'Niveau_de_prix', 'Commercial', 'Nom_du_Parent', 'Client_Actif', 'Date_de_cr_ation', 'VIP', 'Date_de_Lancement', 'Coefficient_Algo', 'Facturation_Sp_cifique', 'Arr_t_Provisoire', 'Typologie_de_Facturation', 'Commande_Fixe_Jour', 'Quantit_s_Premi_re_Commande', 'DA', 'Tier', 'Etiquette', 'Classement_Mag', 'Compte_Pr_visionnel', 'Martees_Store', 'Enseigne', 'Send_To_MyTroopers', 'Send_Packing_Slip', 'Inactif', 'Qt_s_Mix_Produit_Ouverture', 'Mode_de_facturation', 'Fr_quence_de_facturation', 'Jour_de_facturation_Hebdo', 'Jour_de_facturation_Mois', 'Type_d_envoi_facturation', 'Envoi_Email_Automatique', 'Mix_Produit_Long', 'Zone_Unifiee', 'Typologie_du_lieu', 'BL_Pr_visionnel', 'Horaires_de_livraison_d_but', 'Horaires_de_livraison_fin', 'Production_Prioritaire', 'Exclure_Flux_Ops_Rapports', 'App_Kumo', 'Exclure_Reporting', 'Cluster', 'MTS_Delivery_Type', 'Capacite', 'VENTES_WE', 'VENTES_Deb_Sem', 'Validation_Compta', 'Type_de_Magasin'],
  ARTICLES_NETSUITE: ['ID_interne', 'Nom', 'Nom_d_affichage', 'Typologie_Client', 'Article_Actif', 'Ordre_de_Production', 'Article_affili_BDD', 'Produire', 'Date_de_cr_ation', 'Inactif', 'Quantit_Fixe', 'Famille_Produit', 'Colisage', 'Nom_Mercuriale', 'Article_Avoir_Actif', 'Date_de_Lancement', 'Grande_Famille_Produit', 'Article_Easilys_Actif', 'LABO', 'A_pour_B', 'Derni_re_modification', 'DLC', 'Poids', 'Ordre_Picking_Provinces', 'Categorie_Produits', 'Ordre_Picking_IDF', 'Type_de_Production', 'Groupe_Produit', 'Exclure_Reporting', 'Exclure_App', 'Trame_Sushi', 'Core_Product'],
  COMMANDES_NETSUITE_2025: ['No_Transaction', 'Date', 'ID_Interne_Client_Netsuite', 'ID_Interne_Article_Netsuite', 'Nom_Client_Netsuite', 'Nom_Article_Netsuite', 'Quantite', 'Algo_Manu', 'Algo_Virany', 'Modif_Manuelle', 'Date_de_creation', 'Derniere_modification', 'Quantite_prevue', 'Quantite_livree', 'Quantite_facturee', 'Lieu_Production', 'Date_Production', 'ID_interne', 'ID_de_ligne', 'Date_Prod_Exceptionnel', 'Derniere_Modification_Clean'],
  FACTURES_AVOIRS_2025: ['No_Transaction', 'Date', 'ID_Interne_Client_Netsuite', 'ID_Interne_Article_Netsuite', 'Nom_Client_Brut', 'Nom_Article_Brut', 'Quantite', 'Taux_TVA'],
  MERCURIALES_NETSUITE: ['niveau_de_prix', 'article_id_interne', 'article', 'nom_affichage', 'nom_mercuriale', 'inactif', 'article_actif', 'article_affilie_bdd', 'grande_famille_produit', 'famille_produit', 'groupe_produit', 'dlc', 'poids', 'id_interne_catalogue'],
  APP_COMMANDES_2025: ['order_date', 'store_name', 'store_id', 'external_id', 'created_at', 'updated_at', 'user_email', 'status', 'product_id', 'product_name', 'quantity', 'lieu', 'mercuriale'],
  APP_STOCKS_2025: ['order_date', 'store_name', 'store_id', 'external_id', 'created_at', 'updated_at', 'user_email', 'status', 'product_id', 'product_name', 'quantity', 'lieu', 'stock_j1', 'qte_final', 'vitrine_note_agencement', 'produits_perimes', 'vitrine_bien_chargee', 'poids_stock_total', 'poids_stock_dlc_j', 'dlc_rayon', 'bl_j1'],
  APP_KIOSQUE_INVENDUS_2025: ['order_date', 'store_name', 'store_id', 'lieu', 'product_id', 'product_name', 'quantity', 'user_email', 'external_id', 'status', 'mercuriale', 'created_at', 'updated_at', 'poids'],
  APP_KIOSQUE_PRODUCTION_2025: ['order_date', 'store_name', 'store_id', 'lieu', 'product_id', 'product_name', 'quantity', 'user_email', 'external_id', 'status', 'mercuriale', 'created_at', 'updated_at', 'poids'],
  IMPORTS_NETSUITE_2025: ['update_id', 'submission_timestamp', 'submitted_by_email', 'store_id', 'store_name', 'Date', 'ID_Interne_Client_Netsuite', 'ID_Interne_Article_Netsuite', 'Qty', 'ID_Externe_Commande', 'ID_Externe_Ligne_Commande', 'Lieu', 'Niveau_de_Prix'],
  MIX_PRODUIT_EXPORTS_2025: ['update_id', 'submission_timestamp', 'submitted_by_email', 'store_id', 'ID_Interne_Client', 'Client', 'ID_interne_Article', 'Article'],
  ETAGERES_CORRESPONDANCE: ['PC', 'VITRINE', 'MAGASIN', 'ID_Interne', 'DATE_INSTAL', 'DATE_DEBRANCHE', 'STATUT_LAST', 'ETAT'],
  ETAGERES_MESURES_2025: ['system_name', 'type', 'shelf_position', 'shelf_usb_port', 'date__iso8601__Paris_', 'date__YYYY_MM_DD_', 'date__HH_MM_', 'weight_variation'],
  CUISINES_REFERENTIEL: ['Lieu_Production', 'Region', 'Specialite', 'Coef_Efficacite', 'Effectif_Max_Jour'],
  CAPACITE_CUISINES_JOUR_2025: ['Date_Production', 'Lieu_Production', 'Atelier', 'Poste', 'Effectif_Prevu', 'Absents', 'Interimaires', 'Effectif_Present', 'Heures_Par_Poste', 'Heures_Travaillees', 'Heures_Supplementaires', 'Productivite_Unites_Heure', 'Capacite_Unites', 'Charge_Planifiee_Unites', 'Taux_Utilisation', 'Charge_Non_Couverte_Unites'],
  STOCKS_MAGASINS_JOUR_2025: ['Date', 'ID_Interne_Client_Netsuite', 'ID_Interne_Article_Netsuite', 'Type_de_Contrat', 'Stock_Ouverture_Vendable', 'Stock_Ouverture_Perime', 'Qte_Livree', 'Demande', 'Qte_Vendue', 'Ventes_Perdues', 'Qte_Perimee_Jour', 'Qte_Retournee', 'Qte_Detruite', 'Stock_Cloture_Vendable', 'Stock_Cloture_Perime', 'Stock_Cloture_Total', 'Jours_Avant_Peremption_Lot_Plus_Ancien'],
} as const;
type Table = keyof typeof COLUMNS;

// ---------- reference values ----------

const KITCHENS = ['Gennevilliers', 'Frepillon', 'Draveil'] as const;
type Kitchen = (typeof KITCHENS)[number];
const DEMO_DAY = '2025-10-14'; // the production day of actions A1/A2
const CAPACITY_DAYS = daysBetween('2025-10-01', '2025-10-30'); // 30 kitchen-days per kitchen
const PRODUCTION_START = '2025-08-01'; // Lieu_Production / Date_Production are empty before

const PEOPLE = codes('PERS', 8, 60, 2);
const AUTHORS = codes('AUT', 4, 20, 2);
const SALES = codes('COM', 5, 12, 2);
const PARENTS = codes('P', 8, 70, 2);
const BANNERS = codes('E', 5, 30, 2);
const PRICE_LISTS = codes('NP', 6, 90, 2);
const CATALOGUES = codes('CAT', 3, 40, 2);
const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Invented dish and drink names (none taken from Kumo's catalogue).
type ArticleSpec = { name: string; family: string; bigFamily: string; category: string; kitchen: Kitchen | 'Externe'; weight: string };
const ARTICLE_SPECS: ArticleSpec[] = [
  { name: 'Riz Sauté Légumes Croquants', family: 'Riz et Nouilles', bigFamily: 'Gamme Street Food', category: 'Riz et Nouilles', kitchen: 'Draveil', weight: '350g' },
  { name: 'Nouilles Bœuf Gingembre', family: 'Riz et Nouilles', bigFamily: 'Gamme Street Food', category: 'Riz et Nouilles', kitchen: 'Draveil', weight: '350g' },
  { name: 'Poulet Coco Citronnelle', family: 'Plats Asiatiques', bigFamily: 'Gamme Street Food', category: 'Plats Asiatiques', kitchen: 'Draveil', weight: '350g' },
  { name: 'Bol Tofu Sésame Grillé', family: 'Bowls', bigFamily: 'Gamme Bols', category: 'Bowls', kitchen: 'Gennevilliers', weight: '320g' },
  { name: 'Curry Vert Légumes du Marché', family: 'Plats Asiatiques', bigFamily: 'Gamme Street Food', category: 'Plats Asiatiques', kitchen: 'Draveil', weight: '350g' },
  { name: 'Raviolis Vapeur Légumes (5 pcs)', family: 'Entrées', bigFamily: 'Gamme Street Food', category: 'Entrées', kitchen: 'Draveil', weight: '150g' },
  { name: 'Maki Concombre Menthe (8 pcs)', family: 'Makis', bigFamily: 'Gamme Sushi', category: 'Makis', kitchen: 'Gennevilliers', weight: '180g' },
  { name: 'Boule de Riz Thon Ciboulette', family: 'Boules de riz', bigFamily: 'Gamme Sushi', category: 'Boules de riz', kitchen: 'Gennevilliers', weight: '120g' },
  { name: 'Boule de Riz Poulet Sésame', family: 'Boules de riz', bigFamily: 'Gamme Sushi', category: 'Boules de riz', kitchen: 'Gennevilliers', weight: '120g' },
  { name: 'Assortiment Saumon Agrumes (9 pcs)', family: 'Plateaux', bigFamily: 'Gamme Sushi', category: 'Plateaux', kitchen: 'Gennevilliers', weight: '250g' },
  { name: 'Bol Saumon Mangue', family: 'Bowls', bigFamily: 'Gamme Bols', category: 'Bowls', kitchen: 'Gennevilliers', weight: '330g' },
  { name: 'Rouleaux Printemps Crevette (2 pcs)', family: 'Entrées', bigFamily: 'Gamme Sushi', category: 'Entrées', kitchen: 'Gennevilliers', weight: '160g' },
  { name: 'Hachis Parmentier Maison', family: 'Plats du Jour', bigFamily: 'Gamme Plats du Jour', category: 'Plats du Jour', kitchen: 'Frepillon', weight: '380g' },
  { name: 'Lasagnes Légumes Ricotta', family: 'Plats du Jour', bigFamily: 'Gamme Plats du Jour', category: 'Plats du Jour', kitchen: 'Frepillon', weight: '380g' },
  { name: 'Couscous Légumes Pois Chiches', family: 'Plats du Jour', bigFamily: 'Gamme Plats du Jour', category: 'Plats du Jour', kitchen: 'Frepillon', weight: '400g' },
  { name: 'Risotto Champignons Parmesan', family: 'Plats du Jour', bigFamily: 'Gamme Plats du Jour', category: 'Plats du Jour', kitchen: 'Frepillon', weight: '350g' },
  { name: 'Wrap Poulet Curry Doux', family: 'Sur le pouce', bigFamily: 'Gamme Sur le pouce', category: 'Sur le pouce', kitchen: 'Frepillon', weight: '200g' },
  { name: 'Taboulé Menthe Citron', family: 'Salades', bigFamily: 'Gamme Sur le pouce', category: 'Salades', kitchen: 'Frepillon', weight: '250g' },
  { name: 'Salade Lentilles Feta', family: 'Salades', bigFamily: 'Gamme Sur le pouce', category: 'Salades', kitchen: 'Frepillon', weight: '250g' },
  { name: 'Quiche Poireaux Chèvre', family: 'Sur le pouce', bigFamily: 'Gamme Sur le pouce', category: 'Sur le pouce', kitchen: 'Frepillon', weight: '180g' },
  { name: 'Porc Caramel Riz Jasmin', family: 'Plats Asiatiques', bigFamily: 'Gamme Street Food', category: 'Plats Asiatiques', kitchen: 'Draveil', weight: '350g' },
  { name: 'Soupe Potiron Coco', family: 'Soupes', bigFamily: 'Gamme Plats du Jour', category: 'Soupes', kitchen: 'Frepillon', weight: '300g' },
  { name: 'Brochettes Poulet Citron (3 pcs)', family: 'Entrées', bigFamily: 'Gamme Street Food', category: 'Entrées', kitchen: 'Draveil', weight: '180g' },
  { name: 'Crumble Pomme Cannelle', family: 'Dessert', bigFamily: 'Gamme Desserts', category: 'Dessert', kitchen: 'Frepillon', weight: '120g' },
  { name: 'Riz au Lait Vanille', family: 'Dessert', bigFamily: 'Gamme Desserts', category: 'Dessert', kitchen: 'Frepillon', weight: '120g' },
  { name: 'Mousse Chocolat Noir', family: 'Dessert', bigFamily: 'Gamme Desserts', category: 'Dessert', kitchen: 'Gennevilliers', weight: '90g' },
  { name: 'Salade Chou Sésame', family: 'Salades', bigFamily: 'Gamme Sushi', category: 'Salades', kitchen: 'Gennevilliers', weight: '120g' },
  { name: 'Bao Légumes Laqués', family: 'Entrées', bigFamily: 'Gamme Street Food', category: 'Entrées', kitchen: 'Draveil', weight: '140g' },
  { name: 'Thé Glacé Pêche Basilic 33cl', family: 'Boisson', bigFamily: 'Gamme Boissons', category: 'Boisson', kitchen: 'Externe', weight: '' },
  { name: 'Limonade Gingembre 33cl', family: 'Boisson', bigFamily: 'Gamme Boissons', category: 'Boisson', kitchen: 'Externe', weight: '' },
];

// ---------- clients (20) ----------

type Client = { id: string; zone: 'IDF' | 'LYON'; active: boolean; contract: string; priceList: string; noDocuments: boolean };
const clientIds = codes('C', 20, 893).sort();
const clientZones: ('IDF' | 'LYON')[] = sample([...Array(14).fill('IDF'), ...Array(6).fill('LYON')], 20);
const inactiveIdx = new Set(sample([...Array(20).keys()], 2));
const noDocIdx = new Set(sample([...Array(20).keys()].filter((i) => !inactiveIdx.has(i)), 2));
const clients: Client[] = clientIds.map((id, i) => ({
  id,
  zone: clientZones[i],
  active: !inactiveIdx.has(i),
  contract: pick(['Dépôt Vente', 'Dépôt Vente', 'Dépôt Vente', 'Achat Vente', 'Kiosque']),
  priceList: pick(PRICE_LISTS),
  noDocuments: noDocIdx.has(i),
}));

// ---------- articles (30) ----------

type Article = ArticleSpec & { id: string; active: boolean; dlc: string };
const articleIds = codes('A', 30, 1135).sort();
const inactiveArticles = new Set(sample([...Array(30).keys()], 2));
const articles: Article[] = ARTICLE_SPECS.map((s, i) => ({
  ...s,
  id: articleIds[i],
  active: !inactiveArticles.has(i),
  dlc: s.kitchen === 'Externe' ? '' : s.family === 'Boules de riz' || s.family === 'Makis' ? pick(['J+1', 'J+2']) : pick(['J+3', 'J+3', 'J+3', 'J+4']),
}));
const produced = articles.filter((a) => a.kitchen !== 'Externe');
const UNKNOWN_ARTICLE = { id: 'A' + pad(1136 + int(0, 50), 4), name: 'Plat Saisonnier Retiré' };

// ---------- order lines ----------

type Line = Row & { No_Transaction: string; Date: string; ID_Interne_Article_Netsuite: string; Quantite: number };
const lines: Line[] = [];
const ordering = clients.filter((c) => !c.noDocuments);
const docNumbers = sample(Array.from({ length: 140_000 }, (_, i) => i + 1), 180);
let docCursor = 0;

function makeDoc(kind: 'SO' | 'RMA', date: string, client: Client, items: { article: Article | typeof UNKNOWN_ARTICLE; qty: number }[]): void {
  const num = docNumbers[docCursor++];
  const no = `${kind}-${pad(num, 6)}`;
  const withProduction = kind === 'SO' && date >= PRODUCTION_START;
  const created = d(date) - int(2, 6) * DAY + timeOfDay(8, 10);
  const modified = d(date) + int(1, 12) * DAY + timeOfDay(0, 1);
  items.forEach(({ article, qty }, i) => {
    const kitchen = 'kitchen' in article ? article.kitchen : 'Externe';
    const row: Line = {
      No_Transaction: no,
      Date: date,
      ID_Interne_Client_Netsuite: client.id,
      ID_Interne_Article_Netsuite: article.id,
      Nom_Client_Netsuite: client.id,
      Nom_Article_Netsuite: article.name,
      Quantite: qty,
      ID_interne: num,
    };
    if (withProduction) {
      const algo = Math.max(1, qty + pick([0, 0, 0, -1, 1]));
      Object.assign(row, {
        Algo_Manu: algo,
        Algo_Virany: chance(0.5) ? Math.max(1, algo + pick([0, -1, 1])) : null,
        Modif_Manuelle: algo !== qty ? qty : null,
        Date_de_creation: isoDateTime(created - (created % 60_000)),
        Derniere_modification: isoDateTime(modified - (modified % 60_000)),
        Quantite_prevue: qty,
        Quantite_livree: qty,
        Quantite_facturee: chance(0.85) ? qty : 0,
        Lieu_Production: kitchen === 'Externe' ? null : kitchen,
        Date_Production: kitchen === 'Externe' ? null : isoDate(d(date) - DAY),
        ID_de_ligne: i + 1,
        Derniere_Modification_Clean: chance(0.08) ? `${frDate(modified)} Set By ${pick(AUTHORS)}` : null,
      });
    }
    lines.push(row);
  });
}

function randomItems(pool: readonly Article[], n: number, sign: 1 | -1, exclude: Set<string> = new Set()): { article: Article; qty: number }[] {
  return sample(pool.filter((a) => !exclude.has(a.id)), n).map((article) => ({ article, qty: sign * pick([1, 1, 2, 2, 3, 4, 5, 6]) }));
}

// The two lots of actions A1 / A2: Frepillon, production day DEMO_DAY (delivery the next day).
const deliveryOfDemoDay = isoDate(d(DEMO_DAY) + DAY);
const frepillonArticles = sample(produced.filter((a) => a.kitchen === 'Frepillon' && a.active), 2);
const LOT_6 = frepillonArticles[0];
const LOT_15 = frepillonArticles[1];
const demoExclude = new Set([LOT_6.id, LOT_15.id]);

// 120 SO documents: 60 before August (no production place), 60 delivered 2025-10-02 … 2025-10-31.
const preAugustDays = daysBetween('2025-01-02', '2025-07-31');
const octoberDeliveries = daysBetween('2025-10-02', '2025-10-31');
const soDates = [
  ...sample(preAugustDays, 60).sort(),
  ...octoberDeliveries,
  ...sample(octoberDeliveries.filter((x) => x !== deliveryOfDemoDay), 28),
  deliveryOfDemoDay, deliveryOfDemoDay, // three documents on the demo delivery day
].sort();
soDates.forEach((date) => {
  const n = int(5, 13);
  const pool = date >= PRODUCTION_START ? articles.filter((a) => a.active) : articles;
  const items = randomItems(pool, n, 1, date === deliveryOfDemoDay ? demoExclude : new Set());
  makeDoc('SO', date, pick(ordering), items);
});
// Inject the demo lots: 2 + 4 = 6 units and 6 + 5 + 4 = 15 units, spread over the demo day's documents.
{
  const injections: [Article, number][] = [[LOT_6, 2], [LOT_6, 4], [LOT_15, 6], [LOT_15, 5], [LOT_15, 4]];
  const docsOfDay = [...new Set(lines.filter((l) => l.Date === deliveryOfDemoDay).map((l) => l.No_Transaction))];
  const targets = [docsOfDay[0], docsOfDay[1], docsOfDay[0], docsOfDay[1], docsOfDay[2]];
  injections.forEach(([article, qty], k) => {
    const template = lines.filter((l) => l.No_Transaction === targets[k]);
    const last = template[template.length - 1];
    const at = lines.indexOf(last) + 1;
    lines.splice(at, 0, {
      ...last,
      ID_Interne_Article_Netsuite: article.id,
      Nom_Article_Netsuite: article.name,
      Quantite: qty,
      Algo_Manu: qty,
      Algo_Virany: null,
      Modif_Manuelle: null,
      Quantite_prevue: qty,
      Quantite_livree: qty,
      Quantite_facturee: qty,
      Lieu_Production: 'Frepillon',
      Date_Production: DEMO_DAY,
      ID_de_ligne: Number(last.ID_de_ligne) + 1,
    });
  });
}
// One pre-August line whose article is not in the articles file.
{
  const firstPre = lines.findIndex((l) => l.Date < PRODUCTION_START);
  lines.splice(firstPre + 1, 0, { ...lines[firstPre], ID_Interne_Article_Netsuite: UNKNOWN_ARTICLE.id, Nom_Article_Netsuite: UNKNOWN_ARTICLE.name, Quantite: 2 });
}
// 60 RMA documents: returns, negative quantities, no production place.
sample(daysBetween('2025-01-03', '2025-10-31'), 60).sort().forEach((date) => {
  makeDoc('RMA', date, pick(ordering), randomItems(articles, int(4, 9), -1));
});
lines.sort((a, b) => (a.Date === b.Date ? 0 : a.Date < b.Date ? -1 : 1)); // stable: keeps lines of a document together

// ---------- kitchen-days: capacity from load ----------

const charge = new Map<string, number>(); // `${kitchen}|${day}` → units to produce
for (const k of KITCHENS) for (const day of CAPACITY_DAYS) charge.set(`${k}|${day}`, 0);
for (const l of lines) {
  if (l.Lieu_Production) {
    const key = `${l.Lieu_Production}|${l.Date_Production}`;
    if (!charge.has(key)) throw new Error(`production lot without a kitchen-day: ${key}`);
    charge.set(key, (charge.get(key) ?? 0) + l.Quantite);
  }
}
const overDays = new Set([`Frepillon|${DEMO_DAY}`, 'Draveil|2025-10-07', 'Gennevilliers|2025-10-23']);
const capacity = new Map<string, number>();
for (const [key, load] of charge) {
  let cap: number;
  if (key === `Gennevilliers|${DEMO_DAY}`) cap = load + 10;
  else if (key === `Frepillon|${DEMO_DAY}`) cap = load - 8;
  else if (overDays.has(key)) cap = Math.max(1, load - int(2, 5));
  else cap = load + int(12, 30);
  capacity.set(key, cap);
}

// ---------- tables ----------

const tables = {} as Record<Table, Row[]>;

tables.CLIENTS_NETSUITE = clients.map((c) => {
  const mix = sample(produced, int(4, 9)).map((a) => a.name).sort();
  const launched = d('2023-05-01') + int(0, 800) * DAY;
  const lateLaunch = c.noDocuments ? d('2025-11-03') + int(0, 20) * DAY : launched;
  return {
    ID_interne: c.id,
    Nom: c.id,
    Cat_gorie: pick(['Grande & Moyenne Surface', 'Grande & Moyenne Surface', 'Restauration Collective', 'Degustation']),
    Filiale_principale: 'KUMO',
    Type_de_Contrat: c.contract,
    Type_de_Commandes: pick(['Auto', 'Auto', 'Manuelles', 'App Kumo']),
    Jours_de_Livraison: chance(0.85) ? sample(WEEKDAYS, int(2, 5)).sort().join(',') : null,
    Pr_sentoir: chance(0.4) ? pick(['Rayon', 'VSV 95', 'VLS 50']) : null,
    Mix_Produit: mix.join(','),
    Mode_de_Production_pour_Livraison: pick(['J-1', 'J-1', 'J-2', 'J']),
    Zone_Distribution: c.zone,
    Niveau_de_prix: c.priceList,
    Commercial: pick(SALES),
    Nom_du_Parent: pick(PARENTS),
    Client_Actif: c.active,
    Date_de_cr_ation: frDateTime(lateLaunch - int(5, 40) * DAY + timeOfDay(9, 20)),
    VIP: chance(0.4) ? pick(['STANDARD', 'IMPORTANT', 'PRIORITAIRE']) : null,
    Date_de_Lancement: frDate(lateLaunch),
    Coefficient_Algo: chance(0.5) ? `${pick([60, 75, 80, 100])}.0%` : null,
    Facturation_Sp_cifique: chance(0.6),
    Arr_t_Provisoire: 'Non',
    Typologie_de_Facturation: pick(['Classique', 'Caisse', 'DEP & REC 7J']),
    Commande_Fixe_Jour: null,
    Quantit_s_Premi_re_Commande: chance(0.15) ? int(2, 5) : null,
    DA: false,
    Tier: chance(0.75) ? int(1, 4) : null,
    Etiquette: pick(['Avec Prix', 'Sans Prix']),
    Classement_Mag: chance(0.35) ? int(1, 300) : null,
    Compte_Pr_visionnel: false,
    Martees_Store: null,
    Enseigne: pick(BANNERS),
    Send_To_MyTroopers: chance(0.7),
    Send_Packing_Slip: chance(0.7),
    Inactif: !c.active,
    Qt_s_Mix_Produit_Ouverture: chance(0.3) ? mix.slice(0, 3).map((m) => `${m}: ${int(2, 4)}`).join(', ') : null,
    Mode_de_facturation: pick(['Facture Groupée', 'Par Transaction']),
    Fr_quence_de_facturation: pick(['Hebdomadaire', 'Mensuelle', 'Jounalière']),
    Jour_de_facturation_Hebdo: chance(0.5) ? 'Dimanche' : null,
    Jour_de_facturation_Mois: null,
    Type_d_envoi_facturation: pick(['Envoi Par transaction', 'Relevé Mensuel']),
    Envoi_Email_Automatique: chance(0.8),
    Mix_Produit_Long: mix.join(','),
    Zone_Unifiee: c.zone,
    Typologie_du_lieu: chance(0.25) ? pick(['Zone residentielle', 'Zone business', 'Entreprise']) : null,
    BL_Pr_visionnel: chance(0.5),
    Horaires_de_livraison_d_but: pick(['6:00', '6:30', '7:00', '8:00']),
    Horaires_de_livraison_fin: pick(['10:00', '11:00', '11:30']),
    Production_Prioritaire: chance(0.1),
    Exclure_Flux_Ops_Rapports: false,
    App_Kumo: chance(0.4),
    Exclure_Reporting: false,
    Cluster: chance(0.4) ? pick(['A', 'B', 'C', 'D']) : null,
    MTS_Delivery_Type: 'Order Product Only / EAN Scanning Option',
    Capacite: chance(0.4) ? pick([60, 84, 116, 120]) : null,
    VENTES_WE: chance(0.3) ? pick(['Non', 'Normal', 'Oui']) : null,
    VENTES_Deb_Sem: chance(0.3) ? pick(['Normal', 'Fort']) : null,
    Validation_Compta: true,
    Type_de_Magasin: chance(0.8) ? pick(['Franchisé', 'Intégré', 'Location gérance']) : null,
  };
});

tables.ARTICLES_NETSUITE = articles.map((a) => {
  const created = d('2023-05-01') + int(0, 700) * DAY + timeOfDay(9, 21);
  return {
    ID_interne: a.id,
    Nom: a.name,
    Nom_d_affichage: a.name,
    Typologie_Client: sample(['Grande & Moyenne Surface', 'Restauration Collective', 'Kiosque', 'Degustation'], int(1, 3)).sort().join(','),
    Article_Actif: a.active,
    Ordre_de_Production: a.kitchen !== 'Externe' && chance(0.3) ? 'J-1' : null,
    Article_affili_BDD: a.name,
    Produire: a.kitchen !== 'Externe',
    Date_de_cr_ation: frDateTime(created),
    Inactif: !a.active,
    Quantit_Fixe: false,
    Famille_Produit: a.family,
    Colisage: chance(0.3) ? pick([1, 2, 6]) : null,
    Nom_Mercuriale: a.name,
    Article_Avoir_Actif: chance(0.7),
    Date_de_Lancement: frDate(created + int(2, 30) * DAY),
    Grande_Famille_Produit: a.bigFamily,
    Article_Easilys_Actif: a.kitchen !== 'Externe',
    LABO: a.kitchen === 'Externe' ? 'Externe' : `IDF ${a.kitchen}`,
    A_pour_B: false,
    Derni_re_modification: frDateTime(d('2026-02-05') + timeOfDay(15, 16)),
    DLC: a.dlc,
    Poids: a.weight,
    Ordre_Picking_Provinces: int(1, 60),
    Categorie_Produits: a.category,
    Ordre_Picking_IDF: int(1, 60),
    Type_de_Production: a.kitchen === 'Externe' ? 'Externe' : pick(['Prod Centrale', 'Prod Centrale', 'Prod Hybride']),
    Groupe_Produit: chance(0.3) ? a.family : null,
    Exclure_Reporting: false,
    Exclure_App: false,
    Trame_Sushi: a.bigFamily === 'Gamme Sushi',
    Core_Product: chance(0.3),
  };
});

tables.COMMANDES_NETSUITE_2025 = lines;

tables.FACTURES_AVOIRS_2025 = (() => {
  const rows: Row[] = [];
  const docs = codes('CM-', 8, 20000, 6);
  for (const no of docs) {
    const date = isoDate(d('2025-01-02') + int(0, 300) * DAY);
    const c = pick(ordering);
    for (const a of sample(articles, int(3, 6))) {
      rows.push({ No_Transaction: no, Date: date, ID_Interne_Client_Netsuite: c.id, ID_Interne_Article_Netsuite: a.id, Nom_Client_Brut: c.id, Nom_Article_Brut: a.name, Quantite: -int(1, 3), Taux_TVA: a.family === 'Boisson' ? 0.2 : 0.055 });
    }
  }
  return rows.sort((x, y) => String(x.Date).localeCompare(String(y.Date))).slice(0, 40);
})();

tables.MERCURIALES_NETSUITE = sample(PRICE_LISTS.flatMap((np) => articles.map((a) => [np, a] as const)), 40)
  .sort(([n1, a1], [n2, a2]) => n1.localeCompare(n2) || a1.id.localeCompare(a2.id))
  .map(([np, a]) => ({
    niveau_de_prix: np,
    article_id_interne: a.id,
    article: a.name,
    nom_affichage: a.name,
    nom_mercuriale: a.name,
    inactif: !a.active,
    article_actif: a.active,
    article_affilie_bdd: a.id,
    grande_famille_produit: `${(ARTICLE_SPECS.findIndex((s) => s.bigFamily === a.bigFamily) % 18) + 1}.0`,
    famille_produit: `${(ARTICLE_SPECS.findIndex((s) => s.family === a.family) * 7 % 160) + 1}.0`,
    groupe_produit: chance(0.7) ? int(1, 12) : null,
    dlc: a.dlc ? Number(a.dlc.replace('J+', '').replace('J', '0')) : null,
    poids: a.weight || null,
    id_interne_catalogue: pick(CATALOGUES),
  }));

function appRows(n: number, kind: 'orders' | 'stocks' | 'kiosk'): Row[] {
  const rows: Row[] = [];
  let ext = int(100, 1500);
  while (rows.length < n) {
    const c = pick(ordering);
    const day = d('2025-05-05') + int(0, 180) * DAY;
    const extId = `APP${pad(ext++, 5)}`;
    const person = pick(PEOPLE);
    for (const a of sample(produced, int(2, 4))) {
      if (rows.length >= n) break;
      const created = day + timeOfDay(6, 13);
      const base: Row = {
        order_date: isoDate(day), store_name: c.id, store_id: c.id, external_id: extId,
        created_at: appTimestamp(created), updated_at: appTimestamp(created + int(1, 150) * DAY),
        user_email: person, status: 'submitted', product_id: a.id, product_name: a.name,
        lieu: `KUMO ${a.kitchen}`,
      };
      if (kind === 'orders') rows.push({ ...base, quantity: int(1, 6), mercuriale: c.priceList });
      else if (kind === 'stocks') {
        const stockJ1 = chance(0.5) ? int(0, 6) : null;
        rows.push({ ...base, quantity: -int(1, 6), stock_j1: stockJ1, qte_final: int(0, 4), vitrine_note_agencement: chance(0.3) ? int(1, 5) : null, produits_perimes: chance(0.1), vitrine_bien_chargee: chance(0.6), poids_stock_total: null, poids_stock_dlc_j: null, dlc_rayon: chance(0.3) ? a.dlc : null, bl_j1: int(0, 6) });
      } else {
        const byWeight = chance(0.3);
        rows.push({ ...base, quantity: int(1, 4), mercuriale: c.priceList, poids: byWeight ? (int(1, 50) / 100).toFixed(2).replace(/0$/, '') : null });
      }
    }
  }
  return rows;
}
tables.APP_COMMANDES_2025 = appRows(40, 'orders');
tables.APP_STOCKS_2025 = appRows(40, 'stocks');
tables.APP_KIOSQUE_INVENDUS_2025 = appRows(30, 'kiosk');
tables.APP_KIOSQUE_PRODUCTION_2025 = appRows(20, 'kiosk');

tables.IMPORTS_NETSUITE_2025 = (() => {
  const rows: Row[] = [];
  let send = int(10, 90);
  let imp = int(10, 400);
  let line = int(100, 900);
  while (rows.length < 40) {
    const c = pick(ordering);
    const at = d('2025-11-03') + int(0, 40) * DAY + timeOfDay(8, 18);
    const update = `ENV${pad(send++, 4)}`;
    const person = pick(PEOPLE);
    for (let k = 0; k < int(3, 6) && rows.length < 40; k++) {
      const a = pick(produced);
      rows.push({ update_id: update, submission_timestamp: isoDateTime(at), submitted_by_email: person, store_id: c.id, store_name: c.id, Date: isoDate(at + int(2, 12) * DAY), ID_Interne_Client_Netsuite: c.id, ID_Interne_Article_Netsuite: a.id, Qty: int(1, 5), ID_Externe_Commande: `IMP${pad(imp + (k % 2), 5)}`, ID_Externe_Ligne_Commande: `IMPL${pad(line++, 6)}`, Lieu: `KUMO ${a.kitchen}`, Niveau_de_Prix: c.priceList });
    }
    imp += 2;
  }
  return rows;
})();

tables.MIX_PRODUIT_EXPORTS_2025 = (() => {
  const rows: Row[] = [];
  let send = int(10, 90);
  while (rows.length < 40) {
    const c = pick(ordering);
    const at = d('2025-11-03') + int(0, 40) * DAY + timeOfDay(8, 18);
    const update = `ENV${pad(send++, 4)}`;
    const person = pick(PEOPLE);
    for (const a of sample(produced, int(5, 9))) {
      if (rows.length >= 40) break;
      rows.push({ update_id: update, submission_timestamp: isoDateTime(at), submitted_by_email: person, store_id: c.id, ID_Interne_Client: c.id, Client: c.id, ID_interne_Article: a.id, Article: `[enseigne] - ${a.name}` });
    }
  }
  return rows;
})();

const shelfSystems = codes('kumo', 6, 30, 3);
tables.ETAGERES_CORRESPONDANCE = shelfSystems.flatMap((pc, i) => {
  const showcase = `PF${int(60000, 69999)}`;
  const shops = sample(ordering, i < 2 ? 2 : 1);
  return shops.map((c, k) => {
    const installed = d('2025-02-01') + int(0, 160) * DAY;
    const unplugged = shops.length === 2 && k === 0;
    return { PC: pc, VITRINE: showcase, MAGASIN: c.id, ID_Interne: c.id, DATE_INSTAL: isoDate(installed), DATE_DEBRANCHE: unplugged ? isoDate(installed + int(20, 90) * DAY) : null, STATUT_LAST: null, ETAT: unplugged ? 'NONACTIF' : 'ACTIF' };
  });
});

tables.ETAGERES_MESURES_2025 = (() => {
  const rows: Row[] = [];
  let t = d('2025-04-01') + 6 * 3_600_000;
  while (rows.length < 50) {
    t += int(3, 400) * 1000;
    const side = pick(['G', 'D']);
    const level = int(1, 5);
    const paris = t + 2 * 3_600_000;
    rows.push({ system_name: pick(shelfSystems), type: 'vsv50split', shelf_position: `c${level}${side}`, shelf_usb_port: `left_${side === 'G' ? 'int' : 'ext'}_${level}`, 'date__iso8601__Paris_': isoDateTime(t), 'date__YYYY_MM_DD_': isoDate(paris), 'date__HH_MM_': isoDateTime(paris).slice(11, 16) + ':00', weight_variation: ((chance(0.5) ? 1 : -1) * int(100, 4500) / 10).toFixed(1) });
  }
  return rows;
})();

tables.CUISINES_REFERENTIEL = [
  { Lieu_Production: 'Gennevilliers', Region: 'IDF', Specialite: 'Sushi', Coef_Efficacite: 1.04, Effectif_Max_Jour: 12 },
  { Lieu_Production: 'Frepillon', Region: 'IDF', Specialite: 'Plats du jour & sur le pouce', Coef_Efficacite: 1.0, Effectif_Max_Jour: 14 },
  { Lieu_Production: 'Draveil', Region: 'IDF', Specialite: 'Street food asiatique', Coef_Efficacite: 0.97, Effectif_Max_Jour: 10 },
].map((r) => ({ ...r, Coef_Efficacite: r.Coef_Efficacite.toFixed(2) }));

const WORKSHOP: Record<Kitchen, string> = { Gennevilliers: 'Assemblage froid', Frepillon: 'Cuisson', Draveil: 'Wok' };
tables.CAPACITE_CUISINES_JOUR_2025 = CAPACITY_DAYS.flatMap((day) =>
  KITCHENS.flatMap((k) => {
    const cap = capacity.get(`${k}|${day}`) ?? 0;
    const load = charge.get(`${k}|${day}`) ?? 0;
    const caps = [Math.ceil(cap / 2), Math.floor(cap / 2)];
    const loads = [Math.ceil(load / 2), Math.floor(load / 2)];
    return (['Matin', 'Apres-midi'] as const).map((shift, s) => {
      const planned = int(1, 3);
      const absent = chance(0.15) ? 1 : 0;
      const temp = absent && chance(0.5) ? 1 : 0;
      const present = Math.max(1, planned - absent + temp);
      const hours = present * 7;
      return {
        Date_Production: day, Lieu_Production: k, Atelier: WORKSHOP[k], Poste: shift,
        Effectif_Prevu: planned, Absents: absent, Interimaires: temp, Effectif_Present: present,
        Heures_Par_Poste: '7.0', Heures_Travaillees: hours.toFixed(1), Heures_Supplementaires: '0.0',
        Productivite_Unites_Heure: (caps[s] / hours).toFixed(2), Capacite_Unites: caps[s],
        Charge_Planifiee_Unites: loads[s],
        Taux_Utilisation: caps[s] ? (loads[s] / caps[s]).toFixed(3) : '0.0',
        Charge_Non_Couverte_Unites: Math.max(0, loads[s] - caps[s]),
      };
    });
  }),
);

tables.STOCKS_MAGASINS_JOUR_2025 = (() => {
  const rows: Row[] = [];
  const pairs = sample(ordering.flatMap((c) => produced.map((a) => [c, a] as const)), 5);
  for (const [c, a] of pairs) {
    let sellable = 0;
    let expired = 0;
    const start = d('2025-03-03') + int(0, 150) * DAY;
    for (let i = 0; i < 10; i++) {
      const delivered = i % 2 === 0 ? int(2, 6) : 0;
      const demand = int(0, 5);
      const available = sellable + delivered;
      const sold = Math.min(demand, available);
      const lost = demand - sold;
      const expiring = i % 3 === 2 ? Math.min(int(0, 2), available - sold) : 0;
      const returned = expired && chance(0.3) ? expired : 0;
      const closeSellable = available - sold - expiring;
      const closeExpired = expired + expiring - returned;
      rows.push({ Date: isoDate(start + i * DAY), ID_Interne_Client_Netsuite: c.id, ID_Interne_Article_Netsuite: a.id, Type_de_Contrat: c.contract, Stock_Ouverture_Vendable: sellable, Stock_Ouverture_Perime: expired, Qte_Livree: delivered, Demande: demand, Qte_Vendue: sold, Ventes_Perdues: lost, Qte_Perimee_Jour: expiring, Qte_Retournee: returned, Qte_Detruite: 0, Stock_Cloture_Vendable: closeSellable, Stock_Cloture_Perime: closeExpired, Stock_Cloture_Total: closeSellable + closeExpired, Jours_Avant_Peremption_Lot_Plus_Ancien: closeSellable ? int(0, 3) : 0 });
      sellable = closeSellable;
      expired = closeExpired;
    }
  }
  return rows;
})();

// ---------- facts (07 §0) and checks ----------

const soDocs = new Set(lines.filter((l) => l.No_Transaction.startsWith('SO-')).map((l) => l.No_Transaction));
const rmaDocs = new Set(lines.filter((l) => l.No_Transaction.startsWith('RMA-')).map((l) => l.No_Transaction));
const articleSet = new Set(articles.map((a) => a.id));
const clientsWithDocs = new Set(lines.map((l) => String(l.ID_Interne_Client_Netsuite)));
const lot = (k: string, day: string, art: string): number =>
  lines.filter((l) => l.Lieu_Production === k && l.Date_Production === day && l.ID_Interne_Article_Netsuite === art).reduce((s, l) => s + l.Quantite, 0);
const lots = new Set(lines.filter((l) => l.Lieu_Production).map((l) => `${l.Lieu_Production}|${l.Date_Production}|${l.ID_Interne_Article_Netsuite}`));
const over = [...charge].filter(([k, load]) => load > (capacity.get(k) ?? 0)).map(([k]) => k).sort();
const kitchenDay = (k: Kitchen) => ({ capacite: capacity.get(`${k}|${DEMO_DAY}`), charge: charge.get(`${k}|${DEMO_DAY}`) });

const facts = {
  seed: SEED,
  files: Object.fromEntries((Object.keys(COLUMNS) as Table[]).map((t) => [fileName(t), tables[t].length])),
  clients: {
    count: clients.length,
    inactive: clients.filter((c) => !c.active).map((c) => c.id),
    withoutDocuments: clients.filter((c) => !clientsWithDocs.has(c.id)).map((c) => c.id),
    zones: { IDF: clients.filter((c) => c.zone === 'IDF').length, LYON: clients.filter((c) => c.zone === 'LYON').length },
  },
  articles: { count: articles.length, inactive: articles.filter((a) => !a.active).map((a) => a.id) },
  orderLines: {
    lines: lines.length,
    soDocuments: soDocs.size,
    rmaDocuments: rmaDocs.size,
    soLines: lines.filter((l) => l.No_Transaction.startsWith('SO-')).length,
    rmaLines: lines.filter((l) => l.No_Transaction.startsWith('RMA-')).length,
    lieuProductionNulls: lines.filter((l) => !l.Lieu_Production).length,
    unknownArticleLines: lines.filter((l) => !articleSet.has(l.ID_Interne_Article_Netsuite)).map((l) => ({ No_Transaction: l.No_Transaction, article: l.ID_Interne_Article_Netsuite })),
    productionLots: lots.size,
  },
  kitchens: [...KITCHENS],
  kitchenDays: { count: charge.size, days: [CAPACITY_DAYS[0], CAPACITY_DAYS[CAPACITY_DAYS.length - 1]], overCapacity: over },
  demoDay: {
    date: DEMO_DAY,
    Gennevilliers: { ...kitchenDay('Gennevilliers'), spare: (capacity.get(`Gennevilliers|${DEMO_DAY}`) ?? 0) - (charge.get(`Gennevilliers|${DEMO_DAY}`) ?? 0) },
    Frepillon: kitchenDay('Frepillon'),
    Draveil: kitchenDay('Draveil'),
    lot6: { lieuProduction: 'Frepillon', dateProduction: DEMO_DAY, article: LOT_6.id, quantity: lot('Frepillon', DEMO_DAY, LOT_6.id) },
    lot15: { lieuProduction: 'Frepillon', dateProduction: DEMO_DAY, article: LOT_15.id, quantity: lot('Frepillon', DEMO_DAY, LOT_15.id) },
  },
};

function fileName(t: Table): string {
  return t === 'COMMANDES_NETSUITE_2025' ? `${t}.csv.gz` : `${t}.csv`;
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`kumo-mini fact violated: ${what}`);
}
const ids = (rows: Row[]) => rows.map((r) => String(r.ID_interne));
check(tables.CLIENTS_NETSUITE.length === 20 && new Set(ids(tables.CLIENTS_NETSUITE)).size === 20, '20 clients, ID_interne unique');
check(facts.clients.inactive.length === 2, '2 inactive clients');
check(facts.clients.zones.IDF + facts.clients.zones.LYON === 20, 'zones IDF / LYON only');
check(tables.ARTICLES_NETSUITE.length === 30 && new Set(ids(tables.ARTICLES_NETSUITE)).size === 30, '30 articles, ID_interne unique');
check(tables.ARTICLES_NETSUITE.some((r) => r.DLC === 'J+3'), 'DLC like J+3');
check(tables.ARTICLES_NETSUITE.every((r) => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(String(r.Date_de_cr_ation))), 'Date_de_cr_ation in DD/MM/YYYY HH:MM');
check(soDocs.size === 120 && rmaDocs.size === 60, '120 SO and 60 RMA documents');
check(lines.length >= 1350 && lines.length <= 1650, `≈1 500 order lines (got ${lines.length})`);
check(lines.every((l) => (l.No_Transaction.startsWith('SO-') ? l.Quantite > 0 : l.Quantite < 0)), 'SO quantities positive, RMA negative');
check(lines.every((l) => l.Date >= PRODUCTION_START || (!l.Lieu_Production && !l.Date_Production)), 'Lieu_Production empty before 2025-08-01');
check(facts.orderLines.unknownArticleLines.length === 1, '1 line with an article missing from the articles file');
check(facts.clients.withoutDocuments.length === 2, '2 clients with no documents');
check(tables.CUISINES_REFERENTIEL.length === 3, '3 kitchens');
check(tables.CAPACITE_CUISINES_JOUR_2025.length === 3 * 30 * 2, '3 kitchens × 30 days × 2 shifts');
check(facts.demoDay.Gennevilliers.spare === 10, 'Gennevilliers has 10 units of spare capacity on 2025-10-14');
check((facts.demoDay.Frepillon.charge ?? 0) > (facts.demoDay.Frepillon.capacite ?? 0), 'Frepillon over capacity on 2025-10-14');
check(facts.demoDay.lot6.quantity === 6 && facts.demoDay.lot15.quantity === 15, 'Frepillon lots of 6 and 15 units on 2025-10-14');
for (const t of Object.keys(COLUMNS) as Table[]) {
  if (!['CLIENTS_NETSUITE', 'ARTICLES_NETSUITE', 'COMMANDES_NETSUITE_2025', 'CAPACITE_CUISINES_JOUR_2025'].includes(t)) check(tables[t].length > 0 && tables[t].length <= 50, `${t}: 1–50 rows`);
}
const realNamesCheck = new Set(articles.map((a) => a.name));
check(realNamesCheck.size === articles.length, 'article names unique');

// ---------- write ----------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const t of Object.keys(COLUMNS) as Table[]) {
  const csv = toCsv(COLUMNS[t], tables[t]);
  const file = join(OUT, fileName(t));
  writeFileSync(file, t === 'COMMANDES_NETSUITE_2025' ? gzipStable(csv) : csv);
}
writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2) + '\n');
console.log(`kumo-mini: ${Object.keys(COLUMNS).length} files in ${OUT}`);
console.log(`facts: ${FACTS_FILE}`);

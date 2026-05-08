// scripts/build-data.mjs
//
// Lee un Google Sheet publicado como CSV (URL en env SHEET_CSV_URL),
// valida su contenido y escribe data.json en la raíz del repo.
//
// El sitio (index.html) hace fetch a ./data.json al cargar; este script
// es lo único que conoce la fuente de origen.
//
// Schema esperado del CSV (case-insensitive en headers):
//   tema           — texto del tema
//   tema_orden     — entero, define orden de aparición
//   candidato      — debe coincidir con CANDIDATES_CANONICAL
//   propuesta      — texto (filas vacías se ignoran)
//
// Filosofía de errores: "fail loud, keep last good snapshot".
// Cualquier inconsistencia aborta y conserva el data.json previo.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SHEET_URL = process.env.SHEET_CSV_URL;
if (!SHEET_URL) {
  console.error("✗ ERROR: la variable de entorno SHEET_CSV_URL no está definida.");
  console.error("  Configúrala en GitHub: Settings → Secrets and variables → Actions → Variables.");
  process.exit(1);
}

// ---- Lista canónica de candidatos -----------------------------------------
// Para añadir/quitar candidatos en el futuro, edita SOLO esta constante.
// El orden aquí es el orden con el que aparecen en el sitio.
const CANDIDATES_CANONICAL = [
  "Iván Cepeda",
  "Abelardo de la Espriella",
  "Sergio Fajardo",
  "Claudia López",
  "Paloma Valencia",
];

const REQUIRED_COLUMNS = ["tema", "tema_orden", "candidato", "propuesta"];

// ---- Parser CSV mínimo -----------------------------------------------------
// Maneja: comillas dobles, comas/saltos de línea/comillas escapadas dentro
// de campos comillados, BOM, CRLF y LF.
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ---- Main ------------------------------------------------------------------
async function main() {
  console.log(`→ descargando CSV…`);
  const res = await fetch(SHEET_URL, { redirect: "follow" });
  if (!res.ok) fail(`HTTP ${res.status} ${res.statusText} al descargar el CSV`);
  const text = await res.text();
  if (!text.trim()) fail("CSV descargado está vacío");

  const allRows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (allRows.length < 2) fail("CSV sin filas de datos (solo header o vacío)");

  const header = allRows[0].map((h) => h.trim().toLowerCase());
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      fail(
        `falta columna obligatoria '${col}'. Headers encontrados: [${header.join(", ")}]`,
      );
    }
  }
  const idx = Object.fromEntries(
    REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)]),
  );

  // Agrupar: tema → { order, candidates: Map<name, string[]> }
  const themesMap = new Map();

  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    const tema = (row[idx.tema] ?? "").trim();
    const orderRaw = (row[idx.tema_orden] ?? "").trim();
    const candidato = (row[idx.candidato] ?? "").trim();
    const propuesta = (row[idx.propuesta] ?? "").trim();

    // Filas con propuesta vacía se ignoran (permite placeholders en el sheet).
    if (!propuesta) continue;

    const fila = r + 1; // número humano de fila (1-indexed con header)
    if (!tema) fail(`fila ${fila}: 'tema' vacío con propuesta presente`);
    if (!candidato) fail(`fila ${fila}: 'candidato' vacío con propuesta presente`);
    const order = Number(orderRaw);
    if (!Number.isFinite(order)) {
      fail(`fila ${fila}: 'tema_orden' no es número ('${orderRaw}')`);
    }
    if (!CANDIDATES_CANONICAL.includes(candidato)) {
      fail(
        `fila ${fila}: candidato '${candidato}' no reconocido.\n` +
          `  Esperados: ${CANDIDATES_CANONICAL.map((c) => `'${c}'`).join(", ")}`,
      );
    }

    let entry = themesMap.get(tema);
    if (!entry) {
      entry = { order, candidates: new Map() };
      themesMap.set(tema, entry);
    } else if (entry.order !== order) {
      fail(
        `tema '${tema}' tiene 'tema_orden' inconsistente entre filas (${entry.order} vs ${order})`,
      );
    }
    let propsForCand = entry.candidates.get(candidato);
    if (!propsForCand) {
      propsForCand = [];
      entry.candidates.set(candidato, propsForCand);
    }
    propsForCand.push(propuesta);
  }

  if (themesMap.size === 0) fail("no se encontraron temas con propuestas");

  // Detectar tema_orden duplicados (no fatal, pero raro — avisa).
  const orderCounts = new Map();
  for (const { order } of themesMap.values()) {
    orderCounts.set(order, (orderCounts.get(order) ?? 0) + 1);
  }
  for (const [order, count] of orderCounts) {
    if (count > 1) console.warn(`⚠ tema_orden ${order} aparece en ${count} temas distintos — el orden entre ellos no está definido`);
  }

  // Ordenar temas y construir output. Cada tema incluye TODOS los candidatos
  // canónicos (con [] si no tienen propuestas), porque el render del sitio
  // itera sobre ese objeto para componer la vista comparativa.
  const sortedThemes = [...themesMap.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0], "es"))
    .map(([theme, { candidates }]) => {
      const candObj = {};
      for (const name of CANDIDATES_CANONICAL) {
        candObj[name] = candidates.get(name) ?? [];
      }
      return { theme, candidates: candObj };
    });

  const out = {
    candidates: CANDIDATES_CANONICAL,
    themes: sortedThemes,
  };

  const totalProposals = sortedThemes.reduce(
    (a, t) => a + Object.values(t.candidates).reduce((b, arr) => b + arr.length, 0),
    0,
  );

  const dest = resolve(process.cwd(), "data.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`✓ data.json escrito en ${dest}`);
  console.log(
    `  ${sortedThemes.length} temas · ${CANDIDATES_CANONICAL.length} candidatos · ${totalProposals} propuestas`,
  );
}

main().catch((err) => {
  console.error(`✗ error inesperado: ${err.stack || err.message}`);
  process.exit(1);
});

# Propuestas ambientales · candidaturas presidenciales Colombia 2026

Sitio estático que recopila y organiza las propuestas sobre medio ambiente
de los programas de gobierno de cinco candidaturas presidenciales para 2026.
Permite comparar por tema o explorar candidato por candidato.

**Sitio en vivo:** https://darc-17.github.io/propuestas_ambientales_2026/

Elaborado para la clase de Introducción a la Economía Ambiental de la
Universidad de los Andes, por María Alejandra Vélez, María José Medellín,
David Rodríguez Caballero y Juan Camilo Jiménez Novoa.

---

## Cómo actualizar las propuestas

Las propuestas viven en un Google Sheet — el sitio **no se edita a mano**.

1. Abre el Sheet (pestaña `web`: tabla con columnas `tema`, `tema_orden`,
   `candidato`, `propuesta`).
2. Edita lo que necesites: añade filas, cambia textos, ajusta el orden con
   `tema_orden`.
3. Espera ~3 minutos (Google Sheets tarda en propagar al CSV publicado).
4. En GitHub: pestaña **Actions** → workflow **"Update data from Google
   Sheet"** → **Run workflow**.
5. ~30 segundos después + 1–2 min de redeploy de Pages, el sitio refleja
   los cambios.

### Esquema del Sheet

| Columna       | Tipo   | Notas                                                |
|---------------|--------|------------------------------------------------------|
| `tema`        | texto  | Idéntico entre filas del mismo tema                  |
| `tema_orden`  | número | Define orden de aparición                            |
| `candidato`   | texto  | Debe coincidir **exactamente** con la lista canónica |
| `propuesta`   | texto  | Saltos de línea permitidos. Filas vacías se ignoran  |

Lista canónica de candidatos:

- Iván Cepeda
- Abelardo de la Espriella
- Sergio Fajardo
- Claudia López
- Paloma Valencia

Para añadir, quitar o renombrar candidatos: editar la constante
`CANDIDATES_CANONICAL` en [`scripts/build-data.mjs`](scripts/build-data.mjs).

### Si el workflow falla

El workflow falla con un mensaje claro y **conserva intacto el `data.json`
previo**, así que el sitio sigue funcionando con los datos anteriores hasta
que arregles la fuente. Errores típicos:

| Mensaje                                  | Causa                                              |
|------------------------------------------|----------------------------------------------------|
| `falta columna obligatoria 'X'`          | Alguien renombró un header del Sheet               |
| `candidato 'X' no reconocido`            | Typo o tilde faltante en una fila                  |
| `tema_orden no es número`                | Esa celda quedó con texto                          |
| `HTTP 404 al descargar el CSV`           | El Sheet dejó de estar publicado                   |
| `CSV descargado está vacío`              | URL apunta a página de login en lugar de al CSV    |

Si la URL del Sheet cambia, actualiza la variable `SHEET_CSV_URL` del repo.

---

## Arquitectura

```
[Google Sheet "web"] ──publish to web──▶ [CSV público]
                                              │
                                              │ trigger manual
                                              ▼
   [GitHub Action: build-data.mjs] ──▶ [commit data.json] ──▶ [Pages redeploy]
                                                                    │
                                                                    ▼
                                            [index.html hace fetch a data.json]
```

### Estructura de archivos

```
.
├── index.html                   # Sitio completo (HTML + CSS + JS inline)
├── data.json                    # Datos generados, commiteados
├── data.initial.csv             # Snapshot inicial (importable al Sheet)
├── README.md
├── scripts/
│   └── build-data.mjs           # CSV → data.json (sin dependencias)
└── .github/
    └── workflows/
        └── update-data.yml      # Workflow manual (workflow_dispatch)
```

---

## Desarrollo local

`index.html` hace `fetch('./data.json')`, así que abrir el archivo con
`file://` no funciona. Necesitas un servidor estático:

```bash
python -m http.server 8000
# o
npx serve .
```

Y abre http://localhost:8000.

### Probar el script de build localmente

```bash
SHEET_CSV_URL="https://docs.google.com/.../pub?output=csv" \
  node scripts/build-data.mjs
```

Sobreescribe `data.json` en el directorio actual. El script no tiene
dependencias externas — basta Node 18+.

---

## Configuración del repo (referencia)

Si alguna vez hay que recrear esto desde cero o moverlo a otro repo:

- **Variable** `SHEET_CSV_URL`: Settings → Secrets and variables → Actions
  → pestaña **Variables** (no Secrets) → URL del CSV publicado.
- **Permisos del workflow**: Settings → Actions → General → Workflow
  permissions → **Read and write permissions**.
- **Pages**: Settings → Pages → Source: Deploy from a branch → `main` →
  `/ (root)`.

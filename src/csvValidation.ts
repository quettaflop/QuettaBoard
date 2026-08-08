// CSV schema + validator for the CSV-upload comparison feature (COMPARE_ONLY
// build). Deliberately small — measured values only, not the ~40-field
// internal ServingRow shape, since nobody would hand-write that.
//
// v1 is closed-loop only. `mode` is optional and reserved for future
// open-loop (rate-based) support so the format doesn't need a breaking
// change later; any value other than "closed" is rejected today rather
// than silently ignored.

export interface MeasuredRow {
  gpu: string;
  model: string;
  backend: string;
  profile: string;
  concurrency: number;
  isl: number;
  osl: number;
  ttft_meas_ms: number;
  tpot_meas_ms: number;
  e2el_meas_ms: number;
  mode: 'closed';
}

export interface ValidationError {
  row: number; // 0 = file/header-level error; otherwise 1-indexed data row (excludes header)
  column?: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; rows: MeasuredRow[] }
  | { ok: false; errors: ValidationError[] };

const REQUIRED_COLUMNS = [
  'gpu', 'model', 'backend', 'profile', 'concurrency', 'isl', 'osl',
  'ttft_meas_ms', 'tpot_meas_ms', 'e2el_meas_ms',
] as const;

const NUMERIC_COLUMNS = new Set<string>([
  'concurrency', 'isl', 'osl', 'ttft_meas_ms', 'tpot_meas_ms', 'e2el_meas_ms',
]);

// Minimal RFC-4180-ish parser: quoted fields, embedded commas, escaped
// quotes (""), \r\n or \n line endings. Covers what a spreadsheet export
// actually produces, not a full spec implementation.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ',') { pushField(); i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { pushRow(); i += 1; continue; }
    field += c; i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

export function validateCsv(text: string): ValidationResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { ok: false, errors: [{ row: 0, message: 'File is empty.' }] };
  }

  const header = table[0].map(h => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [{
        row: 0,
        message: `Missing required column(s): ${missing.join(', ')}. Required: ${REQUIRED_COLUMNS.join(', ')} (optional: mode).`,
      }],
    };
  }

  const colIndex = (name: string) => header.indexOf(name);
  const hasModeColumn = colIndex('mode') !== -1;

  const errors: ValidationError[] = [];
  const rows: MeasuredRow[] = [];

  for (let r = 1; r < table.length; r += 1) {
    const raw = table[r];
    if (raw.length === 1 && raw[0].trim() === '') continue; // trailing blank line
    const rowNum = r; // data row number, header excluded
    const get = (col: string) => (raw[colIndex(col)] ?? '').trim();

    const values: Record<string, string> = {};
    for (const col of REQUIRED_COLUMNS) values[col] = get(col);

    let rowHasError = false;
    for (const col of REQUIRED_COLUMNS) {
      const v = values[col];
      if (v === '') {
        errors.push({ row: rowNum, column: col, message: `row ${rowNum}: '${col}' is required but empty` });
        rowHasError = true;
        continue;
      }
      if (NUMERIC_COLUMNS.has(col)) {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          errors.push({ row: rowNum, column: col, message: `row ${rowNum}: '${col}' must be a number, got "${v}"` });
          rowHasError = true;
        } else if (n <= 0) {
          errors.push({ row: rowNum, column: col, message: `row ${rowNum}: '${col}' must be > 0, got ${n}` });
          rowHasError = true;
        }
      }
    }

    if (hasModeColumn) {
      const m = get('mode').toLowerCase();
      if (m !== '' && m !== 'closed') {
        errors.push({
          row: rowNum,
          column: 'mode',
          message: `row ${rowNum}: 'mode' must be "closed" (open-loop isn't supported yet), got "${m}"`,
        });
        rowHasError = true;
      }
    }

    if (rowHasError) continue;

    rows.push({
      gpu: values.gpu,
      model: values.model,
      backend: values.backend,
      profile: values.profile,
      concurrency: Number(values.concurrency),
      isl: Number(values.isl),
      osl: Number(values.osl),
      ttft_meas_ms: Number(values.ttft_meas_ms),
      tpot_meas_ms: Number(values.tpot_meas_ms),
      e2el_meas_ms: Number(values.e2el_meas_ms),
      mode: 'closed',
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  if (rows.length === 0) return { ok: false, errors: [{ row: 0, message: 'No data rows found (only a header row).' }] };
  return { ok: true, rows };
}

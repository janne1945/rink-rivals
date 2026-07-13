export type CsvRecord = Readonly<Record<string, string>>;

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') {
        index += 1;
      }
      row.push(field.trim());
      field = '';
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += character;
  }

  if (quoted) {
    throw new Error('CSV ended inside a quoted field');
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

export function parseCsv(input: string): CsvRecord[] {
  const rows = parseRows(input.replace(/^\uFEFF/, ''));
  const headers = rows.shift();

  if (!headers || headers.length === 0) {
    throw new Error('CSV requires a header row');
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV header names must be unique');
  }

  return rows.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`,
      );
    }

    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

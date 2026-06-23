// Regresión del parser de archivos AFIP de IVA tras migrar de `xlsx` (CVE de
// prototype pollution sin fix) a exceljs + parser de texto delimitado.

const ExcelJS = require('exceljs');
const { parseAfipFile, parseDelimited } = require('../../src/routes/iva');

async function xlsxBuffer(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  rows.forEach(r => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseAfipFile', () => {
  test('lee un .xlsx a filas de objetos con headers normalizados', async () => {
    const buffer = await xlsxBuffer([
      ['Fecha', 'Numero', 'CUIT'],
      ['01/03/2026', '0001-00000123', '20-12345678-9'],
      ['02/03/2026', '0001-00000124', '27-98765432-1'],
    ]);
    const filas = await parseAfipFile(buffer, 'comprobantes.xlsx');

    expect(filas).toHaveLength(2);
    expect(filas[0].fecha).toBe('01/03/2026');
    expect(filas[0].numero).toBe('0001-00000123');
    expect(filas[0].cuit).toBe('20-12345678-9');
  });

  test('lee un .csv con separador autodetectado', async () => {
    const csv = 'Fecha;Numero;CUIT\n01/03/2026;0001-00000123;20-12345678-9\n';
    const filas = await parseAfipFile(Buffer.from(csv, 'utf8'), 'export.csv');

    expect(filas).toHaveLength(1);
    expect(filas[0].fecha).toBe('01/03/2026');
    expect(filas[0].cuit).toBe('20-12345678-9');
  });

  test('rechaza .xls legacy con error 400', async () => {
    await expect(parseAfipFile(Buffer.from('x'), 'viejo.xls'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('archivo sin filas devuelve []', async () => {
    const buffer = await xlsxBuffer([]);
    const filas = await parseAfipFile(buffer, 'vacio.xlsx');
    expect(filas).toEqual([]);
  });
});

describe('parseDelimited', () => {
  test('autodetecta ; sobre ,', () => {
    expect(parseDelimited('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  test('autodetecta , cuando no hay ;', () => {
    expect(parseDelimited('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  test('quita BOM y comillas envolventes', () => {
    expect(parseDelimited('﻿"a";"b"\n"1";"2"')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

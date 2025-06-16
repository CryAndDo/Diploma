// controllers/reportController.js
const sql = require('mssql');
const ExcelJS = require('exceljs');

// Утилитная функция: проверяет, попадает ли dateStr в любой из диапазонов compRanges
function isCompetitionDay(compRanges, studentId, dateStr) {
  const date = new Date(dateStr);
  return compRanges.some((range) => {
    if (range.StudentId !== studentId) return false;

    // Преобразуем к Date, если это строки или объекты
    const departure =
      range.DepartureDate instanceof Date ? range.DepartureDate : new Date(range.DepartureDate);
    const returnDate =
      range.ReturnDate instanceof Date ? range.ReturnDate : new Date(range.ReturnDate);

    return date >= departure && date <= returnDate;
  });
}

// GET /api/reports/daily-count?date=YYYY-MM-DD
exports.getDailyMealCounts = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Не задан параметр date' });
  try {
    const pool = await sql.connect();
    const result = await pool.request().input('date', sql.Date, date).query(`
        SELECT
          SUM(CASE WHEN mr.Breakfast = 1 AND ds.StudentId IS NULL THEN 1 ELSE 0 END) AS breakfastCount,
          SUM(CASE WHEN mr.Lunch     = 1 AND ds.StudentId IS NULL THEN 1 ELSE 0 END) AS lunchCount,
          SUM(CASE WHEN mr.Snack     = 1 AND ds.StudentId IS NULL THEN 1 ELSE 0 END) AS snackCount,
          SUM(CASE WHEN mr.Dinner    = 1 AND ds.StudentId IS NULL THEN 1 ELSE 0 END) AS dinnerCount
        FROM UorPitanie.MealRequest mr
        LEFT JOIN UorPitanie.SportsCompetitionDays ds
          ON ds.StudentId = mr.StudentId
          AND @date BETWEEN ds.DepartureDate AND ds.ReturnDate
        WHERE mr.RequestDate = @date
      `);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
};

// GET /api/reports/daily?date=YYYY-MM-DD
exports.generateDailyReport = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Не задан параметр date' });

  try {
    const pool = await sql.connect();

    // 1) данные питания
    const dataRes = await pool.request().input('date', sql.Date, date).query(`
        SELECT 
          s.Id           AS StudentId,
          s.FIO,
          g.[Group],
          s.SportType,
          mr.Breakfast,
          mr.Lunch,
          mr.Snack,
          mr.Dinner
        FROM UorPitanie.MealRequest mr
        JOIN UorPitanie.Students s ON mr.StudentId = s.Id
        JOIN dbo.Cards g           ON s.HipNumber   = g.HipNumber
        WHERE mr.RequestDate = @date
        ORDER BY g.[Group], s.FIO
      `);
    const rows = dataRes.recordset;

    // 2) диапазоны соревнований
    const compRanges = (
      await pool.request().query(`
      SELECT StudentId, DepartureDate, ReturnDate
      FROM UorPitanie.SportsCompetitionDays
    `)
    ).recordset;

    // 3) подготовка Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Ежедневный отчёт за ${date}`);

    // стили
    const compFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
    const borderStyle = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // заголовок
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = `Табель питания на ${new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    })}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.addRow([]);

    // группировка по группам
    const grouped = rows.reduce((acc, r) => {
      (acc[r.Group] = acc[r.Group] || []).push(r);
      return acc;
    }, {});

    for (const [grpName, students] of Object.entries(grouped)) {
      // название группы
      const gRow = sheet.addRow([grpName]);
      gRow.font = { bold: true };
      gRow.alignment = { horizontal: 'center' };
      sheet.mergeCells(`A${gRow.number}:G${gRow.number}`);
      for (let col = 1; col <= 7; col++) {
        gRow.getCell(col).border = borderStyle;
      }

      // заголовок колонок
      const hdr = sheet.addRow(['№', 'ФИО', 'Вид спорта', 'Завтрак', 'Обед', 'Полдник', 'Ужин']);
      hdr.font = { bold: true };
      hdr.alignment = { horizontal: 'center' };
      hdr.eachCell((cell) => {
        cell.border = borderStyle;
      });

      let idx = 1;
      for (const s of students) {
        if (
          !s.Breakfast &&
          !s.Lunch &&
          !s.Snack &&
          !s.Dinner &&
          !isCompetitionDay(compRanges, s.StudentId, date)
        ) {
          continue;
        }
        const comp = isCompetitionDay(compRanges, s.StudentId, date);
        const vals = [
          idx++,
          s.FIO,
          s.SportType,
          comp ? 'С' : s.Breakfast ? '✔' : '',
          comp ? 'С' : s.Lunch ? '✔' : '',
          comp ? 'С' : s.Snack ? '✔' : '',
          comp ? 'С' : s.Dinner ? '✔' : '',
        ];
        const row = sheet.addRow(vals);

        // выравнивание и границы
        [1, 3, 4, 5, 6, 7].forEach((c) => {
          row.getCell(c).alignment = { horizontal: 'center' };
        });
        row.eachCell((cell) => {
          cell.border = borderStyle;
        });

        // подсветка соревнований
        if (comp) {
          [4, 5, 6, 7].forEach((c) => {
            row.getCell(c).fill = compFill;
          });
        }
      }

      sheet.addRow([]);
    }

    // Настройка ширины колонок

    // Колонка 1 (№)
    sheet.getColumn(1).width = 5;

    // Колонка 2 (ФИО) — автоширина без сильных ограничений
    {
      const col = sheet.getColumn(2);
      let maxLength = 0;
      col.eachCell({ includeEmpty: false }, (cell) => {
        let text = '';
        const val = cell.value;
        if (typeof val === 'object' && val !== null) {
          if (val.richText) {
            text = val.richText.map((rt) => rt.text).join('');
          } else if (val.text) {
            text = val.text;
          } else if (val.result) {
            text = String(val.result);
          } else if (val instanceof Date) {
            text = val.toLocaleDateString();
          }
        } else {
          text = String(val ?? '');
        }
        // убираем лишние пробелы/переносы
        const cleanText = text.trim().replace(/\s+/g, ' ');
        const length = [...cleanText].length;
        if (length > maxLength) maxLength = length;
      });
      // Сделаем ширину = maxLength + 2 (прибавим небольшой запас)
      col.width = maxLength + 2;
    }

    // Колонка 3 (Вид спорта) — автоширина с ограничением
    // Заменить текущую настройку ширины колонки 3 (Вид спорта)
    {
      const col = sheet.getColumn(3);
      let maxLength = 0;
      col.eachCell({ includeEmpty: false }, (cell) => {
        let text = '';
        const val = cell.value;
        if (typeof val === 'object' && val !== null) {
          if (val.richText) {
            text = val.richText.map((rt) => rt.text).join('');
          } else if (val.text) {
            text = val.text;
          } else {
            text = String(val ?? '');
          }
        } else {
          text = String(val ?? '');
        }
        const cleanText = text.trim().replace(/\s+/g, ' ');
        const length = [...cleanText].length;
        if (length > maxLength) maxLength = length;
      });
      // Увеличим коэффициент и уберём жёсткое ограничение
      col.width = Math.min(maxLength * 1.2 + 2, 30); // Максимум 30
    }

    // Колонки 4–7 (приемы пищи) — фиксированная ширина
    [4, 5, 6, 7].forEach((c) => {
      sheet.getColumn(c).width = 10;
    });

    // отправка
    const asciiName = `DailyReport_${date}.xlsx`;
    const utf8Name = encodeURIComponent(`Ежедневный отчёт за ${date}.xlsx`);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при формировании ежедневного отчёта' });
  }
};

const monthNames = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

// GET /api/reports/monthly?month=YYYY-MM
exports.generateMonthlyReport = async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Не задан параметр month' });
  const [year, mon] = month.split('-').map(Number);
  const daysCount = new Date(year, mon, 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(daysCount).padStart(2, '0')}`;

  try {
    const pool = await sql.connect();

    // 1) достаём все соревнования за период
    const competitions = (
      await pool.request().input('start', sql.Date, startDate).input('end', sql.Date, endDate)
        .query(`
          SELECT StudentId, DepartureDate, ReturnDate
          FROM UorPitanie.SportsCompetitionDays
          WHERE ReturnDate >= @start AND DepartureDate <= @end
        `)
    ).recordset;

    // Строим compMap: compMap[studentId]['YYYY-MM-DD'] = true
    const compMap = {};
    for (const c of competitions) {
      const startD = new Date(c.DepartureDate);
      const endD = new Date(c.ReturnDate);
      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        compMap[c.StudentId] = compMap[c.StudentId] || {};
        compMap[c.StudentId][key] = true;
      }
    }

    // 2) достаём всех студентов
    const studentsAll = (
      await pool.request().query(`
        SELECT s.Id, s.FIO, g.[Group]
        FROM UorPitanie.Students s
        JOIN dbo.Cards g ON s.HipNumber = g.HipNumber
        ORDER BY g.[Group], s.FIO
      `)
    ).recordset;

    // 3) достаём все финализированные запросы за этот месяц
    const requests = (
      await pool.request().input('start', sql.Date, startDate).input('end', sql.Date, endDate)
        .query(`
          SELECT StudentId, RequestDate, Breakfast, Lunch, Snack, Dinner
          FROM UorPitanie.MealRequest
          WHERE IsFinalized = 1 AND RequestDate BETWEEN @start AND @end
        `)
    ).recordset;

    // 4) строим dataMap: dataMap[studentId]['YYYY-MM-DD'] = { breakfast, lunch, snack, dinner, isCompetition }
    const dataMap = {};
    for (const r of requests) {
      const d = r.RequestDate.toISOString().slice(0, 10);
      dataMap[r.StudentId] = dataMap[r.StudentId] || {};
      dataMap[r.StudentId][d] = {
        breakfast: r.Breakfast ? 1 : 0,
        lunch: r.Lunch ? 1 : 0,
        snack: r.Snack ? 1 : 0,
        dinner: r.Dinner ? 1 : 0,
        isCompetition: !!(compMap[r.StudentId] && compMap[r.StudentId][d]),
      };
    }
    // Для дней соревнований без запросов добавляем запись с isCompetition = true
    for (const studentIdStr of Object.keys(compMap)) {
      const sid = Number(studentIdStr);
      for (let d = 1; d <= daysCount; d++) {
        const key = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (compMap[sid] && compMap[sid][key]) {
          dataMap[sid] = dataMap[sid] || {};
          dataMap[sid][key] = dataMap[sid][key] || {
            breakfast: 0,
            lunch: 0,
            snack: 0,
            dinner: 0,
            isCompetition: true,
          };
        }
      }
    }

    // 5) фильтруем студентов: оставляем только тех, у кого есть хотя бы один ненулевой приём или день соревнований
    const students = studentsAll.filter((s) => {
      const dayEntries = dataMap[s.Id];
      if (!dayEntries) return false;
      for (let d = 1; d <= daysCount; d++) {
        const key = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const entry = dayEntries[key];
        if (!entry) continue;
        if (entry.isCompetition) return true;
        if (entry.breakfast || entry.lunch || entry.snack || entry.dinner) {
          return true;
        }
      }
      return false;
    });

    // 6) создаём Workbook
    const wb = new ExcelJS.Workbook();
    const thin = { style: 'thin' };
    const borderAll = { top: thin, left: thin, bottom: thin, right: thin };
    const fontTitle = { bold: true, size: 14 };
    const fontHeader = { bold: true, size: 11 };
    const noteFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
    const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
    const groupFills = ['FFEEF8FF', 'FFFFF0E1', 'FFE6FFEA', 'FFFFE6E6'];

    // 7) Лист «Список групп» — только отфильтрованные студенты
    const list = wb.addWorksheet('Список групп');
    list.columns = [
      {
        header: '№',
        key: 'num',
        width: 5,
        style: { alignment: { horizontal: 'center', vertical: 'middle' } },
      },
      { header: 'Группа', key: 'grp', width: 15 }, // Базовая ширина
      { header: 'ФИО', key: 'fio' }, // Ширину рассчитаем позже
    ];
    list.getRow(1).font = { bold: true };
    list.getRow(1).alignment = { horizontal: 'center' };

    students.forEach((s, i) => {
      list.addRow({ num: i + 1, grp: s.Group, fio: s.FIO });
    });

    // Расчёт автоширины для столбца "ФИО" (колонка 3)
    {
      const colFIO = list.getColumn(3);
      let maxFioLength = 0;
      colFIO.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.value?.toString().trim() || '';
        const length = [...text].length;
        if (length > maxFioLength) maxFioLength = length;
      });
      colFIO.width = Math.min(maxFioLength + 5, 50); // Ширина с запасом
    }

    // Расчёт автоширины для столбца "Группа" (колонка 2)
    {
      const colGroup = list.getColumn(2);
      let maxGroupLength = 0;
      colGroup.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.value?.toString().trim() || '';
        const length = [...text].length;
        if (length > maxGroupLength) maxGroupLength = length;
      });
      colGroup.width = Math.min(maxGroupLength + 2, 20); // Ширина для групп
    }

    // Общая стилизация строк
    for (let i = 1; i <= list.rowCount; i++) {
      const row = list.getRow(i);
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      if (i === 1) {
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      }
      for (let c = 1; c <= 3; c++) {
        row.getCell(c).border = borderAll;
      }
    }

    // 8) разбиваем месяц на две части
    const mid = Math.ceil(daysCount / 2);
    for (const [from, to] of [
      [1, mid],
      [mid + 1, daysCount],
    ]) {
      const title = `${String(from).padStart(2, '0')}-${String(to).padStart(2, '0')} ${
        monthNames[mon - 1]
      }`;
      const sh = wb.addWorksheet(title);
      const span = to - from + 1;
      const lastCol = 2 + span * 4;

      // Примечание "*С — соревнования" в A1:A2
      sh.mergeCells(1, 1, 2, 2);
      Object.assign(sh.getCell(1, 1), {
        value: '*С — соревнования',
        fill: noteFill,
        font: { italic: true },
        alignment: { horizontal: 'left', vertical: 'middle' },
        border: borderAll,
      });

      // Заголовок "Табель питания..."
      sh.mergeCells(1, 3, 2, lastCol);
      Object.assign(sh.getCell(1, 3), {
        value: `Табель питания с ${from} по ${to} ${monthNames[mon - 1]}`,
        font: fontTitle,
        alignment: { horizontal: 'center', vertical: 'middle' },
      });

      sh.getColumn(1).width = 5;
      // Ширину колонки 2 (ФИО) будем рассчитывать позже
      for (let c = 3; c <= lastCol; c++) {
        sh.getColumn(c).width = 6;
      }

      // Столбцы №, ФИО (объединены в строках 3-4)
      sh.mergeCells(3, 1, 4, 1);
      sh.mergeCells(3, 2, 4, 2);
      ['№', 'ФИО'].forEach((t, i) => {
        const c = sh.getCell(3, 1 + i);
        Object.assign(c, {
          value: t,
          font: fontHeader,
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: borderAll,
        });
      });

      // Даты и приёмы пищи в строках 3-4
      for (let d = from; d <= to; d++) {
        const off = (d - from) * 4;
        sh.mergeCells(3, 3 + off, 3, 6 + off);
        const dc = sh.getCell(3, 3 + off);
        Object.assign(dc, {
          value: d,
          font: fontHeader,
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: borderAll,
        });

        ['Завтрак', 'Обед', 'Полдник', 'Ужин'].forEach((m, k) => {
          const mc = sh.getCell(4, 3 + off + k);
          Object.assign(mc, {
            value: m,
            font: fontHeader,
            alignment: { textRotation: 90, horizontal: 'center', vertical: 'middle' },
            border: borderAll,
          });
        });
      }

      // 9) вывод отфильтрованных групп и студентов
      const grpMap = {};
      students.forEach((s) => {
        grpMap[s.Group] = grpMap[s.Group] || [];
        grpMap[s.Group].push(s);
      });

      let rowIdx = 5;
      let fillIndex = 0;
      for (const [grp, members] of Object.entries(grpMap)) {
        const fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: groupFills[fillIndex++ % groupFills.length] },
        };

        members.forEach((s, i) => {
          const r = sh.getRow(rowIdx);
          r.outlineLevel = 1;
          r.getCell(1).value = i + 1;
          r.getCell(2).value = s.FIO;
          [1, 2].forEach((c) => {
            const cell = r.getCell(c);
            Object.assign(cell, {
              fill,
              border: borderAll,
              alignment:
                c === 1
                  ? { horizontal: 'center', vertical: 'middle' }
                  : { horizontal: 'left', vertical: 'middle' },
            });
          });

          for (let d = from; d <= to; d++) {
            const key = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const entry = dataMap[s.Id]?.[key] || {
              breakfast: 0,
              lunch: 0,
              snack: 0,
              dinner: 0,
              isCompetition: false,
            };
            const meals = [
              entry.isCompetition ? 'С' : entry.breakfast,
              entry.isCompetition ? 'С' : entry.lunch,
              entry.isCompetition ? 'С' : entry.snack,
              entry.isCompetition ? 'С' : entry.dinner,
            ];
            meals.forEach((v, k) => {
              const cc = r.getCell(3 + (d - from) * 4 + k);
              Object.assign(cc, {
                value: v,
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: borderAll,
                fill: entry.isCompetition
                  ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }
                  : undefined,
              });
            });
          }

          rowIdx++;
        });
        // Расчёт автоширины для колонки "ФИО"
        {
          const colFIO = sh.getColumn(2);
          let maxFioLength = 0;
          colFIO.eachCell({ includeEmpty: false }, (cell) => {
            const text = cell.value?.toString().trim() || '';
            const length = [...text].length;
            if (length > maxFioLength) maxFioLength = length;
          });
          // Установить ширину с запасом, но не больше 50 символов
          colFIO.width = Math.min(maxFioLength + 5, 50);
        }

        // Итого по группе
        const tr = sh.getRow(rowIdx++);
        tr.getCell(2).value = `Итого ${grp}`;
        Object.assign(tr.getCell(2), {
          font: { bold: true, color: { argb: 'FF000000' } },
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: borderAll,
        });

        for (let d = from; d <= to; d++) {
          const dayKey = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const sums = members.reduce(
            (acc, s) => {
              const e = dataMap[s.Id]?.[dayKey] || {
                breakfast: 0,
                lunch: 0,
                snack: 0,
                dinner: 0,
                isCompetition: false,
              };
              if (e.isCompetition) return acc;
              return [
                acc[0] + (e.breakfast || 0),
                acc[1] + (e.lunch || 0),
                acc[2] + (e.snack || 0),
                acc[3] + (e.dinner || 0),
              ];
            },
            [0, 0, 0, 0],
          );

          sums.forEach((v, k) => {
            const cc = tr.getCell(3 + (d - from) * 4 + k);
            Object.assign(cc, {
              value: v,
              font: { bold: true, color: { argb: 'FF000000' } },
              alignment: { horizontal: 'center', vertical: 'middle' },
              border: borderAll,
            });
          });
        }

        sh.properties.outlineLevelRow = 1;
      }

      // 10) итог всех групп
      const totalRow = sh.getRow(rowIdx);
      sh.mergeCells(rowIdx, 1, rowIdx, 2);
      const totalCell = sh.getCell(rowIdx, 1);
      Object.assign(totalCell, {
        value: 'Итог всех групп',
        fill: totalFill,
        font: { bold: true },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: borderAll,
      });

      for (let d = from; d <= to; d++) {
        for (let k = 0; k < 4; k++) {
          const sum = students.reduce((acc, s) => {
            const dayKey = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const data = dataMap[s.Id]?.[dayKey] || {
              breakfast: 0,
              lunch: 0,
              snack: 0,
              dinner: 0,
              isCompetition: false,
            };
            if (data.isCompetition) return acc;
            if (k === 0) return acc + (data.breakfast || 0);
            if (k === 1) return acc + (data.lunch || 0);
            if (k === 2) return acc + (data.snack || 0);
            return acc + (data.dinner || 0);
          }, 0);

          const cc = sh.getCell(rowIdx, 3 + (d - from) * 4 + k);
          cc.value = sum;
          Object.assign(cc, {
            font: { bold: true, color: { argb: 'FFFF0000' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: borderAll,
          });
        }
      }
      rowIdx++;

      // 11) подписи
      const footerHeight = 3;
      ['Составила ____________ В.В. Заргарян', 'Зам. мед. отд. ____________ И.В. Ищенко'].forEach(
        (text) => {
          sh.mergeCells(rowIdx, 1, rowIdx + footerHeight - 1, lastCol);
          const cell = sh.getCell(rowIdx, 1);
          Object.assign(cell, {
            value: text,
            font: { size: 12 },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: borderAll,
          });
          for (let i = 0; i < footerHeight; i++) {
            sh.getRow(rowIdx + i).height = 20;
          }
          rowIdx += footerHeight;
        },
      );
    }

    // 12) отправка
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', `attachment; filename=MonthlyReport_${month}.xlsx`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при формировании отчёта' });
  }
};

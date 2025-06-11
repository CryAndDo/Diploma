const { getDailyCounts, getDailyDetails } = require('../services/reportService');
const ExcelJS = require('exceljs');

exports.getDailyReport = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Не задан параметр date' });

  // 1) Получаем данные
  const summary = await getDailyCounts(date);
  const details = await getDailyDetails(date);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename=DailyReport_${date}.xlsx`);
  // 2) Генерим Excel
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    useSharedStrings: true,
  });
  const sheet = workbook.addWorksheet('Табель');

  // 3) Оформление
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = `Табель питания на ${date}`;
  sheet.getCell('A1').font = { size: 14, bold: true };
  sheet.addRow([]).commit();
  sheet.addRow(['№', 'Группа', 'ФИО', 'Вид спорта', 'Завтрак', 'Обед', 'Полдник', 'Ужин']).font = {
    bold: true,
  };
  sheet.getRow(3).commit();

  // 4) Заполняем детали
  let idx = 1;
  for (const r of details) {
    sheet
      .addRow([
        idx++,
        r.groupName,
        r.fio,
        r.sportType,
        r.breakfast ? '✔' : '',
        r.lunch ? '✔' : '',
        r.snack ? '✔' : '',
        r.dinner ? '✔' : '',
      ])
      .commit();
  }

  // 5) Финализация

  await workbook.commit(); // отправляет все чанки в ответ
};

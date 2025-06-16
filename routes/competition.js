const express = require('express');
const router = express.Router();
const sql = require('mssql');
const auth = require('../middleware/authMiddleware');
const { sql: sqlType, dbConfig } = require('../db');

// Вспомогательная функция для проверки, что студент существует и не отчислен
async function checkStudentNotExpelled(pool, studentId) {
  const res = await pool.request().input('sid', sql.Int, studentId).query(`
      SELECT IsExpelled
      FROM UorPitanie.Students
      WHERE Id = @sid
    `);

  if (!res.recordset.length) {
    throw new Error('Студент не найден');
  }
  return !res.recordset[0].IsExpelled;
}

// 1) GET /api/competition-days — список приказов с JOIN на студентов, без отчисленных
router.get('/', auth, async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
      SELECT
        d.Id,
        d.StudentId,
        CONVERT(varchar(10), d.DepartureDate, 23) AS DepartureDate,
        CONVERT(varchar(10), d.ReturnDate, 23)    AS ReturnDate,
        s.FIO,
        s.[Group],
        s.SportType
      FROM UorPitanie.SportsCompetitionDays d
      JOIN UorPitanie.Students s ON s.Id = d.StudentId
      WHERE s.IsExpelled = 0
      ORDER BY d.DepartureDate DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Ошибка получения соревнований:', err);
    res.status(500).json({ error: 'Ошибка при загрузке соревнований' });
  }
});

// 2) POST /api/competition-days — добавить новую запись, запрещаем для отчисленных
router.post('/', auth, async (req, res) => {
  const { studentId, departureDate, returnDate } = req.body;
  if (!studentId || !departureDate || !returnDate) {
    return res
      .status(400)
      .json({ error: 'Недостаточно данных: studentId, departureDate, returnDate обязательны' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const allowed = await checkStudentNotExpelled(pool, parseInt(studentId));
    if (!allowed) {
      return res.status(400).json({ error: 'Невозможно добавить: студент отчислен или не найден' });
    }

    await pool
      .request()
      .input('sid', sql.Int, parseInt(studentId))
      .input('dep', sqlType.Date, departureDate)
      .input('ret', sqlType.Date, returnDate).query(`
        INSERT INTO UorPitanie.SportsCompetitionDays
          (StudentId, DepartureDate, ReturnDate)
        VALUES
          (@sid, @dep, @ret)
      `);

    res.status(201).json({ message: 'Добавлено участие в соревнованиях' });
  } catch (err) {
    console.error('Ошибка добавления соревнования:', err);
    res.status(500).json({ error: 'Не удалось добавить соревнование' });
  }
});

// 3) PUT /api/competition-days/:id — обновить запись, запрещаем менять для отчисленных
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { departureDate, returnDate } = req.body;
  if (!departureDate || !returnDate) {
    return res.status(400).json({ error: 'Неверные даты для обновления' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    // Объединённый запрос — сразу получаем StudentId и IsExpelled
    const rec = await pool.request().input('id', sqlType.Int, id).query(`
        SELECT d.StudentId, s.IsExpelled
        FROM UorPitanie.SportsCompetitionDays d
        JOIN UorPitanie.Students s ON s.Id = d.StudentId
        WHERE d.Id = @id
      `);

    if (!rec.recordset.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    if (rec.recordset[0].IsExpelled) {
      return res.status(403).json({ error: 'Невозможно изменить: студент отчислен' });
    }

    await pool
      .request()
      .input('id', sqlType.Int, id)
      .input('dep', sqlType.Date, departureDate)
      .input('ret', sqlType.Date, returnDate).query(`
        UPDATE UorPitanie.SportsCompetitionDays
        SET DepartureDate = @dep, ReturnDate = @ret
        WHERE Id = @id
      `);

    res.json({ message: 'Даты успешно обновлены' });
  } catch (err) {
    console.error('Ошибка обновления соревнования:', err);
    res.status(500).json({ error: 'Ошибка при обновлении записи' });
  }
});

// 4) DELETE /api/competition-days/:id — удалить запись, запрещаем у отчисленных
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConfig);

    // Объединённый запрос — сразу получаем StudentId и IsExpelled
    const rec = await pool.request().input('id', sqlType.Int, id).query(`
        SELECT d.StudentId, s.IsExpelled
        FROM UorPitanie.SportsCompetitionDays d
        JOIN UorPitanie.Students s ON s.Id = d.StudentId
        WHERE d.Id = @id
      `);

    if (!rec.recordset.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    if (rec.recordset[0].IsExpelled) {
      return res.status(403).json({ error: 'Невозможно удалить: студент отчислен' });
    }

    await pool.request().input('id', sqlType.Int, id).query(`
        DELETE FROM UorPitanie.SportsCompetitionDays
        WHERE Id = @id
      `);

    res.json({ message: 'Запись удалена' });
  } catch (err) {
    console.error('Ошибка при удалении соревнования:', err);
    res.status(500).json({ error: 'Не удалось удалить запись' });
  }
});

module.exports = router;

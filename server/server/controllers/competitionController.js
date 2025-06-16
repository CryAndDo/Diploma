// controllers/competitionController.js
const { sql, dbConfig } = require('../db');

// 🔧 Вспомогательная функция — проверка, что студент существует и не отчислен
async function ensureStudentActive(pool, studentId) {
  const check = await pool.request().input('sid', sql.Int, parseInt(studentId)).query(`
      SELECT IsExpelled
      FROM UorPitanie.Students
      WHERE Id = @sid;
    `);

  if (!check.recordset.length) {
    const err = new Error('Студент не найден');
    err.status = 404;
    throw err;
  }

  if (check.recordset[0].IsExpelled) {
    const err = new Error('Невозможно выполнить операцию: студент отчислен');
    err.status = 400;
    throw err;
  }
}

// 1) Поиск студентов (для автокомплита/выбора) — не показываем отчисленных
exports.searchStudents = async (req, res) => {
  const { q } = req.query;
  try {
    const pool = await sql.connect(dbConfig);
    const txt = `%${q || ''}%`;
    const result = await pool.request().input('q', sql.NVarChar(200), txt).query(`
        SELECT TOP(50)
          s.Id,
          s.FIO,
          s.[Group],
          s.SportType
        FROM UorPitanie.Students s
        WHERE (s.FIO LIKE @q OR s.[Group] LIKE @q OR s.SportType LIKE @q)
          AND s.IsExpelled = 0
        ORDER BY s.FIO;
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Ошибка searchStudents:', err);
    res.status(500).json({ error: 'Ошибка поиска студентов' });
  }
};

// 2) Получить все дни соревнований (только активные студенты)
exports.getCompetitionDays = async (req, res) => {
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
        ORDER BY d.DepartureDate DESC;
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Ошибка getCompetitionDays:', err);
    res.status(500).json({ error: 'Ошибка получения соревнований' });
  }
};

// 3) Добавить участие в соревнованиях
exports.addCompetition = async (req, res) => {
  const { studentId, departureDate, returnDate } = req.body;
  if (!studentId || !departureDate || !returnDate) {
    return res.status(400).json({ error: 'Недостаточно данных' });
  }
  try {
    const pool = await sql.connect(dbConfig);

    await ensureStudentActive(pool, studentId);

    await pool
      .request()
      .input('sid', sql.Int, parseInt(studentId))
      .input('dep', sql.Date, departureDate)
      .input('ret', sql.Date, returnDate).query(`
        INSERT INTO UorPitanie.SportsCompetitionDays
          (StudentId, DepartureDate, ReturnDate)
        VALUES (@sid, @dep, @ret);
      `);

    res.status(201).json({ message: 'Добавлено участие в соревнованиях' });
  } catch (err) {
    console.error('Ошибка addCompetition:', err);
    res
      .status(err.status || 500)
      .json({ error: err.message || 'Не удалось добавить соревнование' });
  }
};

// 4) Удалить запись о соревновании
exports.deleteCompetition = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(dbConfig);

    const findRec = await pool.request().input('id', sql.Int, id).query(`
        SELECT StudentId
        FROM UorPitanie.SportsCompetitionDays
        WHERE Id = @id;
      `);

    if (!findRec.recordset.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    const studentId = findRec.recordset[0].StudentId;
    await ensureStudentActive(pool, studentId);

    await pool.request().input('id', sql.Int, id).query(`
        DELETE FROM UorPitanie.SportsCompetitionDays
        WHERE Id = @id;
      `);

    res.json({ message: 'Удалено' });
  } catch (err) {
    console.error('Ошибка deleteCompetition:', err);
    res.status(err.status || 500).json({ error: err.message || 'Не удалось удалить запись' });
  }
};

// 5) Получить ВСЕ соревнования (включая отчисленных)
exports.getAllCompetitions = async (req, res) => {
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
        s.SportType,
        s.IsExpelled
      FROM UorPitanie.SportsCompetitionDays d
      JOIN UorPitanie.Students s ON s.Id = d.StudentId
      ORDER BY d.DepartureDate DESC;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Ошибка getAllCompetitions:', err);
    res.status(500).json({ error: 'Ошибка при загрузке соревнований' });
  }
};

// 6) Обновить запись о соревнованиях
exports.updateCompetition = async (req, res) => {
  const { id } = req.params;
  const { departureDate, returnDate } = req.body;
  if (!departureDate || !returnDate) {
    return res.status(400).json({ error: 'Неверные даты' });
  }
  try {
    const pool = await sql.connect(dbConfig);

    const findRec = await pool.request().input('id', sql.Int, id).query(`
        SELECT StudentId
        FROM UorPitanie.SportsCompetitionDays
        WHERE Id = @id;
      `);
    if (!findRec.recordset.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    const studentId = findRec.recordset[0].StudentId;
    await ensureStudentActive(pool, studentId);

    await pool
      .request()
      .input('id', sql.Int, id)
      .input('dep', sql.Date, departureDate)
      .input('ret', sql.Date, returnDate).query(`
        UPDATE UorPitanie.SportsCompetitionDays
        SET DepartureDate = @dep, ReturnDate = @ret
        WHERE Id = @id;
      `);

    res.json({ message: 'Даты обновлены' });
  } catch (err) {
    console.error('Ошибка updateCompetition:', err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка при обновлении' });
  }
};

const sql = require('mssql');

exports.getRequests = async (req, res) => {
  const studentId = parseInt(req.user.id);
  const date = req.query.date; // ISO yyyy-mm-dd
  try {
    const pool = await sql.connect();
    const result = await pool
      .request()
      .input('sid', sql.Int, studentId)
      .input('date', sql.Date, date).query(`
        SELECT * 
        FROM UorPitanie.MealRequest 
        WHERE StudentId = @sid AND RequestDate = @date
      `);

    res.json(result.recordset[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении заявки' });
  }
};

exports.submitRequest = async (req, res) => {
  const studentId = parseInt(req.user.id);
  const { date, breakfast, lunch, snack, dinner } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Дата не указана' });
  }

  try {
    const pool = await sql.connect();

    await pool
      .request()
      .input('sid', sql.Int, studentId)
      .input('date', sql.Date, date)
      .input('breakfast', sql.Bit, !!breakfast)
      .input('lunch', sql.Bit, !!lunch)
      .input('snack', sql.Bit, !!snack)
      .input('dinner', sql.Bit, !!dinner).query(`
        MERGE UorPitanie.MealRequest AS target
        USING (SELECT @sid AS StudentId, @date AS RequestDate) AS src
        ON target.StudentId = src.StudentId AND target.RequestDate = src.RequestDate
        WHEN MATCHED THEN 
          UPDATE SET Breakfast = @breakfast, Lunch = @lunch, Snack = @snack, Dinner = @dinner
        WHEN NOT MATCHED THEN
          INSERT (StudentId, RequestDate, Breakfast, Lunch, Snack, Dinner)
          VALUES (@sid, @date, @breakfast, @lunch, @snack, @dinner);
      `);

    res.json({ message: 'Заявка сохранена' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при сохранении заявки' });
  }
};

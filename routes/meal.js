const express = require('express');
const router = express.Router();
const sql = require('mssql');
const auth = require('../middleware/authMiddleware'); // JWT-проверка

// защита всех /api/meal
router.use(auth);

// POST /api/meal
router.post('/', async (req, res) => {
  const { date, meals } = req.body;
  const studentId = parseInt(req.user.id);
  if (!studentId || !date || !Array.isArray(meals)) {
    return res.status(400).json({ message: 'Недостаточно данных' });
  }
  try {
    const pool = await sql.connect();
    await pool
      .request()
      .input('sid', sql.Int, parseInt(studentId))
      .input('date', sql.Date, date)
      .input('breakfast', sql.Bit, meals.includes('breakfast'))
      .input('lunch', sql.Bit, meals.includes('lunch'))
      .input('snack', sql.Bit, meals.includes('snack'))
      .input('dinner', sql.Bit, meals.includes('dinner')).query(`
        MERGE UorPitanie.MealRequest AS target
        USING (SELECT @sid AS StudentId, @date AS RequestDate) AS src
        ON target.StudentId = src.StudentId AND target.RequestDate = src.RequestDate
        WHEN MATCHED THEN 
          UPDATE SET Breakfast=@breakfast, Lunch=@lunch, Snack=@snack, Dinner=@dinner
        WHEN NOT MATCHED THEN
          INSERT (StudentId, RequestDate, Breakfast, Lunch, Snack, Dinner)
          VALUES (@sid, @date, @breakfast, @lunch, @snack, @dinner);
      `);
    res.json({ message: 'Данные успешно сохранены' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// GET /api/meal?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const studentId = req.user.id;
  const { date } = req.query;
  if (!studentId || !date) {
    return res.status(400).json({ message: 'Недостаточно данных' });
  }
  try {
    const pool = await sql.connect();
    const result = await pool
      .request()
      .input('sid', sql.Int, parseInt(studentId))
      .input('date', sql.Date, date).query(`
        SELECT Breakfast, Lunch, Snack, Dinner
        FROM UorPitanie.MealRequest
        WHERE StudentId = @sid AND RequestDate = @date
      `);
    if (result.recordset.length === 0) {
      return res.json({ meals: [] });
    }
    const { Breakfast, Lunch, Snack, Dinner } = result.recordset[0];
    const meals = [];
    Breakfast && meals.push('breakfast');
    Lunch && meals.push('lunch');
    Snack && meals.push('snack');
    Dinner && meals.push('dinner');
    res.json({ meals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;

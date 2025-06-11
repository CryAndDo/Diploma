const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { sql } = require('../db'); 
const {
  getDailyMealCounts,
  generateDailyReport,
  generateMonthlyReport,
} = require('../controllers/reportController');

// JWT защита и проверка роли
router.use(auth);
router.use((req, res, next) => {
  if (req.user.type === 'ResponsibleForNutrition') return next();
  return res.status(403).json({ error: 'Нет прав доступа' });
});

// Эндпоинты отчетов
router.get('/daily-count', getDailyMealCounts);
router.get('/daily', generateDailyReport);
router.get('/monthly', generateMonthlyReport);

// Получить уникальные даты с finalized = 1
router.get('/finalized-dates', async (req, res) => {
  try {
    const result = await sql.query`
      SELECT DISTINCT RequestDate
      FROM UorPitanie.MealRequest
      WHERE IsFinalized = 1
      ORDER BY RequestDate DESC
    `;

    // Преобразуем даты в строку формата YYYY-MM-DD
    const finalizedDates = result.recordset
      .filter((r) => r.RequestDate)
      .map((r) => r.RequestDate.toISOString().split('T')[0]);

    res.json(finalizedDates);
  } catch (err) {
    console.error('❌ Ошибка при получении finalized-дней:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

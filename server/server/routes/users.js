const express = require('express');
const router = express.Router();
const { pool, poolConnect, sql } = require('../db');
const auth = require('../middleware/authMiddleware');

router.get('/me', auth, (req, res) => {
  const { id, isExpelled } = req.user;
  res.json({ id, isExpelled });
});

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    await poolConnect;

    // Получение записей с учетом поиска, пагинации и фильтрацией отчисленных
    const studentsQuery = await pool.request().input('search', sql.NVarChar, `%${search}%`).query(`
        SELECT 
          Id, 
          FIO, 
          Email, 
          SportType, 
          [Group]
        FROM UorPitanie.Students
        WHERE FIO LIKE @search
          AND IsExpelled = 0
        ORDER BY FIO
        OFFSET ${offset} ROWS
        FETCH NEXT ${limit} ROWS ONLY
      `);

    // Общее количество для пагинации (только неотчисленные)
    const countQuery = await pool.request().input('search', sql.NVarChar, `%${search}%`).query(`
        SELECT COUNT(*) AS total
        FROM UorPitanie.Students
        WHERE FIO LIKE @search
          AND IsExpelled = 0
      `);

    const total = countQuery.recordset[0].total;

    res.json({
      students: studentsQuery.recordset,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('🔥 Ошибка при получении студентов:', err);
    res.status(500).json({
      error: 'Ошибка при получении студентов',
      details: err.message,
      stack: err.stack,
    });
  }
});

module.exports = router;

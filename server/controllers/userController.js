const { getPool, sql } = require('../db');

async function getAllUsers(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT 
          Id,
          FIO,
          [Group],
          SportType,
          HipNumber
        FROM UorPitanie.Students
        WHERE IsExpelled = 0
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

module.exports = { getAllUsers };

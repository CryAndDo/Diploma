const sql = require('mssql');

async function finalizeUpToToday() {
  const pool = await sql.connect();
  const result = await pool.request().query(`
      UPDATE UorPitanie.MealRequest
      SET IsFinalized = 1
      WHERE RequestDate <= CAST(GETDATE() AS date)
        AND IsFinalized = 0;
    `);

  console.log(
    `✔ Закрыты все заявки до сегодняшней даты (включительно). Строк затронуто: ${result.rowsAffected}`,
  );
}

module.exports = finalizeUpToToday;

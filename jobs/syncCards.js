const { pool, sql } = require('../db');

async function syncCards() {
  try {
    // Получаем официальный список карт
    const { recordset: source } = await pool.request().query(`
        SELECT HipNumber, FIO, [Group], isActive
        FROM UorPitanieDB.dbo.Cards
      `);

    for (const row of source) {
      const hip = (row.HipNumber || '').trim();
      const fio = (row.FIO || '').trim();
      const grp = (row.Group || '').trim();
      const active = row.isActive ? 1 : 0;

      const request = pool
        .request()
        .input('hip', sql.VarChar(50), hip)
        .input('fio', sql.NVarChar(255), fio)
        .input('grp', sql.NVarChar(100), grp)
        .input('act', sql.Bit, active);

      // MERGE для таблицы Cards + Обновление HipNumber для студентов за один запрос
      await request.query(`
        MERGE Cards AS target
        USING (SELECT @fio AS FIO, @grp AS [Group], @hip AS HipNumber, @act AS IsActive) AS src
          ON target.FIO = src.FIO AND target.[Group] = src.[Group]
        WHEN MATCHED THEN
          UPDATE SET
            target.HipNumber = src.HipNumber,
            target.IsActive  = src.IsActive,
            target.UpdatedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (HipNumber, FIO, [Group], IsActive)
          VALUES (src.HipNumber, src.FIO, src.[Group], src.IsActive);

        UPDATE UorPitanie.Students
        SET HipNumber = @hip
        WHERE FIO = @fio AND [Group] = @grp;
      `);
    }

    console.log(`syncCards: synchronized ${source.length} cards`);
  } catch (err) {
    console.error('syncCards error:', err);
  }
}

module.exports = syncCards;

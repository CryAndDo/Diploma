// jobs/syncScud.js
const ADODB = require('node-adodb');
const { pool, sql } = require('../db');

const ACCESS_DB_PATH = 'D:/SCUDGATE.accdb';
const scud = ADODB.open(`Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${ACCESS_DB_PATH};`);

async function syncScud() {
  try {
    // 1) Считаем все записи из Access
    const cards = await scud.query(`SELECT HipNumber, FIO, [Group], Category FROM Cards;`);
    console.log(`syncScud: fetched ${cards.length} rows from Access`);

    // Собираем все номера из Access, чтобы потом деактивировать отсутствующие
    const accessHips = cards.map((c) => (c.HipNumber || '').toString().trim()).filter((h) => h);

    // 2) По каждой строке Access либо обновляем существующую запись, либо вставляем новую
    for (const c of cards) {
      const newHip = (c.HipNumber || '').toString().trim();
      const fio = (c.FIO || '').toString().trim();
      const grp = (c.Group || '').toString().trim();
      const category = (c.Category || '').toString().trim();

      const trx = new sql.Transaction(pool);
      try {
        await trx.begin();
        const tr = trx.request();

        // Сначала проверим, есть ли в Cards строка с таким FIO+Group
        const existing = await tr
          .input('fio', sql.NVarChar(255), fio)
          .input('grp', sql.NVarChar(100), grp).query(`
            SELECT HipNumber
            FROM [UorPitanieDB].[dbo].[Cards]
            WHERE FIO = @fio AND [Group] = @grp;
          `);

        if (existing.recordset.length > 0) {
          // Строка найдена — возможно, нужно просто «переименовать» HipNumber
          const oldHip = existing.recordset[0].HipNumber.trim();

          if (oldHip !== newHip) {
            // 2.1) отключаем проверку внешнего ключа
            await tr.query(`
              ALTER TABLE UorPitanie.Students
              NOCHECK CONSTRAINT FK_Students_Cards;
            `);

            // 2.2) «переименовываем» HipNumber в таблице Cards
            await tr
              .input('oldHip', sql.VarChar(50), oldHip)
              .input('newHip', sql.VarChar(50), newHip).query(`
                UPDATE [UorPitanieDB].[dbo].[Cards]
                SET HipNumber = @newHip, UpdatedAt = GETDATE()
                WHERE HipNumber = @oldHip;
              `);

            // 2.3) «перепривязываем» студентов
            await tr
              .input('oldHipStud', sql.VarChar(50), oldHip)
              .input('newHipStud', sql.VarChar(50), newHip).query(`
                UPDATE UorPitanie.Students
                SET HipNumber = @newHipStud
                WHERE HipNumber = @oldHipStud;
              `);

            // 2.4) снова включаем проверку внешнего ключа и проверяем существующие связи
            await tr.query(`
              ALTER TABLE UorPitanie.Students
              WITH CHECK CHECK CONSTRAINT FK_Students_Cards;
            `);
          } else {
            // HipNumber не меняется — просто обновим IsActive + UpdatedAt
            await tr.input('hipUpd', sql.VarChar(50), newHip).input('activeUpd', sql.Bit, 1).query(`
                UPDATE [UorPitanieDB].[dbo].[Cards]
                SET IsActive = @activeUpd, UpdatedAt = GETDATE()
                WHERE HipNumber = @hipUpd;
              `);
          }
        } else {
          // Строка по FIO+Group не найдена — создаём новую запись
          await tr
            .input('hipIns', sql.VarChar(50), newHip)
            .input('fioIns', sql.NVarChar(255), fio)
            .input('grpIns', sql.NVarChar(100), grp)
            .input('activeIns', sql.Bit, 1).query(`
              INSERT INTO [UorPitanieDB].[dbo].[Cards]
                (HipNumber, FIO, [Group], IsActive, UpdatedAt)
              VALUES (@hipIns, @fioIns, @grpIns, @activeIns, GETDATE());
            `);
        }

        // 3) Обновляем ResponsibleForNutrition, если нужно
        if (category === 'Учебно-воспитательный отдел') {
          await tr
            .input('fioResp', sql.NVarChar(255), fio)
            .input('hipResp', sql.VarChar(50), newHip).query(`
              MERGE [UorPitanieDB].[UorPitanie].[ResponsibleForNutrition] AS target
              USING (VALUES (@fioResp, @hipResp)) AS src (FIO, HipNumber)
                ON target.FIO = src.FIO
              WHEN MATCHED THEN
                UPDATE SET HipNumber = src.HipNumber
              WHEN NOT MATCHED THEN
                INSERT (HipNumber, FIO)
                VALUES (src.HipNumber, src.FIO);
            `);
        }

        await trx.commit();
      } catch (rowErr) {
        console.error(
          `syncScud: error on record FIO=${fio} Group=${grp} HipNumber=${newHip}`,
          rowErr,
        );
        await trx.rollback();
      }
    }

    // 4) «Деактивируем» (IsActive = 0) те карты, которые уже не лежат в Access
    if (accessHips.length) {
      const hipList = accessHips.map((h) => `'${h}'`).join(',');
      await pool.request().query(`
        UPDATE [UorPitanieDB].[dbo].[Cards]
        SET IsActive = 0, UpdatedAt = GETDATE()
        WHERE HipNumber NOT IN (${hipList});
      `);

      // 5) Ставим отчисленным тех студентов, у которых нет активных карт
      await pool.request().query(`
        UPDATE UorPitanie.Students
        SET IsExpelled = 1
        WHERE HipNumber NOT IN (${hipList});
      `);
    }

    console.log(`syncScud: processed ${cards.length} rows and updated inactive cards/expulsions`);

    // 6) Удаляем будущие MealRequest у отчисленных:
    await pool.request().query(`
      DELETE FROM UorPitanie.MealRequest
      WHERE
        RequestDate > CONVERT(date, GETDATE())
        AND IsFinalized = 0
        AND StudentId IN (
          SELECT Id
          FROM UorPitanie.Students
          WHERE IsExpelled = 1
        );
    `);
    console.log('syncScud: deleted future MealRequest for expelled students');
  } catch (err) {
    console.error('syncScud fatal error:', err);
  }
}

module.exports = syncScud;

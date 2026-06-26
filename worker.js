import pool from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const POLL_INTERVAL = 3000;

async function processJob(job) {
  const payload = job.payload;
  console.log(`\n[WORKER] >>> Започва обработка на задача #${job.id} [Тип: ${job.job_type}]`);

  switch (job.job_type) {
    case 'RegistrationConfirmed':
      console.log(`  [СИМУЛАЦИЯ НА ИМЕЙЛ] Изпратен до: ${payload.student_email}`);
      console.log(`  Тема: Потвърдено записване за "${payload.event_title}"`);
      console.log(`  Съдържание: Здравейте, ${payload.student_name}! Вие успешно бяхте записани за събитието "${payload.event_title}".`);
      break;

    case 'RegistrationWaitlisted':
      console.log(`  [СИМУЛАЦИЯ НА ИМЕЙЛ] Изпратен до: ${payload.student_email}`);
      console.log(`  Тема: Добавен в списъка на чакащите за "${payload.event_title}"`);
      console.log(`  Съдържание: Здравейте, ${payload.student_name}! Тъй като капацитетът на събитието е пълен, Вие бяхте добавен в списъка на чакащите (Waitlist).`);
      break;

    case 'RegistrationCancelled':
      console.log(`  [СИМУЛАЦИЯ НА ИМЕЙЛ] Изпратен до: ${payload.student_email}`);
      console.log(`  Тема: Отписан от събитие "${payload.event_title}"`);
      console.log(`  Съдържание: Здравейте, ${payload.student_name}! Вашата регистрация за събитието "${payload.event_title}" беше успешно отменена.`);
      break;

    case 'WaitlistPromoted':
      console.log(`  [СИМУЛАЦИЯ НА ИМЕЙЛ] Изпратен до: ${payload.student_email}`);
      console.log(`  Тема: СТАТУСЪТ ВИ БЕШЕ ПРОМЕНЕН: Записан за "${payload.event_title}"!`);
      console.log(`  Съдържание: Здравейте, ${payload.student_name}! Отлични новини! Тъй като се освободи място, Вашата регистрация за "${payload.event_title}" беше автоматично променена на ПОТВЪРДЕНА. Вече имате място!`);
      break;

    case 'EventPublished':
      console.log(`  [СИСТЕМЕН ЛОГ] Събитие с ID ${payload.event_id} и име "${payload.title}" беше успешно публикувано.`);
      break;

    case 'EventCancelled':
      console.log(`  [СИМУЛАЦИЯ НА МАСОВ ИМЕЙЛ] Събитието "${payload.title}" беше ОТМЕНЕНО! Изпращане на известия:`);
      if (payload.students && payload.students.length > 0) {
        payload.students.forEach(student => {
          console.log(`    -> Имейл до: ${student.email} (Здравейте, ${student.name}. За съжаление събитието "${payload.title}" беше отменено от организатора.)`);
        });
      } else {
        console.log(`    -> Няма записани ученици за това събитие, за да бъдат известени.`);
      }
      break;

    default:
      throw new Error(`Непознат тип на задача: ${job.job_type}`);
  }

  console.log(`[WORKER] <<< Успешно завършена задача #${job.id}\n`);
}

async function workerLoop() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT * FROM notification_jobs 
       WHERE status = 'pending' 
       ORDER BY id ASC 
       LIMIT 1 
       FOR UPDATE SKIP LOCKED`
    );

    if (res.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const job = res.rows[0];

    await client.query(
      "UPDATE notification_jobs SET status = 'processing' WHERE id = $1",
      [job.id]
    );

    await client.query('COMMIT');

    try {
      await processJob(job);

      await pool.query(
        "UPDATE notification_jobs SET status = 'completed', processed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [job.id]
      );
    } catch (err) {
      console.error(`[WORKER] Грешка при обработка на задача #${job.id}:`, err.message);

      await pool.query(
        "UPDATE notification_jobs SET status = 'failed', error_message = $1 WHERE id = $2",
        [err.message, job.id]
      );
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[WORKER] Грешка в основния цикъл на уъркъра:', error);
  } finally {
    client.release();
  }
}

console.log('==================================================');
console.log('Фоновият Worker стартира успешно и очаква задачи...');
console.log(`Периодичност на сканиране: всеки ${POLL_INTERVAL / 1000} секунди.`);
console.log('==================================================');

setInterval(async () => {
  await workerLoop();
}, POLL_INTERVAL);

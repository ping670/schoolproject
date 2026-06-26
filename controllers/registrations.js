import pool, { query } from '../db.js';

export const registerForEvent = async (req, res) => {
  const eventId = req.params.id;
  const studentId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const eventRes = await client.query(
      'SELECT id, title, capacity, status FROM events WHERE id = $1 FOR UPDATE',
      [eventId]
    );

    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    const event = eventRes.rows[0];

    if (event.status !== 'published') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Можете да се регистрирате само за публикувани събития.' });
    }

    const regCheck = await client.query(
      'SELECT id FROM event_registrations WHERE event_id = $1 AND student_id = $2',
      [eventId, studentId]
    );

    if (regCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Вече имате съществуваща регистрация за това събитие.' });
    }

    const countRes = await client.query(
      "SELECT COUNT(*)::int as count FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'",
      [eventId]
    );
    const confirmedCount = countRes.rows[0].count;

    let targetStatus = 'confirmed';
    let jobType = 'RegistrationConfirmed';

    if (confirmedCount >= event.capacity) {
      targetStatus = 'waitlisted';
      jobType = 'RegistrationWaitlisted';
    }

    const insertRes = await client.query(
      `INSERT INTO event_registrations (event_id, student_id, status) 
       VALUES ($1, $2, $3) 
       RETURNING id, status, registration_date`,
      [eventId, studentId, targetStatus]
    );
    const registration = insertRes.rows[0];

    const jobPayload = {
      registration_id: registration.id,
      event_id: event.id,
      event_title: event.title,
      student_id: studentId,
      student_email: req.user.email,
      student_name: req.user.name,
      status: registration.status
    };

    await client.query(
      "INSERT INTO notification_jobs (job_type, payload) VALUES ($1, $2)",
      [jobType, JSON.stringify(jobPayload)]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: targetStatus === 'confirmed' 
        ? 'Успешно се регистрирахте за събитието!' 
        : 'Капацитетът е запълнен. Добавен сте в списъка на чакащите (waitlist).',
      registration
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Грешка при регистрация:', error);
    res.status(500).json({ error: 'Грешка в сървъра при опит за регистрация.' });
  } finally {
    client.release();
  }
};

export const cancelRegistration = async (req, res) => {
  const regId = req.params.id;
  const studentId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const regRes = await client.query(
      `SELECT er.*, e.title as event_title, e.capacity 
       FROM event_registrations er
       JOIN events e ON er.event_id = e.id
       WHERE er.id = $1 FOR UPDATE`,
      [regId]
    );

    if (regRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Регистрацията не е намерена.' });
    }

    const registration = regRes.rows[0];

    if (registration.student_id !== studentId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нямате права да отменяте чужди регистрации.' });
    }

    const eventId = registration.event_id;
    const wasConfirmed = registration.status === 'confirmed';

    await client.query('DELETE FROM event_registrations WHERE id = $1', [regId]);

    await client.query(
      `INSERT INTO notification_jobs (job_type, payload) 
       VALUES ('RegistrationCancelled', $1)`,
      [JSON.stringify({
        event_id: eventId,
        event_title: registration.event_title,
        student_id: studentId,
        student_email: req.user.email,
        student_name: req.user.name
      })]
    );

    if (wasConfirmed) {
      const nextWaitlisted = await client.query(
        `SELECT er.id, er.student_id, u.email as student_email, u.name as student_name
         FROM event_registrations er
         JOIN users u ON er.student_id = u.id
         WHERE er.event_id = $1 AND er.status = 'waitlisted'
         ORDER BY er.registration_date ASC
         LIMIT 1 FOR UPDATE`,
        [eventId]
      );

      if (nextWaitlisted.rows.length > 0) {
        const next = nextWaitlisted.rows[0];

        await client.query(
          "UPDATE event_registrations SET status = 'confirmed' WHERE id = $1",
          [next.id]
        );

        await client.query(
          `INSERT INTO notification_jobs (job_type, payload) 
           VALUES ('WaitlistPromoted', $1)`,
          [JSON.stringify({
            registration_id: next.id,
            event_id: eventId,
            event_title: registration.event_title,
            student_id: next.student_id,
            student_email: next.student_email,
            student_name: next.student_name
          })]
        );
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Успешно се отписахте от събитието.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Грешка при отмяна на регистрация:', error);
    res.status(500).json({ error: 'Грешка в сървъра при опит за отписване.' });
  } finally {
    client.release();
  }
};

export const getRegistrationsMe = async (req, res) => {
  try {
    const studentId = req.user.id;

    const result = await query(
      `SELECT er.id, er.event_id, er.status, er.registration_date, e.title as event_title, e.starts_at, e.ends_at
       FROM event_registrations er
       JOIN events e ON er.event_id = e.id
       WHERE er.student_id = $1
       ORDER BY er.registration_date DESC`,
      [studentId]
    );

    const registrations = [];

    for (const reg of result.rows) {
      let position = null;

      if (reg.status === 'waitlisted') {
        const posRes = await query(
          `SELECT COUNT(*)::int as count 
           FROM event_registrations 
           WHERE event_id = $1 AND status = 'waitlisted' AND registration_date < $2`,
          [reg.event_id, reg.registration_date]
        );
        position = posRes.rows[0].count + 1;
      }

      registrations.push({
        ...reg,
        waitlist_position: position
      });
    }

    res.status(200).json(registrations);
  } catch (error) {
    console.error('Грешка при четене на лични регистрации:', error);
    res.status(500).json({ error: 'Грешка в сървъра при четене на Вашите регистрации.' });
  }
};

export const getEventRegistrationsOrganizer = async (req, res) => {
  try {
    const eventId = req.params.id;
    const organiserId = req.user.id;

    const eventCheck = await query('SELECT organiser_id FROM events WHERE id = $1', [eventId]);
    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    if (eventCheck.rows[0].organiser_id !== organiserId) {
      return res.status(403).json({ error: 'Нямате достъп до списъка за това събитие.' });
    }

    const result = await query(
      `SELECT er.id, er.registration_date, u.id as student_id, u.name as student_name, u.email as student_email
       FROM event_registrations er
       JOIN users u ON er.student_id = u.id
       WHERE er.event_id = $1 AND er.status = 'confirmed'
       ORDER BY er.registration_date ASC`,
      [eventId]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Грешка при четене на записвания за събитие:', error);
    res.status(500).json({ error: 'Грешка в сървъра при извличане на потвърдените записвания.' });
  }
};

export const getEventWaitlistOrganizer = async (req, res) => {
  try {
    const eventId = req.params.id;
    const organiserId = req.user.id;

    const eventCheck = await query('SELECT organiser_id FROM events WHERE id = $1', [eventId]);
    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    if (eventCheck.rows[0].organiser_id !== organiserId) {
      return res.status(403).json({ error: 'Нямате достъп до изчакващия списък за това събитие.' });
    }

    const result = await query(
      `SELECT er.id, er.registration_date, u.id as student_id, u.name as student_name, u.email as student_email
       FROM event_registrations er
       JOIN users u ON er.student_id = u.id
       WHERE er.event_id = $1 AND er.status = 'waitlisted'
       ORDER BY er.registration_date ASC`,
      [eventId]
    );

    const waitlist = result.rows.map((row, index) => ({
      ...row,
      position: index + 1
    }));

    res.status(200).json(waitlist);
  } catch (error) {
    console.error('Грешка при четене на изчакващ списък:', error);
    res.status(500).json({ error: 'Грешка в сървъра при четене на чакащите ученици.' });
  }
};

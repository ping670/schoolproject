import { query } from '../db.js';

export const createEvent = async (req, res) => {
  try {
    const { title, description, starts_at, ends_at, capacity, location, department_id } = req.body;
    const organiser_id = req.user.id;

    if (!title || !starts_at || !ends_at || !capacity || !department_id) {
      return res.status(400).json({ error: 'Полетата title, starts_at, ends_at, capacity и department_id са задължителни.' });
    }

    if (parseInt(capacity) < 1) {
      return res.status(400).json({ error: 'Капацитетът на събитието трябва да бъде поне 1.' });
    }

    const result = await query(
      `INSERT INTO events (title, description, starts_at, ends_at, capacity, location, status, organiser_id, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
       RETURNING *`,
      [title, description, starts_at, ends_at, capacity, location, organiser_id, department_id]
    );

    res.status(201).json({
      message: 'Събитието е създадено като DRAFT!',
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Грешка при създаване на събитие:', error);
    res.status(500).json({ error: 'Възникна системна грешка при създаване на събитие.' });
  }
};

export const getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql = '';
    let params = [];

    if (userRole === 'student') {
      sql = `SELECT e.*, 
        COALESCE((SELECT COUNT(*)::int FROM event_registrations WHERE event_id = e.id AND status = 'confirmed'), 0) as confirmed_count,
        COALESCE((SELECT COUNT(*)::int FROM event_registrations WHERE event_id = e.id AND status = 'waitlisted'), 0) as waitlist_count
        FROM events e WHERE e.status = 'published' ORDER BY e.starts_at ASC`;
    } else {
      sql = `SELECT e.*, 
        COALESCE((SELECT COUNT(*)::int FROM event_registrations WHERE event_id = e.id AND status = 'confirmed'), 0) as confirmed_count,
        COALESCE((SELECT COUNT(*)::int FROM event_registrations WHERE event_id = e.id AND status = 'waitlisted'), 0) as waitlist_count
        FROM events e WHERE e.status = 'published' OR e.organiser_id = $1 
        ORDER BY e.starts_at ASC`;
      params = [userId];
    }
    const result = await query(sql, params);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Грешка при извличане на събития:', error);
    res.status(500).json({ error: 'Грешка в сървъра при четене на събития.' });
  }
};

export const getEventById = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const eventResult = await query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    const event = eventResult.rows[0];

    if (userRole === 'student' && event.status !== 'published') {
      return res.status(403).json({ error: 'Нямате достъп до това събитие.' });
    }
    if (userRole === 'organiser' && event.status !== 'published' && event.organiser_id !== userId) {
      return res.status(403).json({ error: 'Нямате достъп до непубликувано събитие на друг организатор.' });
    }

    const confirmedCount = await query(
      "SELECT COUNT(*)::int as count FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'",
      [eventId]
    );

    const waitlistCount = await query(
      "SELECT COUNT(*)::int as count FROM event_registrations WHERE event_id = $1 AND status = 'waitlisted'",
      [eventId]
    );

    res.status(200).json({
      ...event,
      confirmed_count: confirmedCount.rows[0].count,
      waitlist_count: waitlistCount.rows[0].count,
      available_seats: Math.max(0, event.capacity - confirmedCount.rows[0].count)
    });
  } catch (error) {
    console.error('Грешка при четене на събитие:', error);
    res.status(500).json({ error: 'Грешка в сървъра при детайли за събитие.' });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const organiserId = req.user.id;
    const { title, description, starts_at, ends_at, capacity, location, department_id } = req.body;

    const eventResult = await query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    const event = eventResult.rows[0];

    if (event.organiser_id !== organiserId) {
      return res.status(403).json({ error: 'Нямате права да редактирате това събитие.' });
    }

    if (event.status !== 'draft') {
      return res.status(400).json({ error: 'Могат да се редактират само събития в статус DRAFT.' });
    }

    if (!title || !starts_at || !ends_at || !capacity || !department_id) {
      return res.status(400).json({ error: 'Полетата title, starts_at, ends_at, capacity и department_id са задължителни.' });
    }

    if (parseInt(capacity) < 1) {
      return res.status(400).json({ error: 'Капацитетът трябва да бъде поне 1.' });
    }

    const result = await query(
      `UPDATE events 
       SET title = $1, description = $2, starts_at = $3, ends_at = $4, capacity = $5, location = $6, department_id = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND organiser_id = $9
       RETURNING *`,
      [title, description, starts_at, ends_at, capacity, location, department_id, eventId, organiserId]
    );

    res.status(200).json({
      message: 'Събитието е редактирано успешно!',
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Грешка при редактиране на събитие:', error);
    res.status(500).json({ error: 'Грешка в сървъра при редакция на събитие.' });
  }
};

export const publishEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const organiserId = req.user.id;

    const eventResult = await query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    const event = eventResult.rows[0];

    if (event.organiser_id !== organiserId) {
      return res.status(403).json({ error: 'Нямате права да публикувате това събитие.' });
    }

    if (event.status !== 'draft') {
      return res.status(400).json({ error: 'Само събития в статус DRAFT могат да се публикуват.' });
    }

    const result = await query(
      "UPDATE events SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [eventId]
    );

    await query(
      `INSERT INTO notification_jobs (job_type, payload) 
       VALUES ('EventPublished', $1)`,
      [JSON.stringify({ event_id: event.id, title: event.title })]
    );

    res.status(200).json({
      message: 'Събитието е публикувано успешно!',
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Грешка при публикуване на събитие:', error);
    res.status(500).json({ error: 'Грешка в сървъра при публикуване.' });
  }
};

export const cancelEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const organiserId = req.user.id;

    const eventResult = await query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Събитието не е намерено.' });
    }

    const event = eventResult.rows[0];

    if (event.organiser_id !== organiserId) {
      return res.status(403).json({ error: 'Нямате права да отменяте това събитие.' });
    }

    if (event.status === 'cancelled') {
      return res.status(400).json({ error: 'Събитието вече е отменено.' });
    }

    const result = await query(
      "UPDATE events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [eventId]
    );

    const studentsResult = await query(
      `SELECT u.email, u.name 
       FROM event_registrations er
       JOIN users u ON er.student_id = u.id
       WHERE er.event_id = $1`,
      [eventId]
    );

    const affectedStudents = studentsResult.rows.map(row => ({ email: row.email, name: row.name }));

    await query(
      `INSERT INTO notification_jobs (job_type, payload) 
       VALUES ('EventCancelled', $1)`,
      [JSON.stringify({
        event_id: event.id,
        title: event.title,
        students: affectedStudents
      })]
    );

    res.status(200).json({
      message: 'Събитието е отменено успешно и известията са поставени в опашката.',
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Грешка при отмяна на събитие:', error);
    res.status(500).json({ error: 'Грешка в сървъра при отмяна на събитие.' });
  }
};

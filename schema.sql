CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK(role IN ('student', 'organiser'))
);

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    group_name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity INT NOT NULL CHECK(capacity >= 1),
    location VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'cancelled')),
    organiser_id INT NOT NULL,
    department_id INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_events_organiser FOREIGN KEY (organiser_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_events_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_registrations (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL,
    student_id INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'waitlisted')),
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_registrations_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_registrations_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_event_student UNIQUE(event_id, student_id)
);

CREATE TABLE IF NOT EXISTS notification_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

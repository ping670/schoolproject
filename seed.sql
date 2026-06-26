INSERT INTO departments (name, group_name) VALUES 
('Математика и Информатика', 'Катедра Природни Науки'),
('Чужди Езици', 'Катедра Хуманитарни Науки'),
('Спорт и Физическо Възпитание', 'Катедра Спорт')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, group_name = EXCLUDED.group_name;

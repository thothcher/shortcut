// Universities and their programs (faculties / majors).
import { db } from './db.js';

export function universitiesWithPrograms() {
  const universities = db.prepare('SELECT * FROM universities ORDER BY position, id').all();
  const programs = db.prepare('SELECT * FROM programs ORDER BY position, name').all();
  return universities.map((u) => ({ ...u, programs: programs.filter((p) => p.university_id === u.id) }));
}

export const getProgram = (id) =>
  db
    .prepare(
      `SELECT p.*, u.short_name, u.name AS university_name
       FROM programs p JOIN universities u ON u.id = p.university_id WHERE p.id = ?`,
    )
    .get(Number(id) || 0);

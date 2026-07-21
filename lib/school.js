// The film school, graded against the viewer's own ratings.
// Pure: takes the precomputed syllabus (data/syllabus.json — film ids,
// directors, posters resolved once at build time) and the viewer's data.
// Runs identically in Node (tests, demo build) and the browser.

import { normTitle } from './recs.js';

export const letterOf = (gpa) => (
  gpa >= 3.7 ? 'A' : gpa >= 3.3 ? 'A-' : gpa >= 3.0 ? 'B+'
    : gpa >= 2.7 ? 'B' : gpa >= 2.3 ? 'B-' : 'C'
);

// syllabus: [{code, year, title, desc, assignment, films:[...], extra}]
// viewer: { exclude: Set(tmdbId | 'normtitle year'), ratingByTmdbId: Map, ratingByNorm: Map }
export function gradeSchool(syllabus, viewer) {
  const { exclude, ratingByTmdbId, ratingByNorm } = viewer;
  const school = { courses: [], done: 0, total: 0 };
  const allGrades = [];

  for (const course of syllabus) {
    const courseGrades = [];
    const films = course.films.map((f) => {
      const watched = (f.tmdbId && exclude.has(f.tmdbId))
        || exclude.has(`${normTitle(f.title)} ${f.year}`);
      const userRating = watched
        ? (f.tmdbId && ratingByTmdbId.get(f.tmdbId)) || ratingByNorm.get(normTitle(f.title)) || null
        : null;
      if (userRating) { courseGrades.push(userRating); allGrades.push(userRating); }
      school.total++;
      if (watched) school.done++;
      return { ...f, watched, userRating };
    });
    const extra = course.extra ? {
      ...course.extra,
      watched: (course.extra.tmdbId && exclude.has(course.extra.tmdbId))
        || exclude.has(`${normTitle(course.extra.title)} ${course.extra.year}`),
    } : null;
    const avg = courseGrades.length
      ? courseGrades.reduce((a, b) => a + b, 0) / courseGrades.length : null;
    school.courses.push({
      code: course.code, title: course.title, year: course.year,
      level: course.year <= 4 ? 'BA' : 'MFA',
      extra,
      desc: course.desc, assignment: course.assignment,
      grade: avg !== null ? letterOf((avg / 5) * 4) : null,
      honors: avg !== null && avg >= 4.5,           // dean's list
      complete: films.every((f) => f.watched),
      films,
    });
  }

  if (allGrades.length) {
    const g = (allGrades.reduce((a, b) => a + b, 0) / allGrades.length / 5) * 4;
    school.gpa = Math.round(g * 100) / 100;
    school.gpaLetter = letterOf(g);
  }
  const tally = (level) => {
    const fs = school.courses.filter((c) => c.level === level).flatMap((c) => c.films);
    return { done: fs.filter((f) => f.watched).length, total: fs.length };
  };
  school.ba = tally('BA');
  school.mfa = tally('MFA');
  school.deansList = school.courses.filter((c) => c.honors).length;
  if (school.ba.done < school.ba.total) {
    const pct = school.ba.done / school.ba.total;
    school.standing = pct >= 0.75 ? 'Senior' : pct >= 0.5 ? 'Junior' : pct >= 0.25 ? 'Sophomore' : 'Freshman';
  } else if (school.mfa.done < school.mfa.total) {
    school.standing = 'MFA candidate';
  } else {
    school.standing = 'Doctor of Cinema';
  }
  const current = school.courses.find((c) => !c.complete);
  if (current) {
    const next = current.films.find((f) => !f.watched && f.tmdbId);
    school.semester = { code: current.code, title: current.title, desc: current.desc, next: next || null };
  }
  return school;
}

// The viewer key sets, derived once from parsed export data + enrichment.
export function viewerKeys(data, films) {
  const exclude = new Set();
  const ratingByTmdbId = new Map();
  const ratingByNorm = new Map();
  const ratingByKey = new Map();
  for (const r of data.ratings || []) ratingByKey.set(`${r.name}|${r.year}`, Number(r.rating) || null);
  for (const w of data.watched || []) {
    exclude.add(`${normTitle(w.name)} ${w.year}`);
    const f = films?.[`${w.name}|${w.year}`];
    const r = ratingByKey.get(`${w.name}|${w.year}`);
    if (f?.tmdbId) {
      exclude.add(f.tmdbId);
      if (r) ratingByTmdbId.set(f.tmdbId, r);
    }
    if (r) ratingByNorm.set(normTitle(w.name), r);
  }
  return { exclude, ratingByTmdbId, ratingByNorm };
}

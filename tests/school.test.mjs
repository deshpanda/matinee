import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeSchool, viewerKeys, letterOf } from '../lib/school.js';

const SYL = [
  {
    code: 'FS 101', year: 1, title: 'Test course', desc: 'd', assignment: 'a',
    films: [
      { title: 'Alpha', year: '1950', why: 'w', tmdbId: 1, director: 'D1', poster: null, tmdb: 8 },
      { title: 'Beta', year: '1960', why: 'w', tmdbId: 2, director: 'D2', poster: null, tmdb: 7 },
    ],
    extra: { title: 'Gamma', year: '1970', why: 'w', tmdbId: 3, director: 'D3', poster: null, tmdb: 7 },
  },
  {
    code: 'FS 501', year: 5, title: 'Grad course', desc: 'd', assignment: 'a',
    films: [{ title: 'Delta', year: '1980', why: 'w', tmdbId: 4, director: 'D4', poster: null, tmdb: 7 }],
    extra: null,
  },
];

test('school: grades from viewer ratings, tallies BA/MFA, names the semester', () => {
  const data = {
    watched: [{ name: 'Alpha', year: '1950' }, { name: 'Beta', year: '1960' }],
    ratings: [{ name: 'Alpha', year: '1950', rating: 5 }, { name: 'Beta', year: '1960', rating: 4.5 }],
  };
  const films = {
    'Alpha|1950': { tmdbId: 1 },
    'Beta|1960': { tmdbId: 2 },
  };
  const school = gradeSchool(SYL, viewerKeys(data, films));
  const c = school.courses[0];
  assert.equal(c.complete, true);
  assert.equal(c.grade, 'A');           // avg 4.75/5 → 3.8
  assert.equal(c.honors, true);         // dean's list at ≥4.5
  assert.equal(school.ba.done, 2);
  assert.equal(school.mfa.total, 1);
  assert.equal(school.standing, 'MFA candidate'); // BA finished, grad school not
  assert.equal(school.semester.code, 'FS 501');
  assert.equal(school.semester.next.title, 'Delta');
});

test('school: unwatched course has no grade; watched-by-title matches without tmdb id', () => {
  const data = {
    watched: [{ name: 'Delta', year: '1980' }],
    ratings: [{ name: 'Delta', year: '1980', rating: 3 }],
  };
  const school = gradeSchool(SYL, viewerKeys(data, {})); // no enrichment at all
  assert.equal(school.courses[0].grade, null);
  assert.equal(school.courses[1].films[0].watched, true);   // matched by normalized title+year
  assert.equal(school.courses[1].films[0].userRating, 3);
  assert.equal(school.standing, 'Freshman');
});

test('school: letter scale boundaries', () => {
  assert.equal(letterOf(4), 'A');
  assert.equal(letterOf(3.3), 'A-');
  assert.equal(letterOf(3.0), 'B+');
  assert.equal(letterOf(2.0), 'C');
});

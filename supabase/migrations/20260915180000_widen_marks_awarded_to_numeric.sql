-- evaluations.marks_awarded was integer while marking_schemes.total_marks has
-- always been numeric. That mismatch was harmless until the examiner prompt
-- began allowing a fractional mark where the scheme itself pre-splits a point
-- (a numerical's value and its unit, per the no-half-mark policy in §9 of the
-- design handoff). Postgres then rejected the insert outright, and the student
-- saw "Evaluation succeeded but could not be saved. Please retry." on a
-- question that had just been graded correctly — losing the evaluation while
-- still spending the token.
--
-- Observed in production on 2026-09-15: Chemistry 2020 Q4(a)(iii) (1 mark)
-- saved fine when awarded 0, then failed twice in the following minute when
-- awarded a half mark. Two orphaned student_answers rows with no evaluation
-- row are the trace it left.
--
-- numeric, not double precision: marks are exact decimals like 0.5 and 1.5,
-- and binary floating point cannot represent them exactly. The CHECK
-- constraint is recreated by the type change and still holds.
alter table public.evaluations
  alter column marks_awarded type numeric using marks_awarded::numeric;

-- declared_marks is the student's own predicted mark, compared against
-- marks_awarded on the Results page. Same reasoning: if one can be fractional
-- the other must be, or the comparison breaks on exactly the questions that
-- motivated the change.
alter table public.evaluations
  alter column declared_marks type numeric using declared_marks::numeric;

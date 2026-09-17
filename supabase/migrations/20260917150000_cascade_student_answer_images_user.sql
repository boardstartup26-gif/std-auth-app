-- ─── student_answer_images.user_id → ON DELETE CASCADE ──────────────────────
--
-- The baseline dump (20260814055601_remote_schema.sql) created this foreign
-- key with no ON DELETE action, i.e. NO ACTION. Once any row exists for a
-- user, auth.admin.deleteUser() fails with a foreign-key violation — breaking
-- self-serve account deletion (POST /api/account/delete), which the Privacy
-- Policy promises.
--
-- The table held 0 rows when this was written (no upload path exists yet), so
-- this is latent rather than live — but it would bite the day answer-image
-- upload ships. CASCADE matches every other per-user table (student_answers,
-- usage, usage_feedback, profiles, policy_consents, parent_consents). Rows
-- tied to a student_answer already cascade via student_answer_id.
--
-- Note: rows cascade; files do not. If images are ever stored in Supabase
-- Storage, account deletion must also remove the objects at storage_path —
-- a database cascade cannot reach them.

alter table public.student_answer_images
  drop constraint if exists student_answer_images_user_id_fkey;

alter table public.student_answer_images
  add constraint student_answer_images_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

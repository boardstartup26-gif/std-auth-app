drop extension if exists "pg_net";

drop policy "Allow public anonymous inserts into waitlist" on "public"."waitlist";

revoke delete on table "public"."waitlist" from "anon";

revoke insert on table "public"."waitlist" from "anon";

revoke references on table "public"."waitlist" from "anon";

revoke select on table "public"."waitlist" from "anon";

revoke trigger on table "public"."waitlist" from "anon";

revoke truncate on table "public"."waitlist" from "anon";

revoke update on table "public"."waitlist" from "anon";

revoke delete on table "public"."waitlist" from "authenticated";

revoke insert on table "public"."waitlist" from "authenticated";

revoke references on table "public"."waitlist" from "authenticated";

revoke select on table "public"."waitlist" from "authenticated";

revoke trigger on table "public"."waitlist" from "authenticated";

revoke truncate on table "public"."waitlist" from "authenticated";

revoke update on table "public"."waitlist" from "authenticated";

revoke delete on table "public"."waitlist" from "service_role";

revoke insert on table "public"."waitlist" from "service_role";

revoke references on table "public"."waitlist" from "service_role";

revoke select on table "public"."waitlist" from "service_role";

revoke trigger on table "public"."waitlist" from "service_role";

revoke truncate on table "public"."waitlist" from "service_role";

revoke update on table "public"."waitlist" from "service_role";

alter table "public"."waitlist" drop constraint "waitlist_email_key";

alter table "public"."waitlist" drop constraint "waitlist_pkey";

drop index if exists "public"."waitlist_email_key";

drop index if exists "public"."waitlist_pkey";

drop table "public"."waitlist";

alter table "public"."evaluations" add column "evaluation_mode" text;

alter table "public"."evaluations" add column "factual_accuracy" jsonb;

alter table "public"."evaluations" add column "rubric_scores" jsonb;

alter table "public"."evaluations" add column "textual_evidence_missed" jsonb;

alter table "public"."evaluations" add column "textual_evidence_used" jsonb;

alter table "public"."questions" add column "analytical_criteria" jsonb;

alter table "public"."questions" add column "assertion" text;

alter table "public"."questions" add column "common_error" text;

alter table "public"."questions" add column "constitutional_reference" jsonb;

alter table "public"."questions" add column "correct_answer_text" text;

alter table "public"."questions" add column "correct_option" jsonb;

alter table "public"."questions" add column "date_range" text;

alter table "public"."questions" add column "difficulty_flag" text;

alter table "public"."questions" add column "domain" text;

alter table "public"."questions" add column "evaluation_mode" text default 'point_based'::text;

alter table "public"."questions" add column "examiner_comment" text;

alter table "public"."questions" add column "expected_references" jsonb;

alter table "public"."questions" add column "extract" jsonb;

alter table "public"."questions" add column "factual_anchors" jsonb default '[]'::jsonb;

alter table "public"."questions" add column "has_image" boolean default false;

alter table "public"."questions" add column "image_description" text;

alter table "public"."questions" add column "key_points" jsonb default '[]'::jsonb;

alter table "public"."questions" add column "literary_work" jsonb;

alter table "public"."questions" add column "marking_logic" jsonb;

alter table "public"."questions" add column "mcq_variant" text;

alter table "public"."questions" add column "parent_question_number" text;

alter table "public"."questions" add column "parent_question_text" text;

alter table "public"."questions" add column "period" text;

alter table "public"."questions" add column "points_required" integer;

alter table "public"."questions" add column "points_selection" text;

alter table "public"."questions" add column "question_code" text;

alter table "public"."questions" add column "reason" text;

alter table "public"."questions" add column "requires_textual_evidence" boolean default false;

alter table "public"."questions" add column "response_type" text;

alter table "public"."questions" add column "scheme_text" text;

alter table "public"."questions" add column "section" text;

alter table "public"."questions" add column "section_label" text;

alter table "public"."questions" add column "stimulus" jsonb;

alter table "public"."questions" add column "sub_section" text;

alter table "public"."questions" add column "table_data" jsonb;

alter table "public"."questions" add column "teacher_suggestion" text;

CREATE INDEX idx_questions_domain ON public.questions USING btree (domain) WHERE (domain IS NOT NULL);

CREATE INDEX idx_questions_evaluation_mode ON public.questions USING btree (evaluation_mode);

CREATE INDEX idx_questions_literary_work ON public.questions USING gin (literary_work) WHERE (literary_work IS NOT NULL);

CREATE INDEX idx_questions_response_type ON public.questions USING btree (response_type) WHERE (response_type IS NOT NULL);

CREATE INDEX idx_questions_section ON public.questions USING btree (section);

CREATE INDEX idx_questions_subject_year ON public.questions USING btree (subject_id, year);

CREATE UNIQUE INDEX questions_question_code_key ON public.questions USING btree (question_code);

alter table "public"."questions" add constraint "questions_question_code_key" UNIQUE using index "questions_question_code_key";



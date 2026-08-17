


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."increment_usage"("user_id_param" "uuid", "daily_limit_param" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_tokens INT;
BEGIN
    -- 1. Lock the row for this specific user so no other request can touch it yet
    SELECT token_count INTO current_tokens
    FROM public.usage
    WHERE user_id = user_id_param
    FOR UPDATE;

    -- 2. If no usage row exists yet, initialize it
    IF current_tokens IS NULL THEN
        INSERT INTO public.usage (user_id, token_count)
        VALUES (user_id_param, 1);
        RETURN;
    END IF;

    -- 3. Atomic check: If they are at or over the limit, crash the transaction immediately
    IF current_tokens >= daily_limit_param THEN
        RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;

    -- 4. Safe increment
    UPDATE public.usage
    SET token_count = token_count + 1
    WHERE user_id = user_id_param;
END;
$$;


ALTER FUNCTION "public"."increment_usage"("user_id_param" "uuid", "daily_limit_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_date" "date", "p_cost" integer, "p_limit" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE new_count int;
BEGIN
  INSERT INTO usage (user_id, usage_date, token_count)
  VALUES (p_user_id, p_date, p_cost)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET token_count = usage.token_count + p_cost
  WHERE usage.token_count + p_cost <= p_limit
  RETURNING token_count INTO new_count;

  IF new_count IS NULL THEN
    RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
  END IF;
  RETURN new_count;
END;
$$;


ALTER FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_date" "date", "p_cost" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_answer_id" "uuid" NOT NULL,
    "marks_awarded" integer NOT NULL,
    "points_hit" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "points_missed" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "examiner_feedback" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conceptual_errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model_answer" "text",
    "model_answer_source" "text",
    "declared_marks" integer,
    "improvement_tips" "text"[],
    CONSTRAINT "evaluations_marks_awarded_check" CHECK (("marks_awarded" >= 0))
);


ALTER TABLE "public"."evaluations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marking_schemes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "scheme_text" "text" NOT NULL,
    "total_marks" numeric NOT NULL,
    "key_points" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model_answer" "text",
    "model_answer_verified" boolean DEFAULT false NOT NULL,
    "accepted_alternatives" "jsonb",
    "common_errors" "jsonb",
    "examiner_notes" "text",
    "marks_per_correct_point" numeric,
    CONSTRAINT "marking_schemes_total_marks_check" CHECK (("total_marks" >= (0)::numeric))
);


ALTER TABLE "public"."marking_schemes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "paper" "text" NOT NULL,
    "question_number" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "topic_id" "uuid",
    "is_subjective" boolean DEFAULT true NOT NULL,
    "question_type" "text",
    "options" "jsonb",
    "correct_answer" "text",
    "topic" "text",
    "diagram_url" "text",
    "diagram_required" boolean DEFAULT false,
    CONSTRAINT "questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['mcq'::"text", 'fill_in_blank'::"text", 'true_false'::"text", 'match'::"text", 'short_answer'::"text", 'long_answer'::"text", 'diagram'::"text", 'subjective'::"text", 'objective'::"text"])))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_answer_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_answer_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "page_order" integer NOT NULL,
    "ocr_raw_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_answer_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "answer_text" "text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "board" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "chapter_name" "text" NOT NULL,
    "subtopic_name" "text" NOT NULL,
    "syllabus_weightage" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage" (
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "token_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."usage_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "feature" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marking_schemes"
    ADD CONSTRAINT "marking_schemes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_subject_id_year_paper_question_number_key" UNIQUE ("subject_id", "year", "paper", "question_number");



ALTER TABLE ONLY "public"."student_answer_images"
    ADD CONSTRAINT "student_answer_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_board_name_key" UNIQUE ("board", "name");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_subject_id_chapter_name_subtopic_name_key" UNIQUE ("subject_id", "chapter_name", "subtopic_name");



ALTER TABLE ONLY "public"."usage_feedback"
    ADD CONSTRAINT "usage_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage"
    ADD CONSTRAINT "usage_pkey" PRIMARY KEY ("user_id", "usage_date");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_evaluations_student_answer" ON "public"."evaluations" USING "btree" ("student_answer_id");



CREATE INDEX "idx_marking_schemes_question" ON "public"."marking_schemes" USING "btree" ("question_id");



CREATE INDEX "idx_questions_subject" ON "public"."questions" USING "btree" ("subject_id");



CREATE INDEX "idx_questions_topic_id" ON "public"."questions" USING "btree" ("topic_id");



CREATE INDEX "idx_student_answers_question" ON "public"."student_answers" USING "btree" ("question_id");



CREATE INDEX "idx_student_answers_user" ON "public"."student_answers" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_student_answer_id_fkey" FOREIGN KEY ("student_answer_id") REFERENCES "public"."student_answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marking_schemes"
    ADD CONSTRAINT "marking_schemes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_answer_images"
    ADD CONSTRAINT "student_answer_images_student_answer_id_fkey" FOREIGN KEY ("student_answer_id") REFERENCES "public"."student_answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_answer_images"
    ADD CONSTRAINT "student_answer_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."usage_feedback"
    ADD CONSTRAINT "usage_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage"
    ADD CONSTRAINT "usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow public anonymous inserts into waitlist" ON "public"."waitlist" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."evaluations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evaluations_delete_own_via_answer" ON "public"."evaluations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."student_answers" "sa"
  WHERE (("sa"."id" = "evaluations"."student_answer_id") AND ("sa"."user_id" = "auth"."uid"())))));



CREATE POLICY "evaluations_insert_own_via_answer" ON "public"."evaluations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_answers" "sa"
  WHERE (("sa"."id" = "evaluations"."student_answer_id") AND ("sa"."user_id" = "auth"."uid"())))));



CREATE POLICY "evaluations_select_own_via_answer" ON "public"."evaluations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."student_answers" "sa"
  WHERE (("sa"."id" = "evaluations"."student_answer_id") AND ("sa"."user_id" = "auth"."uid"())))));



CREATE POLICY "evaluations_update_own_via_answer" ON "public"."evaluations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."student_answers" "sa"
  WHERE (("sa"."id" = "evaluations"."student_answer_id") AND ("sa"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_answers" "sa"
  WHERE (("sa"."id" = "evaluations"."student_answer_id") AND ("sa"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."marking_schemes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marking_schemes_read_authenticated" ON "public"."marking_schemes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "questions_read_authenticated" ON "public"."questions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."student_answer_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_answers_delete_own" ON "public"."student_answers" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "student_answers_insert_own" ON "public"."student_answers" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "student_answers_select_own" ON "public"."student_answers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "student_answers_update_own" ON "public"."student_answers" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."subjects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subjects_read_authenticated" ON "public"."subjects" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "topics_read_authenticated" ON "public"."topics" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usage_feedback_insert_own" ON "public"."usage_feedback" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usage_select_own" ON "public"."usage" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."increment_usage"("user_id_param" "uuid", "daily_limit_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage"("user_id_param" "uuid", "daily_limit_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage"("user_id_param" "uuid", "daily_limit_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_date" "date", "p_cost" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_date" "date", "p_cost" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_date" "date", "p_cost" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."evaluations" TO "anon";
GRANT ALL ON TABLE "public"."evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."marking_schemes" TO "anon";
GRANT ALL ON TABLE "public"."marking_schemes" TO "authenticated";
GRANT ALL ON TABLE "public"."marking_schemes" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."student_answer_images" TO "anon";
GRANT ALL ON TABLE "public"."student_answer_images" TO "authenticated";
GRANT ALL ON TABLE "public"."student_answer_images" TO "service_role";



GRANT ALL ON TABLE "public"."student_answers" TO "anon";
GRANT ALL ON TABLE "public"."student_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."student_answers" TO "service_role";



GRANT ALL ON TABLE "public"."subjects" TO "anon";
GRANT ALL ON TABLE "public"."subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."subjects" TO "service_role";



GRANT ALL ON TABLE "public"."topics" TO "anon";
GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";



GRANT ALL ON TABLE "public"."usage" TO "anon";
GRANT ALL ON TABLE "public"."usage" TO "authenticated";
GRANT ALL ON TABLE "public"."usage" TO "service_role";



GRANT ALL ON TABLE "public"."usage_feedback" TO "anon";
GRANT ALL ON TABLE "public"."usage_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




































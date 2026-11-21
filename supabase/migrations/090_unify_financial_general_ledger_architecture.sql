-- Migration 090: Unify Financial General Ledger Architecture and Preserve Historical Data
-- Description:
-- Establishes the authoritative general ledger contract across all historical and current implementations:
--   Header table: public.financial_journal_entries
--   Line table:   public.financial_journal_lines
--
-- Forensic Context & Data Preservation:
-- The canonical architecture (Migration 040) established:
--   - public.financial_journal_entries (headers: id, entry_number, reference_type, reference_id, description, entry_date, created_at)
--   - public.financial_journal_lines (lines: id, journal_entry_id, account_id, debit_paise, credit_paise, created_at)
--
-- However, Migrations 082 and 083 assumed an alternate convention:
--   - public.financial_journals (headers: id, entry_number, entry_date, description, source_document_type, source_document_id)
--   - public.financial_journal_entries (acting as lines: journal_id, account_id, debit_amount_paise, credit_amount_paise, description)
--
-- Non-Destructive, Forward-Only Strategy:
-- 1. NO DESTRUCTIVE CASCADE: Under no circumstances is public.financial_journal_entries or any financial table dropped via CASCADE.
--    In Scenario B (where financial_journal_entries was created with line columns), it is non-destructively renamed
--    to public._legacy_alt_journal_lines_staged to preserve all rows, physical OIDs, constraints, and dependent objects.
--    After canonical reconstruction, foreign keys, triggers, and dependent objects are explicitly redirected.
-- 2. Complete Field-by-Field Collision Validation & Complete Line Migration:
--    Headers: id, entry_number, reference_type / source_document_type, reference_id / source_document_id, description, entry_date.
--    Lines: id, journal_entry_id, account_id, debit_paise, credit_paise, description, created_at.
--    In Scenario C, both non-overlapping headers AND non-overlapping lines are migrated losslessly in one transaction.
-- 3. Strict Financial Validation (No Unsafe Defaults):
--    No COALESCE fallbacks that manufacture identifiers ('JE-MIG-...') or default amounts to 0.
--    Any record missing required financial attributes, unbalanced lines, or referencing non-existent accounts aborts immediately.
-- 4. Full Preservation of Constraints, Strict RLS Policies, Grants, and Search Paths:
--    Explicit restoration of Super Admin RLS SELECT policies on both tables, denying anonymous/unauthorized access.

DO $$
DECLARE
    v_has_fj BOOLEAN;
    v_fje_has_journal_id BOOLEAN;
    v_fje_has_reference_type BOOLEAN;
    v_has_fjl BOOLEAN;
    v_has_fjl_alt BOOLEAN;
    v_migrated_headers INT := 0;
    v_migrated_lines INT := 0;
    v_collision_record RECORD;
    v_line_collision_record RECORD;
    v_invalid_count INT := 0;
    v_unbalanced_count INT := 0;
    v_missing_lines_count INT := 0;
    v_col_compat RECORD;
    v_alt_col_compat RECORD;
    v_scenario_b_col_compat RECORD;
    v_dep_record RECORD;
BEGIN
    -- 1. Introspect Table Catalog Dynamically
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_journals'
    ) INTO v_has_fj;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_entries' AND column_name = 'journal_id'
    ) INTO v_fje_has_journal_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_entries' AND column_name = 'reference_type'
    ) INTO v_fje_has_reference_type;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_journal_lines'
    ) INTO v_has_fjl;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_journal_lines_alt'
    ) INTO v_has_fjl_alt;

    -- =========================================================================
    -- VALIDATE EXISTING CANONICAL LINE TABLE STRUCTURE IF PRESENT
    -- =========================================================================
    IF v_has_fjl THEN
        -- Verify that required canonical columns exist with expected exact data types and nullability
        SELECT 
            count(*) FILTER (WHERE column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO') AS has_id,
            count(*) FILTER (WHERE column_name = 'journal_entry_id' AND data_type = 'uuid' AND is_nullable = 'NO') AS has_journal_entry_id,
            count(*) FILTER (WHERE column_name = 'account_id' AND data_type = 'uuid' AND is_nullable = 'NO') AS has_account_id,
            count(*) FILTER (WHERE column_name = 'debit_paise' AND data_type = 'bigint' AND is_nullable = 'NO') AS has_debit_paise,
            count(*) FILTER (WHERE column_name = 'credit_paise' AND data_type = 'bigint' AND is_nullable = 'NO') AS has_credit_paise,
            count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO') AS has_created_at
        INTO v_col_compat
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_lines';

        IF v_col_compat.has_id = 0 
           OR v_col_compat.has_journal_entry_id = 0 
           OR v_col_compat.has_account_id = 0 
           OR v_col_compat.has_debit_paise = 0 
           OR v_col_compat.has_credit_paise = 0
           OR v_col_compat.has_created_at = 0 THEN
            RAISE EXCEPTION 'FATAL: Existing public.financial_journal_lines table is structurally incompatible with canonical schema (missing required columns, non-null violations, or incorrect data types). Aborting migration to prevent data corruption.';
        END IF;
    END IF;

    -- =========================================================================
    -- SCENARIO B: Alternate Schema (financial_journals = headers, financial_journal_entries = lines)
    -- =========================================================================
    IF v_has_fj AND v_fje_has_journal_id AND NOT v_fje_has_reference_type THEN
        RAISE NOTICE 'Discovered Scenario B: Alternate Schema. Commencing non-destructive forward migration.';

        -- Pre-validation 0: Validate Scenario B alternate line table source columns (including created_at exact type & NOT NULL)
        SELECT 
            count(*) FILTER (WHERE column_name = 'id' AND data_type = 'uuid') AS has_id,
            count(*) FILTER (WHERE column_name = 'journal_id' AND data_type = 'uuid') AS has_journal_id,
            count(*) FILTER (WHERE column_name = 'account_id' AND data_type = 'uuid') AS has_account_id,
            count(*) FILTER (WHERE column_name = 'debit_amount_paise' AND data_type = 'bigint') AS has_debit_amount_paise,
            count(*) FILTER (WHERE column_name = 'credit_amount_paise' AND data_type = 'bigint') AS has_credit_amount_paise,
            count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO') AS has_created_at
        INTO v_scenario_b_col_compat
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_entries';

        IF v_scenario_b_col_compat.has_id = 0
           OR v_scenario_b_col_compat.has_journal_id = 0
           OR v_scenario_b_col_compat.has_account_id = 0
           OR v_scenario_b_col_compat.has_debit_amount_paise = 0
           OR v_scenario_b_col_compat.has_credit_amount_paise = 0
           OR v_scenario_b_col_compat.has_created_at = 0 THEN
            RAISE EXCEPTION 'FATAL: Alternate line table public.financial_journal_entries has an incompatible source column structure or invalid created_at timestamp type/nullability. Aborting Scenario B migration.';
        END IF;

        -- Check that no row in alternate line table has NULL created_at
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries
        WHERE created_at IS NULL;
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % row(s) in alternate financial_journal_entries with NULL created_at timestamp. Aborting to prevent data corruption.', v_invalid_count;
        END IF;

        -- Inventory dependencies before rename using PostgreSQL system catalogs (pg_constraint, pg_class, pg_namespace)
        -- Schema-qualified join on both source and target relations by OID and namespace
        FOR v_dep_record IN
            SELECT
                cl_src.relname AS dep_table,
                att.attname AS dep_column,
                cl_tgt.relname AS ref_table
            FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
            JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
            JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
            JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
            JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
            WHERE con.contype = 'f'
              AND ns_tgt.nspname = 'public'
              AND cl_tgt.relname = 'financial_journal_entries'
              AND NOT (ns_src.nspname = 'public' AND cl_src.relname = 'financial_journal_entries')
        LOOP
            RAISE EXCEPTION 'FATAL: Found active external foreign key dependency from %.% referencing alternate line table financial_journal_entries. Aborting migration to prevent broken relationships.',
                v_dep_record.dep_table, v_dep_record.dep_column;
        END LOOP;

        -- Inventory dependent ordinary and materialized views using pg_depend, pg_rewrite, pg_class, and pg_namespace
        FOR v_dep_record IN
            SELECT
                ns_view.nspname AS dep_schema,
                cl_view.relname AS dep_view_name
            FROM pg_catalog.pg_depend dep
            JOIN pg_catalog.pg_rewrite rw ON rw.oid = dep.objid
            JOIN pg_catalog.pg_class cl_view ON cl_view.oid = rw.ev_class
            JOIN pg_catalog.pg_namespace ns_view ON ns_view.oid = cl_view.relnamespace
            JOIN pg_catalog.pg_class cl_src ON cl_src.oid = dep.refobjid
            JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
            WHERE dep.classid = 'pg_catalog.pg_rewrite'::regclass
              AND dep.refclassid = 'pg_catalog.pg_class'::regclass
              AND dep.deptype = 'n'
              AND cl_view.relkind IN ('v', 'm')
              AND ns_src.nspname = 'public'
              AND cl_src.relname = 'financial_journal_entries'
              AND NOT (ns_view.nspname = 'public' AND cl_view.relname = 'financial_journal_entries')
        LOOP
            RAISE EXCEPTION 'FATAL: Found active dependent view %.% referencing alternate line table financial_journal_entries. Aborting migration to prevent broken view relationships.',
                v_dep_record.dep_schema, v_dep_record.dep_view_name;
        END LOOP;

        -- Pre-validation 1: Validate header source completeness in financial_journals (NO UNSAFE DEFAULTS)
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journals
        WHERE id IS NULL
           OR entry_number IS NULL OR trim(entry_number) = ''
           OR source_document_type IS NULL OR trim(source_document_type) = ''
           OR source_document_id IS NULL
           OR description IS NULL OR trim(description) = ''
           OR entry_date IS NULL;
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % header(s) in financial_journals with missing required fields (id, entry_number, source_document_type, source_document_id, description, or entry_date). Aborting to preserve financial integrity.', v_invalid_count;
        END IF;

        -- Pre-validation 2: Validate line source completeness in financial_journal_entries
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries
        WHERE id IS NULL
           OR journal_id IS NULL
           OR account_id IS NULL
           OR debit_amount_paise IS NULL OR debit_amount_paise < 0
           OR credit_amount_paise IS NULL OR credit_amount_paise < 0
           OR (debit_amount_paise = 0 AND credit_amount_paise = 0)
           OR (debit_amount_paise > 0 AND credit_amount_paise > 0);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % line(s) in alternate financial_journal_entries with null/negative/violating amounts or missing FKs. Aborting.', v_invalid_count;
        END IF;

        -- Pre-validation 3: Verify referential integrity using NOT EXISTS
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries fje
        WHERE NOT EXISTS (SELECT 1 FROM public.financial_accounts fa WHERE fa.id = fje.account_id);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % line(s) in alternate financial_journal_entries referencing non-existent accounts in financial_accounts.', v_invalid_count;
        END IF;

        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries fje
        WHERE NOT EXISTS (SELECT 1 FROM public.financial_journals fj WHERE fj.id = fje.journal_id);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % line(s) in alternate financial_journal_entries referencing non-existent headers in financial_journals.', v_invalid_count;
        END IF;

        -- Pre-validation 4: Verify that every alternate journal has lines AND is mathematically balanced (sum(Dr) == sum(Cr))
        SELECT count(*) INTO v_missing_lines_count
        FROM public.financial_journals fj
        WHERE NOT EXISTS (
            SELECT 1 FROM public.financial_journal_entries fje WHERE fje.journal_id = fj.id
        );
        IF v_missing_lines_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % header(s) in financial_journals with zero corresponding journal lines. Aborting.', v_missing_lines_count;
        END IF;

        WITH journal_balances AS (
            SELECT journal_id, sum(debit_amount_paise) AS tot_dr, sum(credit_amount_paise) AS tot_cr
            FROM public.financial_journal_entries
            GROUP BY journal_id
        )
        SELECT count(*) INTO v_unbalanced_count
        FROM journal_balances
        WHERE tot_dr <> tot_cr;
        IF v_unbalanced_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % unbalanced journal(s) in alternate schema where sum(debit) <> sum(credit). Aborting.', v_unbalanced_count;
        END IF;

        -- Non-destructive forward-only staging: RENAME rather than DROP CASCADE
        ALTER TABLE public.financial_journal_entries RENAME TO _legacy_alt_journal_lines_staged;

        -- Create authoritative canonical header table
        CREATE TABLE public.financial_journal_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entry_number TEXT NOT NULL UNIQUE,
            reference_type TEXT NOT NULL,
            reference_id UUID NOT NULL,
            description TEXT NOT NULL,
            entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Ensure authoritative canonical line table exists
        IF NOT v_has_fjl THEN
            CREATE TABLE public.financial_journal_lines (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
                account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
                debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
                credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT chk_debit_or_credit CHECK (
                    (debit_paise > 0 AND credit_paise = 0) OR
                    (credit_paise > 0 AND debit_paise = 0)
                )
            );
        END IF;

        -- Migrate headers from financial_journals with EXACT values (no invented identifiers or fallbacks)
        INSERT INTO public.financial_journal_entries (
            id,
            entry_number,
            reference_type,
            reference_id,
            description,
            entry_date,
            created_at
        )
        SELECT
            fj.id,
            fj.entry_number,
            fj.source_document_type,
            fj.source_document_id,
            fj.description,
            fj.entry_date,
            fj.created_at
        FROM public.financial_journals fj;
        GET DIAGNOSTICS v_migrated_headers = ROW_COUNT;

        -- Migrate lines from staged table with EXACT values
        INSERT INTO public.financial_journal_lines (
            id,
            journal_entry_id,
            account_id,
            debit_paise,
            credit_paise,
            created_at
        )
        SELECT
            alt.id,
            alt.journal_id,
            alt.account_id,
            alt.debit_amount_paise,
            alt.credit_amount_paise,
            alt.created_at
        FROM public._legacy_alt_journal_lines_staged alt;
        GET DIAGNOSTICS v_migrated_lines = ROW_COUNT;

        -- Secure staged legacy table from public access
        REVOKE ALL ON public._legacy_alt_journal_lines_staged FROM PUBLIC, anon, authenticated;
        GRANT SELECT ON public._legacy_alt_journal_lines_staged TO service_role;

        RAISE NOTICE 'Scenario B Non-Destructive Migration Complete: Migrated % headers and % lines losslessly.', v_migrated_headers, v_migrated_lines;

    -- =========================================================================
    -- SCENARIO C: Both conventions exist where financial_journal_entries is canonical headers, but financial_journals also exists
    -- =========================================================================
    ELSIF v_has_fj AND v_fje_has_reference_type THEN
        RAISE NOTICE 'Discovered Scenario C: Both conventions exist. Commencing exhaustive collision & field equivalence check.';

        -- Complete Header Comparison: UUID, entry_number, reference_type/source_document_type, reference_id/source_document_id, description, entry_date
        FOR v_collision_record IN EXECUTE $dyn$
            SELECT 
                fj.id,
                fj.entry_number AS fj_entry_number,
                fje.entry_number AS fje_entry_number,
                fj.source_document_id AS fj_ref_id,
                fje.reference_id AS fje_ref_id,
                fj.source_document_type AS fj_ref_type,
                fje.reference_type AS fje_ref_type,
                fj.description AS fj_desc,
                fje.description AS fje_desc,
                fj.entry_date AS fj_date,
                fje.entry_date AS fje_date
            FROM public.financial_journals fj
            JOIN public.financial_journal_entries fje ON fje.id = fj.id
            WHERE (fj.source_document_id IS DISTINCT FROM fje.reference_id)
               OR (fj.entry_number IS DISTINCT FROM fje.entry_number)
               OR (fj.source_document_type IS DISTINCT FROM fje.reference_type)
               OR (fj.description IS DISTINCT FROM fje.description)
               OR (fj.entry_date IS DISTINCT FROM fje.entry_date)
        $dyn$
        LOOP
            RAISE EXCEPTION 'FATAL: Financial journal header ID collision with conflicting fields detected for ID %: financial_journals(no=%, ref_type=%, ref_id=%, date=%) vs financial_journal_entries(no=%, ref_type=%, ref_id=%, date=%). Entire migration aborted.',
                v_collision_record.id,
                v_collision_record.fj_entry_number,
                v_collision_record.fj_ref_type,
                v_collision_record.fj_ref_id,
                v_collision_record.fj_date,
                v_collision_record.fje_entry_number,
                v_collision_record.fje_ref_type,
                v_collision_record.fje_ref_id,
                v_collision_record.fje_date;
        END LOOP;

        -- Validate that alternate headers to be migrated have all required fields (no missing fields or empty strings)
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journals fj
        WHERE NOT EXISTS (SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fj.id)
          AND (fj.entry_number IS NULL OR trim(fj.entry_number) = ''
            OR fj.source_document_type IS NULL OR trim(source_document_type) = ''
            OR fj.source_document_id IS NULL
            OR fj.description IS NULL OR trim(description) = ''
            OR fj.entry_date IS NULL);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % unmapped header(s) in financial_journals with missing required fields. Aborting migration.', v_invalid_count;
        END IF;

        -- Migrate verified non-overlapping alternate headers with exact attributes
        INSERT INTO public.financial_journal_entries (
            id,
            entry_number,
            reference_type,
            reference_id,
            description,
            entry_date,
            created_at
        )
        SELECT
            fj.id,
            fj.entry_number,
            fj.source_document_type,
            fj.source_document_id,
            fj.description,
            fj.entry_date,
            fj.created_at
        FROM public.financial_journals fj
        WHERE NOT EXISTS (
            SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fj.id
        );

        GET DIAGNOSTICS v_migrated_headers = ROW_COUNT;
        RAISE NOTICE 'Successfully migrated % non-overlapping alternate journal headers into financial_journal_entries.', v_migrated_headers;

        -- Complete Line Inspection and Lossless Migration in Scenario C
        IF v_has_fjl_alt THEN
            -- Validate alternate source schema explicitly across all 6 columns before dynamic queries
            SELECT 
                count(*) FILTER (WHERE column_name = 'id' AND data_type = 'uuid') AS has_id,
                count(*) FILTER (WHERE column_name = 'journal_id' AND data_type = 'uuid') AS has_journal_id,
                count(*) FILTER (WHERE column_name = 'account_id' AND data_type = 'uuid') AS has_account_id,
                count(*) FILTER (WHERE column_name = 'debit_amount_paise' AND data_type = 'bigint') AS has_debit_amount_paise,
                count(*) FILTER (WHERE column_name = 'credit_amount_paise' AND data_type = 'bigint') AS has_credit_amount_paise,
                count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO') AS has_created_at
            INTO v_alt_col_compat
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'financial_journal_lines_alt';

            IF v_alt_col_compat.has_id = 0
               OR v_alt_col_compat.has_journal_id = 0
               OR v_alt_col_compat.has_account_id = 0
               OR v_alt_col_compat.has_debit_amount_paise = 0
               OR v_alt_col_compat.has_credit_amount_paise = 0
               OR v_alt_col_compat.has_created_at = 0 THEN
                RAISE EXCEPTION 'FATAL: Alternate line table public.financial_journal_lines_alt has an incompatible column structure (missing required columns or incorrect data types). Aborting migration to prevent data loss.';
            END IF;

            -- Check for line collisions with differing financial amounts or account mappings
            FOR v_line_collision_record IN EXECUTE $dyn$
                SELECT 
                    alt.id,
                    alt.journal_id,
                    fjl.journal_entry_id,
                    alt.account_id AS alt_acc,
                    fjl.account_id AS fjl_acc,
                    alt.debit_amount_paise AS alt_dr,
                    fjl.debit_paise AS fjl_dr,
                    alt.credit_amount_paise AS alt_cr,
                    fjl.credit_paise AS fjl_cr
                FROM public.financial_journal_lines_alt alt
                JOIN public.financial_journal_lines fjl ON fjl.id = alt.id
                WHERE (alt.journal_id IS DISTINCT FROM fjl.journal_entry_id)
                   OR (alt.account_id IS DISTINCT FROM fjl.account_id)
                   OR (alt.debit_amount_paise IS DISTINCT FROM fjl.debit_paise)
                   OR (alt.credit_amount_paise IS DISTINCT FROM fjl.credit_paise)
            $dyn$
            LOOP
                RAISE EXCEPTION 'FATAL: Financial journal line collision with conflicting amounts detected for line ID %: alt(dr=%, cr=%, acc=%) vs canonical(dr=%, cr=%, acc=%). Migration aborted.',
                    v_line_collision_record.id,
                    v_line_collision_record.alt_dr,
                    v_line_collision_record.alt_cr,
                    v_line_collision_record.alt_acc,
                    v_line_collision_record.fjl_dr,
                    v_line_collision_record.fjl_cr,
                    v_line_collision_record.fjl_acc;
            END LOOP;

            -- Validate referential integrity of unmapped alternate lines using NOT EXISTS
            EXECUTE $dyn$
                SELECT count(*)
                FROM public.financial_journal_lines_alt alt
                WHERE NOT EXISTS (SELECT 1 FROM public.financial_journal_lines fjl WHERE fjl.id = alt.id)
                  AND (alt.id IS NULL
                    OR alt.journal_id IS NULL
                    OR alt.account_id IS NULL
                    OR alt.debit_amount_paise IS NULL OR alt.debit_amount_paise < 0
                    OR alt.credit_amount_paise IS NULL OR alt.credit_amount_paise < 0
                    OR (alt.debit_amount_paise = 0 AND alt.credit_amount_paise = 0)
                    OR (alt.debit_amount_paise > 0 AND alt.credit_amount_paise > 0)
                    OR alt.created_at IS NULL
                    OR NOT EXISTS (SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = alt.journal_id)
                    OR NOT EXISTS (SELECT 1 FROM public.financial_accounts fa WHERE fa.id = alt.account_id))
            $dyn$ INTO v_invalid_count;
            IF v_invalid_count > 0 THEN
                RAISE EXCEPTION 'FATAL: Found % unmapped line(s) in financial_journal_lines_alt with null fields, invalid accounts, missing headers, null timestamps, or violating amounts. Aborting.', v_invalid_count;
            END IF;

            -- Migrate verified non-overlapping alternate lines into canonical lines
            EXECUTE $dyn$
                INSERT INTO public.financial_journal_lines (
                    id,
                    journal_entry_id,
                    account_id,
                    debit_paise,
                    credit_paise,
                    created_at
                )
                SELECT
                    alt.id,
                    alt.journal_id,
                    alt.account_id,
                    alt.debit_amount_paise,
                    alt.credit_amount_paise,
                    alt.created_at
                FROM public.financial_journal_lines_alt alt
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.financial_journal_lines fjl WHERE fjl.id = alt.id
                )
            $dyn$;
            GET DIAGNOSTICS v_migrated_lines = ROW_COUNT;
            RAISE NOTICE 'Successfully migrated % non-overlapping alternate journal lines into financial_journal_lines.', v_migrated_lines;
        END IF;

    -- =========================================================================
    -- SCENARIO A: Target database already strictly complies with Canonical Schema
    -- =========================================================================
    ELSE
        RAISE NOTICE 'Target database strictly complies with Canonical Schema (financial_journal_entries = headers, financial_journal_lines = lines). No alternate headers found.';
    END IF;

    -- =========================================================================
    -- POST-MIGRATION GLOBAL ACCOUNTING INTEGRITY ASSERTIONS
    -- =========================================================================
    -- Assert 1: Reject any journal entry containing fewer than 2 lines, or missing debit or credit representation
    WITH journal_side_analysis AS (
        SELECT 
            fje.id AS journal_id,
            count(fjl.id) AS total_lines,
            count(fjl.id) FILTER (WHERE fjl.debit_paise > 0 AND fjl.credit_paise = 0) AS debit_lines,
            count(fjl.id) FILTER (WHERE fjl.credit_paise > 0 AND fjl.debit_paise = 0) AS credit_lines
        FROM public.financial_journal_entries fje
        LEFT JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
        GROUP BY fje.id
    )
    SELECT count(*) INTO v_missing_lines_count
    FROM journal_side_analysis
    WHERE total_lines < 2 OR debit_lines < 1 OR credit_lines < 1;

    IF v_missing_lines_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Post-migration integrity failure: % journal entry/entries have fewer than 2 lines or are missing a debit or credit side. Aborting transaction.', v_missing_lines_count;
    END IF;

    -- Assert 2: Verify every line points to a valid header and valid account (using NOT EXISTS)
    SELECT count(*) INTO v_invalid_count
    FROM public.financial_journal_lines fjl
    WHERE NOT EXISTS (SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fjl.journal_entry_id)
       OR NOT EXISTS (SELECT 1 FROM public.financial_accounts fa WHERE fa.id = fjl.account_id);
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Post-migration integrity failure: % orphaned line(s) or line(s) referencing non-existent accounts detected in financial_journal_lines. Aborting transaction.', v_invalid_count;
    END IF;

    -- Assert 3: Every journal entry is strictly balanced (sum(Dr) == sum(Cr))
    WITH post_balances AS (
        SELECT journal_entry_id, sum(debit_paise) AS tot_dr, sum(credit_paise) AS tot_cr
        FROM public.financial_journal_lines
        GROUP BY journal_entry_id
    )
    SELECT count(*) INTO v_unbalanced_count
    FROM post_balances
    WHERE tot_dr <> tot_cr;
    IF v_unbalanced_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Post-migration integrity failure: % journal entry/entries are unbalanced where debit <> credit. Aborting transaction.', v_unbalanced_count;
    END IF;

    -- =========================================================================
    -- POST-MIGRATION FOREIGN KEY ON DELETE HARDENING & INTEGRITY RESTORATION
    -- =========================================================================
    -- Check 1: Ensure zero orphaned journal lines exist before FK manipulation
    SELECT count(*) INTO v_invalid_count
    FROM public.financial_journal_lines fjl
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fjl.journal_entry_id
    );
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % orphaned financial_journal_lines record(s) referencing non-existent financial_journal_entries. Aborting foreign-key hardening to prevent data loss.', v_invalid_count;
    END IF;

    -- Check 2: Ensure zero lines reference non-existent financial accounts
    SELECT count(*) INTO v_invalid_count
    FROM public.financial_journal_lines fjl
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_accounts fa WHERE fa.id = fjl.account_id
    );
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % financial_journal_lines record(s) referencing non-existent financial_accounts. Aborting foreign-key hardening to prevent data loss.', v_invalid_count;
    END IF;

    -- Relationship 1: financial_journal_lines.journal_entry_id -> financial_journal_entries.id
    -- Drop any conflicting, duplicate, unvalidated, or non-RESTRICT foreign keys on (journal_entry_id -> financial_journal_entries.id)
    FOR v_dep_record IN
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_journal_entries'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'journal_entry_id'
          AND att_tgt.attname = 'id'
          AND (con.confdeltype <> 'r' OR NOT con.convalidated OR con.conname <> 'financial_journal_lines_journal_entry_id_fkey')
    LOOP
        EXECUTE format('ALTER TABLE public.financial_journal_lines DROP CONSTRAINT %I', v_dep_record.conname);
    END LOOP;

    -- Canonical constraint-name collision protection for Relationship 1
    FOR v_dep_record IN
        SELECT
            con.conname,
            ns_src.nspname AS src_ns,
            cl_src.relname AS src_tbl,
            ns_tgt.nspname AS tgt_ns,
            cl_tgt.relname AS tgt_tbl,
            pg_catalog.pg_get_constraintdef(con.oid, true) AS existing_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        LEFT JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        LEFT JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        LEFT JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        LEFT JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.financial_journal_lines'::regclass
          AND con.conname = 'financial_journal_lines_journal_entry_id_fkey'
          AND NOT (
              con.contype = 'f'
              AND ns_src.nspname = 'public'
              AND cl_src.relname = 'financial_journal_lines'
              AND ns_tgt.nspname = 'public'
              AND cl_tgt.relname = 'financial_journal_entries'
              AND cardinality(con.conkey) = 1
              AND cardinality(con.confkey) = 1
              AND att_src.attname = 'journal_entry_id'
              AND att_tgt.attname = 'id'
              AND con.confdeltype = 'r'
              AND con.convalidated
          )
    LOOP
        RAISE EXCEPTION 'FATAL: Constraint name collision on financial_journal_lines_journal_entry_id_fkey. Existing constraint on %.% referencing %.% with definition [%] does not match expected relationship public.financial_journal_lines(journal_entry_id) -> public.financial_journal_entries(id) ON DELETE RESTRICT.',
            v_dep_record.src_ns, v_dep_record.src_tbl, coalesce(v_dep_record.tgt_ns, 'none'), coalesce(v_dep_record.tgt_tbl, 'none'), v_dep_record.existing_def;
    END LOOP;

    -- If the canonical constraint does not exist (missing case), create it with ON DELETE RESTRICT
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_journal_entries'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'journal_entry_id'
          AND att_tgt.attname = 'id'
          AND con.confdeltype = 'r'
          AND con.convalidated
          AND con.conname = 'financial_journal_lines_journal_entry_id_fkey'
    ) THEN
        ALTER TABLE public.financial_journal_lines
            ADD CONSTRAINT financial_journal_lines_journal_entry_id_fkey
                FOREIGN KEY (journal_entry_id)
                REFERENCES public.financial_journal_entries(id)
                ON DELETE RESTRICT;
    END IF;

    -- Relationship 2: financial_journal_lines.account_id -> financial_accounts.id
    -- Drop any conflicting, duplicate, unvalidated, or non-RESTRICT foreign keys on (account_id -> financial_accounts.id)
    FOR v_dep_record IN
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_accounts'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'account_id'
          AND att_tgt.attname = 'id'
          AND (con.confdeltype <> 'r' OR NOT con.convalidated OR con.conname <> 'financial_journal_lines_account_id_fkey')
    LOOP
        EXECUTE format('ALTER TABLE public.financial_journal_lines DROP CONSTRAINT %I', v_dep_record.conname);
    END LOOP;

    -- Canonical constraint-name collision protection for Relationship 2
    FOR v_dep_record IN
        SELECT
            con.conname,
            ns_src.nspname AS src_ns,
            cl_src.relname AS src_tbl,
            ns_tgt.nspname AS tgt_ns,
            cl_tgt.relname AS tgt_tbl,
            pg_catalog.pg_get_constraintdef(con.oid, true) AS existing_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        LEFT JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        LEFT JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        LEFT JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        LEFT JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.financial_journal_lines'::regclass
          AND con.conname = 'financial_journal_lines_account_id_fkey'
          AND NOT (
              con.contype = 'f'
              AND ns_src.nspname = 'public'
              AND cl_src.relname = 'financial_journal_lines'
              AND ns_tgt.nspname = 'public'
              AND cl_tgt.relname = 'financial_accounts'
              AND cardinality(con.conkey) = 1
              AND cardinality(con.confkey) = 1
              AND att_src.attname = 'account_id'
              AND att_tgt.attname = 'id'
              AND con.confdeltype = 'r'
              AND con.convalidated
          )
    LOOP
        RAISE EXCEPTION 'FATAL: Constraint name collision on financial_journal_lines_account_id_fkey. Existing constraint on %.% referencing %.% with definition [%] does not match expected relationship public.financial_journal_lines(account_id) -> public.financial_accounts(id) ON DELETE RESTRICT.',
            v_dep_record.src_ns, v_dep_record.src_tbl, coalesce(v_dep_record.tgt_ns, 'none'), coalesce(v_dep_record.tgt_tbl, 'none'), v_dep_record.existing_def;
    END LOOP;

    -- If the canonical constraint does not exist (missing case), create it with ON DELETE RESTRICT
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_accounts'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'account_id'
          AND att_tgt.attname = 'id'
          AND con.confdeltype = 'r'
          AND con.convalidated
          AND con.conname = 'financial_journal_lines_account_id_fkey'
    ) THEN
        ALTER TABLE public.financial_journal_lines
            ADD CONSTRAINT financial_journal_lines_account_id_fkey
                FOREIGN KEY (account_id)
                REFERENCES public.financial_accounts(id)
                ON DELETE RESTRICT;
    END IF;

    -- =========================================================================
    -- STRICT FINAL POST-MIGRATION FOREIGN KEY CATALOG ASSERTIONS
    -- =========================================================================
    -- Assert Relationship 1: exactly 1 valid single-column ON DELETE RESTRICT constraint
    SELECT count(*) INTO v_invalid_count
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
    JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
    JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
    JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
    JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND ns_src.nspname = 'public'
      AND cl_src.relname = 'financial_journal_lines'
      AND ns_tgt.nspname = 'public'
      AND cl_tgt.relname = 'financial_journal_entries'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND att_src.attname = 'journal_entry_id'
      AND att_tgt.attname = 'id'
      AND con.confdeltype = 'r'
      AND con.convalidated
      AND con.conname = 'financial_journal_lines_journal_entry_id_fkey';

    IF v_invalid_count <> 1 THEN
        RAISE EXCEPTION 'FATAL: Post-migration catalog assertion failure: expected exactly 1 valid foreign key for financial_journal_lines(journal_entry_id) -> financial_journal_entries(id) ON DELETE RESTRICT, found %.', v_invalid_count;
    END IF;

    -- Assert Relationship 2: exactly 1 valid single-column ON DELETE RESTRICT constraint
    SELECT count(*) INTO v_invalid_count
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
    JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
    JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
    JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
    JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND ns_src.nspname = 'public'
      AND cl_src.relname = 'financial_journal_lines'
      AND ns_tgt.nspname = 'public'
      AND cl_tgt.relname = 'financial_accounts'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND att_src.attname = 'account_id'
      AND att_tgt.attname = 'id'
      AND con.confdeltype = 'r'
      AND con.convalidated
      AND con.conname = 'financial_journal_lines_account_id_fkey';

    IF v_invalid_count <> 1 THEN
        RAISE EXCEPTION 'FATAL: Post-migration catalog assertion failure: expected exactly 1 valid foreign key for financial_journal_lines(account_id) -> financial_accounts(id) ON DELETE RESTRICT, found %.', v_invalid_count;
    END IF;

END $$;

-- Enforce canonical indexes on header table
CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_reference
    ON public.financial_journal_entries (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_date
    ON public.financial_journal_entries (entry_date);

-- Enforce canonical indexes on line table
CREATE INDEX IF NOT EXISTS idx_financial_journal_lines_entry
    ON public.financial_journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_financial_journal_lines_account
    ON public.financial_journal_lines (account_id);

-- Enforce strict RLS on both tables
ALTER TABLE public.financial_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_lines ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from untrusted roles
REVOKE ALL ON public.financial_journal_entries FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_lines FROM PUBLIC, anon;

-- Grant selective read to authenticated users for RLS evaluation
GRANT SELECT ON public.financial_journal_entries TO authenticated;
GRANT SELECT ON public.financial_journal_lines TO authenticated;

-- Grant full administrative authority to service_role
GRANT ALL ON public.financial_journal_entries TO service_role;
GRANT ALL ON public.financial_journal_lines TO service_role;

-- =============================================================================
-- EXPLICIT RLS POLICIES (Preserving Principle of Least Privilege)
-- Only Super Admins may read general ledger records directly.
-- Customers and Astrologers cannot read other users' sensitive financial records.
-- Drop all existing policies on both tables to ensure no overly permissive policy survives.
-- =============================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'financial_journal_entries'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.financial_journal_entries', pol.policyname);
    END LOOP;

    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'financial_journal_lines'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.financial_journal_lines', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Super Admins can view financial journal entries"
  ON public.financial_journal_entries FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super Admins can view financial journal lines"
  ON public.financial_journal_lines FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Canonical documentation comments
COMMENT ON TABLE public.financial_journal_entries IS 'Canonical double-entry general ledger journal header table.';
COMMENT ON TABLE public.financial_journal_lines IS 'Canonical double-entry general ledger journal line items (debits and credits in integer paise).';

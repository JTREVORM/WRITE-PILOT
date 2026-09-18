-- =============================================================================
-- WritePilot :: 0007 :: Catalogue seed
-- -----------------------------------------------------------------------------
-- Starting configuration for features, plans, the entitlement matrix and credit
-- packs. These are *defaults*, not constants: every value here is editable at
-- runtime without a deploy. The migration is idempotent so it can be re-run
-- safely, and it never clobbers a price an operator has since changed -- only
-- structural columns are refreshed on conflict.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Features and their default credit costs
-- -----------------------------------------------------------------------------

insert into public.features (key, name, description, category, credit_cost, max_words, sort_order) values
  ('grammar_check',   'Grammar Checker',   'Grammar, spelling, punctuation, clarity and readability review.', 'writing',  1,  20000, 10),
  ('ai_detection',    'AI Detector',       'Estimated AI-generated likelihood with paragraph-level analysis.', 'analysis', 2,  20000, 20),
  ('naturalize',      'Naturalize',        'Improves clarity, flow and readability while preserving meaning.', 'writing',  3,  10000, 30),
  ('citation_check',  'Citation Checker',  'Validates in-text citations and reference lists against a style.',  'research', 2,  30000, 40),
  ('ai_grading',      'AI Grader',         'AI-assisted estimated grade against an assignment rubric.',        'analysis', 5,  30000, 50),
  ('rubric_analysis', 'Rubric Analysis',   'Extracts rubric criteria and scores a document against them.',     'analysis', 8,  30000, 60),
  ('writing_coach',   'AI Writing Coach',  'Explains writing issues and how to address them.',                 'coaching', 4,  20000, 70),
  ('deep_analysis',   'Deep Document Analysis', 'Full-document review producing a prioritised fix list.',      'analysis', 10, 50000, 80),
  ('document_upload', 'Document Upload',   'Uploading and storing a document in the workspace.',               'workspace',0,  null,  90)
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  sort_order  = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
-- Yearly price is set to ten months of the monthly price (two months free).

insert into public.plans (
  key, name, tagline, description,
  price_monthly_cents, price_yearly_cents, monthly_credits,
  max_documents, max_file_size_mb, max_words_per_request, max_document_versions,
  credits_roll_over, priority_processing, is_highlighted, sort_order
) values
  (
    'free', 'Free', 'Try every tool before you pay',
    'Enough credits each month to try WritePilot on real work.',
    0, 0, 30,
    5, 5, 1500, 3,
    false, false, false, 10
  ),
  (
    'student', 'Student', 'For coursework and assignments',
    'Higher limits for essays, assignments and research across a full semester.',
    599, 5990, 300,
    100, 15, 5000, 10,
    false, false, true, 20
  ),
  (
    'pro', 'Pro', 'For researchers and professional writers',
    'Deep analysis, the writing coach and priority processing on long documents.',
    999, 9990, 800,
    null, 25, 15000, 30,
    true, true, false, 30
  ),
  (
    'educator', 'Educator', 'For teachers, lecturers and tutors',
    'Custom rubrics, batch grading and reporting across a class of submissions.',
    1999, 19990, 2000,
    null, 50, 25000, null,
    true, true, false, 40
  )
on conflict (key) do update set
  name        = excluded.name,
  tagline     = excluded.tagline,
  description = excluded.description,
  sort_order  = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Entitlement matrix
-- -----------------------------------------------------------------------------
-- monthly_limit NULL means "bounded only by the credit balance". The free plan
-- caps each feature so a single account cannot drain a month of credits into one
-- expensive operation.

with matrix(plan_key, feature_key, is_enabled, monthly_limit) as (
  values
    -- Free: everything is reachable, in small quantities.
    ('free',     'grammar_check',   true,  20),
    ('free',     'ai_detection',    true,  5),
    ('free',     'naturalize',      true,  5),
    ('free',     'citation_check',  true,  3),
    ('free',     'ai_grading',      true,  2),
    ('free',     'rubric_analysis', true,  1),
    ('free',     'writing_coach',   false, 0),
    ('free',     'deep_analysis',   false, 0),
    ('free',     'document_upload', true,  10),

    -- Student
    ('student',  'grammar_check',   true,  null),
    ('student',  'ai_detection',    true,  null),
    ('student',  'naturalize',      true,  null),
    ('student',  'citation_check',  true,  null),
    ('student',  'ai_grading',      true,  null),
    ('student',  'rubric_analysis', true,  null),
    ('student',  'writing_coach',   false, 0),
    ('student',  'deep_analysis',   false, 0),
    ('student',  'document_upload', true,  null),

    -- Pro
    ('pro',      'grammar_check',   true,  null),
    ('pro',      'ai_detection',    true,  null),
    ('pro',      'naturalize',      true,  null),
    ('pro',      'citation_check',  true,  null),
    ('pro',      'ai_grading',      true,  null),
    ('pro',      'rubric_analysis', true,  null),
    ('pro',      'writing_coach',   true,  null),
    ('pro',      'deep_analysis',   true,  null),
    ('pro',      'document_upload', true,  null),

    -- Educator
    ('educator', 'grammar_check',   true,  null),
    ('educator', 'ai_detection',    true,  null),
    ('educator', 'naturalize',      true,  null),
    ('educator', 'citation_check',  true,  null),
    ('educator', 'ai_grading',      true,  null),
    ('educator', 'rubric_analysis', true,  null),
    ('educator', 'writing_coach',   true,  null),
    ('educator', 'deep_analysis',   true,  null),
    ('educator', 'document_upload', true,  null)
)
insert into public.plan_features (plan_id, feature_key, is_enabled, monthly_limit)
select p.id, m.feature_key, m.is_enabled, m.monthly_limit
from matrix m
join public.plans p on p.key = m.plan_key
on conflict (plan_id, feature_key) do update set
  is_enabled = excluded.is_enabled;

-- -----------------------------------------------------------------------------
-- Credit packs
-- -----------------------------------------------------------------------------

insert into public.credit_packs (key, name, description, credits, price_cents, sort_order) values
  ('pack_10', 'Top-up 10',  'A few extra checks before a deadline.', 10, 299, 10),
  ('pack_30', 'Top-up 30',  'Enough for a full assignment review.',  30, 599, 20),
  ('pack_75', 'Top-up 75',  'Best value for a heavy writing week.',  75, 999, 30)
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  sort_order  = excluded.sort_order;

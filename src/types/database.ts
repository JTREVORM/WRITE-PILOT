/**
 * Typed contract for the WritePilot Postgres schema.
 *
 * Kept in step with `supabase/migrations/*`. Once the Supabase CLI is wired up
 * in CI this file can be regenerated with:
 *   supabase gen types typescript --local > src/types/database.ts
 * It is written by hand for now so that the application is fully typed without
 * requiring a running database at build time.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "user" | "educator" | "admin";

export type UserType =
  | "student"
  | "researcher"
  | "educator"
  | "professional"
  | "other";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "expired";

export type BillingInterval = "month" | "year";

export type CreditTransactionType =
  | "signup_grant"
  | "plan_grant"
  | "purchase"
  | "consumption"
  | "refund"
  | "expiry"
  | "admin_adjustment";

export type UsageStatus = "success" | "failure" | "rejected";

export type ScanSource = "text" | "pdf" | "docx" | "txt";

export type DetectionConfidence = "low" | "medium" | "high";

/** Feature keys seeded in 0007. New keys are a data change, not a type change. */
export type FeatureKey =
  | "grammar_check"
  | "ai_detection"
  | "naturalize"
  | "citation_check"
  | "ai_grading"
  | "rubric_analysis"
  | "writing_coach"
  | "deep_analysis"
  | "document_upload";

export type PlanKey = "free" | "student" | "pro" | "educator";

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  timezone: string;
  locale: string;
  user_type: UserType;
  marketing_opt_in: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRoleRow = {
  user_id: string;
  role: AppRole;
  granted_by: string | null;
  granted_at: string;
};

export type FeatureRow = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  credit_cost: number;
  max_words: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PlanRow = {
  id: string;
  key: string;
  name: string;
  tagline: string | null;
  description: string | null;
  currency: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  monthly_credits: number;
  max_documents: number | null;
  max_file_size_mb: number;
  max_words_per_request: number | null;
  max_document_versions: number | null;
  credits_roll_over: boolean;
  priority_processing: boolean;
  is_public: boolean;
  is_active: boolean;
  is_highlighted: boolean;
  sort_order: number;
  provider_price_id_monthly: string | null;
  provider_price_id_yearly: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanFeatureRow = {
  plan_id: string;
  feature_key: string;
  is_enabled: boolean;
  credit_cost_override: number | null;
  monthly_limit: number | null;
  max_words_override: number | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_ends_at: string | null;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type CreditPackRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  credits: number;
  price_cents: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  provider_price_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditWalletRow = {
  user_id: string;
  balance: number;
  purchased_balance: number;
  monthly_allowance: number;
  period_start: string;
  period_end: string | null;
  lifetime_granted: number;
  lifetime_purchased: number;
  lifetime_consumed: number;
  updated_at: string;
};

export type CreditTransactionRow = {
  id: string;
  user_id: string;
  type: CreditTransactionType;
  amount: number;
  balance_after: number;
  feature_key: string | null;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string | null;
  metadata: Json;
  created_at: string;
};

export type UsageLogRow = {
  id: string;
  user_id: string;
  feature_key: string;
  plan_key: string | null;
  status: UsageStatus;
  credits_charged: number;
  words_processed: number;
  characters_processed: number;
  duration_ms: number | null;
  provider: string | null;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Json;
  created_at: string;
};

export type UsageCounterRow = {
  user_id: string;
  feature_key: string;
  period_start: string;
  used_count: number;
  credits_used: number;
  words_used: number;
  updated_at: string;
};

export type SuggestionCategory =
  | "grammar"
  | "spelling"
  | "punctuation"
  | "structure"
  | "tense"
  | "word_choice"
  | "clarity"
  | "repetition"
  | "wordiness";

export type SuggestionSeverity = "correction" | "improvement" | "consideration";

export type SuggestionStatus = "pending" | "accepted" | "rejected";

export type NaturalizeModeValue =
  | "natural"
  | "academic"
  | "professional"
  | "formal"
  | "simple"
  | "conversational"
  | "concise";

export type RubricRow = {
  id: string;
  user_id: string;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  raw_text: string;
  total_points: number;
  notes: string | null;
  provider: string | null;
  model: string | null;
  credits_charged: number;
  created_at: string;
  updated_at: string;
};

export type RubricCriterionRow = {
  id: string;
  rubric_id: string;
  position: number;
  name: string;
  description: string | null;
  max_points: number;
};

export type GradeRow = {
  document_id: string | null;
  id: string;
  user_id: string;
  rubric_id: string | null;
  rubric_title: string | null;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  content: string;
  instructions: string | null;
  word_count: number;
  estimated_points: number;
  max_points: number;
  summary: string | null;
  overall_strengths: Json;
  overall_improvements: Json;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  credits_charged: number;
  credit_transaction_id: string | null;
  created_at: string;
};

export type GradeCriterionRow = {
  id: string;
  grade_id: string;
  rubric_criterion_id: string | null;
  position: number;
  name: string;
  awarded_points: number;
  max_points: number;
  explanation: string | null;
  strengths: Json;
  weaknesses: Json;
  missing: Json;
  improvements: Json;
};

export type PaymentEventStatus = "received" | "processed" | "ignored" | "failed";
export type PaymentKind = "subscription" | "credit_pack";
export type PaymentStatusValue = "succeeded" | "refunded" | "failed";

export type BillingCustomerRow = {
  user_id: string;
  provider: string;
  provider_customer_id: string;
  created_at: string;
  updated_at: string;
};

export type PaymentEventRow = {
  provider: string;
  event_id: string;
  type: string;
  status: PaymentEventStatus;
  payload: Json;
  error: string | null;
  received_at: string;
  processed_at: string | null;
};

export type PaymentRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_reference: string;
  kind: PaymentKind;
  status: PaymentStatusValue;
  amount_cents: number;
  currency: string;
  description: string | null;
  credits_granted: number;
  created_at: string;
};

export type ImprovementCategoryValue =
  | "structure"
  | "argument"
  | "evidence"
  | "clarity"
  | "mechanics"
  | "citations"
  | "formatting";

export type ImprovementOrigin = "measured" | "advised";
export type ImprovementStatus = "open" | "done" | "dismissed";

export type AnalysisRunRow = {
  id: string;
  user_id: string;
  document_id: string | null;
  assignment_id: string | null;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  content: string;
  word_count: number;
  summary: string | null;
  carried_from: Json;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  credits_charged: number;
  credit_transaction_id: string | null;
  created_at: string;
};

export type ImprovementActionRow = {
  id: string;
  analysis_id: string;
  position: number;
  origin: ImprovementOrigin;
  category: ImprovementCategoryValue;
  title: string;
  detail: string;
  location: string | null;
  impact: number;
  effort: number;
  priority_score: number;
  status: ImprovementStatus;
  resolved_at: string | null;
  coaching: string | null;
  coached_at: string | null;
};

export type AssignmentStatus = "planning" | "drafting" | "submitted";

export type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  source: ScanSource;
  original_filename: string | null;
  storage_path: string | null;
  content_type: string | null;
  byte_size: number | null;
  content: string;
  word_count: number;
  character_count: number;
  created_at: string;
  updated_at: string;
};

export type AssignmentRow = {
  id: string;
  user_id: string;
  title: string;
  course: string | null;
  instructions: string | null;
  rubric_id: string | null;
  status: AssignmentStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AssignmentDraftRow = {
  id: string;
  assignment_id: string;
  document_id: string;
  version: number;
  note: string | null;
  created_at: string;
};

export type CitationStyleValue = "apa7" | "mla9" | "chicago" | "harvard";
export type CitationFindingOrigin = "local" | "model";
export type CitationSeverity = "error" | "warning" | "info";
export type CitationFindingStatus = "open" | "resolved" | "dismissed";

export type CitationCheckRow = {
  document_id: string | null;
  id: string;
  user_id: string;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  content: string;
  style: CitationStyleValue;
  detected_style: string | null;
  word_count: number;
  list_heading: string | null;
  in_text_count: number;
  distinct_sources: number;
  reference_count: number;
  summary: string | null;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  credits_charged: number;
  credit_transaction_id: string | null;
  created_at: string;
};

export type CitationEntryRow = {
  id: string;
  check_id: string;
  position: number;
  raw_text: string;
  first_author: string | null;
  year: string | null;
  has_link: boolean;
  cited: boolean;
};

export type CitationFindingRow = {
  id: string;
  check_id: string;
  entry_id: string | null;
  position: number;
  origin: CitationFindingOrigin;
  kind: string;
  severity: CitationSeverity;
  target_text: string;
  message: string;
  suggestion: string | null;
  status: CitationFindingStatus;
  resolved_at: string | null;
};

export type NaturalizeRunRow = {
  document_id: string | null;
  id: string;
  user_id: string;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  mode: NaturalizeModeValue;
  content: string;
  improved: string;
  word_count: number;
  improved_word_count: number;
  character_count: number;
  summary: string | null;
  readability_before: Json;
  readability_after: Json;
  integrity_findings: Json;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  credits_charged: number;
  credit_transaction_id: string | null;
  created_at: string;
};

export type NaturalizeParagraphRow = {
  id: string;
  run_id: string;
  position: number;
  original_text: string;
  improved_text: string;
  note: string | null;
  changed: boolean;
};

export type GrammarCheckRow = {
  document_id: string | null;
  id: string;
  user_id: string;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  content: string;
  word_count: number;
  character_count: number;
  readability: Json;
  summary: string | null;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  credits_charged: number;
  credit_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GrammarSuggestionRow = {
  id: string;
  check_id: string;
  position: number;
  start_offset: number;
  end_offset: number;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  original_text: string;
  suggested_text: string;
  explanation: string | null;
  status: SuggestionStatus;
  resolved_at: string | null;
};

export type AiScanRow = {
  document_id: string | null;
  id: string;
  user_id: string;
  title: string;
  source: ScanSource;
  source_filename: string | null;
  content: string;
  word_count: number;
  character_count: number;
  estimated_ai_likelihood: number;
  confidence: DetectionConfidence;
  summary: string | null;
  signals: Json;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  credits_charged: number;
  credit_transaction_id: string | null;
  created_at: string;
};

export type AiScanSegmentRow = {
  id: string;
  scan_id: string;
  position: number;
  start_offset: number;
  end_offset: number;
  estimated_ai_likelihood: number;
  rationale: string | null;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_role: AppRole | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Json;
  created_at: string;
};

/**
 * Table definition helper.
 *
 * `Row` is authoritative. `Insert` makes every column optional except those
 * listed in `Required` — i.e. the columns with no database default — which
 * mirrors what PostgREST will actually accept.
 */
type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id" | "email">;
      user_roles: Table<UserRoleRow, "user_id" | "role">;
      features: Table<FeatureRow, "key" | "name">;
      plans: Table<PlanRow, "key" | "name">;
      plan_features: Table<PlanFeatureRow, "plan_id" | "feature_key">;
      subscriptions: Table<SubscriptionRow, "user_id" | "plan_id">;
      credit_packs: Table<CreditPackRow, "key" | "name" | "credits" | "price_cents">;
      credit_wallets: Table<CreditWalletRow, "user_id">;
      credit_transactions: Table<
        CreditTransactionRow,
        "user_id" | "type" | "amount" | "balance_after"
      >;
      usage_logs: Table<UsageLogRow, "user_id" | "feature_key">;
      usage_counters: Table<
        UsageCounterRow,
        "user_id" | "feature_key" | "period_start"
      >;
      notifications: Table<NotificationRow, "user_id" | "title">;
      audit_logs: Table<AuditLogRow, "action">;
      ai_scans: Table<
        AiScanRow,
        | "user_id"
        | "title"
        | "content"
        | "word_count"
        | "character_count"
        | "estimated_ai_likelihood"
      >;
      ai_scan_segments: Table<
        AiScanSegmentRow,
        | "scan_id"
        | "position"
        | "start_offset"
        | "end_offset"
        | "estimated_ai_likelihood"
      >;
      grammar_checks: Table<
        GrammarCheckRow,
        "user_id" | "title" | "content" | "word_count" | "character_count"
      >;
      rubrics: Table<RubricRow, "user_id" | "title" | "raw_text">;
      rubric_criteria: Table<
        RubricCriterionRow,
        "rubric_id" | "position" | "name" | "max_points"
      >;
      grades: Table<
        GradeRow,
        "user_id" | "title" | "content" | "word_count"
      >;
      grade_criteria: Table<
        GradeCriterionRow,
        | "grade_id"
        | "position"
        | "name"
        | "awarded_points"
        | "max_points"
      >;
      naturalize_runs: Table<
        NaturalizeRunRow,
        | "user_id"
        | "title"
        | "content"
        | "improved"
        | "word_count"
        | "character_count"
      >;
      naturalize_paragraphs: Table<
        NaturalizeParagraphRow,
        "run_id" | "position" | "original_text" | "improved_text"
      >;
      billing_customers: Table<
        BillingCustomerRow,
        "user_id" | "provider_customer_id"
      >;
      payment_events: Table<PaymentEventRow, "event_id" | "type">;
      payments: Table<
        PaymentRow,
        "user_id" | "provider_reference" | "kind" | "amount_cents"
      >;
      analysis_runs: Table<
        AnalysisRunRow,
        "user_id" | "title" | "content" | "word_count"
      >;
      improvement_actions: Table<
        ImprovementActionRow,
        | "analysis_id"
        | "position"
        | "origin"
        | "category"
        | "title"
        | "detail"
        | "impact"
        | "effort"
        | "priority_score"
      >;
      documents: Table<
        DocumentRow,
        "user_id" | "title" | "content"
      >;
      assignments: Table<AssignmentRow, "user_id" | "title">;
      assignment_drafts: Table<
        AssignmentDraftRow,
        "assignment_id" | "document_id" | "version"
      >;
      citation_checks: Table<
        CitationCheckRow,
        "user_id" | "title" | "content" | "style" | "word_count"
      >;
      citation_entries: Table<
        CitationEntryRow,
        "check_id" | "position" | "raw_text"
      >;
      citation_findings: Table<
        CitationFindingRow,
        | "check_id"
        | "position"
        | "origin"
        | "kind"
        | "severity"
        | "message"
      >;
      grammar_suggestions: Table<
        GrammarSuggestionRow,
        | "check_id"
        | "position"
        | "start_offset"
        | "end_offset"
        | "category"
        | "original_text"
        | "suggested_text"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      get_entitlements: {
        // Always passed explicitly by the server; the SQL default exists for
        // manual use in the Supabase SQL editor.
        Args: { p_user_id: string };
        Returns: Json;
      };
      record_payment_event: {
        Args: {
          p_provider: string;
          p_event_id: string;
          p_type: string;
          p_payload?: Json;
        };
        Returns: boolean;
      };
      complete_payment_event: {
        Args: {
          p_provider: string;
          p_event_id: string;
          p_status: PaymentEventStatus;
          p_error?: string | null;
        };
        Returns: void;
      };
      apply_subscription_state: {
        Args: {
          p_user_id: string;
          p_plan_key: string;
          p_interval: BillingInterval;
          p_status: SubscriptionStatus;
          p_period_start: string | null;
          p_period_end: string | null;
          p_cancel_at_period_end?: boolean;
          p_provider?: string;
          p_customer_id?: string | null;
          p_subscription_id?: string | null;
        };
        Returns: string;
      };
      apply_credit_purchase: {
        Args: {
          p_user_id: string;
          p_pack_key: string;
          p_provider?: string;
          p_provider_reference?: string | null;
          p_amount_cents?: number | null;
        };
        Returns: Json;
      };
      record_invoice_payment: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_provider_reference: string;
          p_amount_cents: number;
          p_currency?: string;
          p_description?: string | null;
        };
        Returns: string | null;
      };
      consume_credits: {
        Args: {
          p_user_id: string;
          p_feature_key: string;
          p_credits: number;
          p_reason?: string | null;
          p_idempotency_key?: string | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_metadata?: Json;
        };
        Returns: Json;
      };
      grant_credits: {
        Args: {
          p_user_id: string;
          p_credits: number;
          p_type?: CreditTransactionType;
          p_reason?: string | null;
          p_idempotency_key?: string | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_metadata?: Json;
        };
        Returns: Json;
      };
      refund_credits: {
        Args: { p_user_id: string; p_transaction_id: string; p_reason?: string };
        Returns: Json;
      };
      log_feature_usage: {
        Args: {
          p_user_id: string;
          p_feature_key: string;
          p_status?: UsageStatus;
          p_credits?: number;
          p_words?: number;
          p_characters?: number;
          p_duration_ms?: number | null;
          p_provider?: string | null;
          p_model?: string | null;
          p_error_code?: string | null;
          p_error_message?: string | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_metadata?: Json;
        };
        Returns: string;
      };
      assign_plan: {
        Args: {
          p_user_id: string;
          p_plan_key: string;
          p_interval?: BillingInterval;
          p_status?: SubscriptionStatus;
          p_period_end?: string | null;
        };
        Returns: string;
      };
      provision_user: { Args: { p_user_id: string }; Returns: undefined };
      renew_credit_period: { Args: { p_user_id: string }; Returns: Json };
      is_admin: { Args: { p_user_id: string }; Returns: boolean };
      is_educator: { Args: { p_user_id: string }; Returns: boolean };
      has_role: { Args: { p_user_id: string; p_role: AppRole }; Returns: boolean };
    };
    Enums: {
      app_role: AppRole;
      user_type: UserType;
      subscription_status: SubscriptionStatus;
      billing_interval: BillingInterval;
      credit_transaction_type: CreditTransactionType;
      usage_status: UsageStatus;
      scan_source: ScanSource;
      detection_confidence: DetectionConfidence;
      suggestion_category: SuggestionCategory;
      suggestion_severity: SuggestionSeverity;
      suggestion_status: SuggestionStatus;
      naturalize_mode: NaturalizeModeValue;
    };
    CompositeTypes: Record<string, never>;
  };
};

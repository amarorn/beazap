export interface Team {
  id: number
  name: string
  description: string | null
  keywords: string | null
  instance_id: number
  active: boolean
  created_at: string
}

export interface TeamMetrics {
  team_id: number
  team_name: string
  instance_id: number
  total_conversations: number
  open_conversations: number
  resolved_conversations: number
  abandoned_conversations: number
  waiting_for_response: number
  conversations_today: number
  avg_first_response_seconds: number | null
  resolution_rate: number
  total_messages_received: number
}

export interface Instance {
  id: number
  name: string
  instance_name: string
  api_url: string
  phone_number: string | null
  active: boolean
  created_at: string
}

export interface Attendant {
  id: number
  name: string
  phone: string
  email: string | null
  role: 'manager' | 'agent'
  instance_id: number
  team_id: number | null
  active: boolean
  created_at: string
}

export interface GroupOverviewMetrics {
  total_groups: number
  groups_with_responsible: number
  groups_without_responsible: number
  groups_active_today: number
  messages_in_groups_today: number
}

export interface OverviewMetrics {
  total_conversations: number
  open_conversations: number
  resolved_conversations: number
  abandoned_conversations: number
  waiting_conversations: number
  in_progress_conversations: number
  avg_first_response_seconds: number | null
  resolution_rate: number
  total_messages_today: number
  total_conversations_today: number
}

export interface OverviewComparison {
  overview: OverviewMetrics
  change_conversations_today: number
  change_messages_today: number
  change_resolution_rate: number
}

export interface ExtendedMetrics {
  avg_resolution_time_seconds: number | null
  abandonment_rate: number
  sla_5min_rate: number
  sla_15min_rate: number
  sla_30min_rate: number
  conversations_no_response_1h: number
  conversations_no_response_4h: number
}

export interface DailyExtendedMetrics {
  date: string
  avg_resolution_seconds: number | null
  abandonment_rate: number
  sla_5min_rate: number
  sla_15min_rate: number
  sla_30min_rate: number
}

export interface HourlyVolume {
  hour: number
  count: number
  label: string
}

export interface DailySla {
  date: string
  avg_response_seconds: number | null
  count: number
}

export interface DailyStatus {
  date: string
  opened: number
  in_progress: number
  waiting: number
}

export interface AttendantMetrics {
  attendant_id: number
  attendant_name: string
  role: string
  total_conversations: number
  open_conversations: number
  resolved_conversations: number
  abandoned_conversations: number
  avg_first_response_seconds: number | null
  total_messages_sent: number
  total_messages_received: number
  resolution_rate: number
}

export interface DailyVolume {
  date: string
  inbound: number
  outbound: number
  conversations: number
}

export interface ConversationDetail {
  id: number
  contact_phone: string
  contact_name: string | null
  contact_avatar_url?: string | null
  attendant_name: string | null
  status: 'open' | 'resolved' | 'abandoned'
  opened_at: string
  resolved_at: string | null
  first_response_time_seconds: number | null
  inbound_count: number
  outbound_count: number
  // Equipe de triagem
  team_id?: number | null
  team_name?: string | null
  // Análise LLM
  analysis_category?: string | null
  analysis_sentiment?: string | null
  analysis_satisfaction?: number | null
  analysis_summary?: string | null
  analysis_analyzed_at?: string | null
  // Vínculos de grupo
  responsible_id?: number | null
  responsible_name?: string | null
  manager_id?: number | null
  manager_name?: string | null
  group_tags?: string[] | null
}

export interface CategoryCount {
  key: string
  label: string
  count: number
}

export interface AnalysisStats {
  total_analyzed: number
  avg_satisfaction: number | null
  categories: CategoryCount[]
  sentiments: Record<string, number>
}

export interface ConversationMessage {
  id: number
  direction: 'inbound' | 'outbound'
  msg_type: string
  content: string | null
  timestamp: string
  sender_phone?: string | null
  sender_name?: string | null
}

export interface SlaAlertEntry {
  id: number
  contact_name: string | null
  contact_phone: string
  attendant_name: string | null
  opened_at: string
  wait_seconds: number
}

export interface SlaAlertsResponse {
  alerts: SlaAlertEntry[]
  count: number
  threshold_minutes: number
}

export interface QuickReply {
  id: number
  title: string
  text: string
  active: boolean
  sort_order: number
  created_at: string
}

export interface ConversationNote {
  id: number
  author_name: string
  content: string
  created_at: string
}

export interface CallLogEntry {
  id: number
  conversation_id: number
  contact_phone: string
  contact_name: string | null
  direction: 'inbound' | 'outbound'
  content: string | null
  timestamp: string
  call_outcome: string | null
  call_duration_secs: number | null
  is_video_call: boolean | null
}

export interface AttendantSummary {
  attendant_id: number
  attendant_name: string
  role: string | null
  period_week: string
  total_conversations: number
  resolved_conversations: number
  abandoned_conversations: number
  resolution_rate: number
  avg_first_response_seconds: number | null
  avg_resolution_seconds: number | null
  total_messages_sent: number
  total_messages_received: number
  avg_satisfaction: number | null
  sla_5min_rate: number
  sla_15min_rate: number
  sla_30min_rate: number
  top_categories: Record<string, number>
  top_sentiments: Record<string, number>
  llm_summary: string | null
  generated_at: string | null
}

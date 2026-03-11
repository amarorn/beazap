import axios from 'axios'
import type {
  OverviewMetrics,
  OverviewComparison,
  ExtendedMetrics,
  DailyExtendedMetrics,
  AttendantMetrics,
  DailyVolume,
  DailySla,
  DailyStatus,
  HourlyVolume,
  ConversationDetail,
  ConversationMessage,
  Contact,
  CallLogEntry,
  AnalysisStats,
  GroupOverviewMetrics,
  SlaAlertsResponse,
  Instance,
  Attendant,
  Team,
  TeamMetrics,
  QuickReply,
  ConversationNote,
  AttendantSummary,
  DatabricksConfig,
  DatabricksJobRun,
  DatabricksValidation,
  EmergingTopicsResult,
  MetricAnomaliesResult,
  SentimentAnomaliesResult,
  ChurnPredictionResult,
} from '@/types'
import { getApiBaseUrl } from '@/lib/api-url'

const api = axios.create()

api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()
  return config
})

export const metricsApi = {
  getOverview: (instanceId?: number) =>
    api.get<OverviewMetrics>('/api/metrics/overview', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),

  getOverviewComparison: (days = 7, instanceId?: number) =>
    api.get<OverviewComparison>('/api/metrics/overview-comparison', {
      params: { days, ...(instanceId ? { instance_id: instanceId } : {}) },
    }).then(r => r.data),

  getExtendedMetrics: (instanceId?: number) =>
    api.get<ExtendedMetrics>('/api/metrics/extended', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),

  getDailyExtendedMetrics: (days = 7, instanceId?: number) =>
    api.get<DailyExtendedMetrics[]>('/api/metrics/extended/daily', {
      params: { days, ...(instanceId ? { instance_id: instanceId } : {}) },
    }).then(r => r.data),

  getHourlyVolume: (days = 7, instanceId?: number) =>
    api.get<HourlyVolume[]>('/api/metrics/hourly-volume', {
      params: { days, ...(instanceId ? { instance_id: instanceId } : {}) },
    }).then(r => r.data),

  getAttendants: (instanceId?: number) =>
    api.get<AttendantMetrics[]>('/api/metrics/attendants', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),

  getDailyVolume: (days = 7, instanceId?: number) =>
    api.get<DailyVolume[]>('/api/metrics/daily-volume', {
      params: { days, ...(instanceId ? { instance_id: instanceId } : {}) },
    }).then(r => r.data),

  getDailySla: (days = 7, instanceId?: number) =>
    api.get<DailySla[]>('/api/metrics/daily-sla', {
      params: { days, ...(instanceId ? { instance_id: instanceId } : {}) },
    }).then(r => r.data),

  getDailyStatus: (days = 7, instanceId?: number) =>
    api.get<DailyStatus[]>('/api/metrics/daily-status', {
      params: { days, ...(instanceId ? { instance_id: instanceId } : {}) },
    }).then(r => r.data),

  getConversations: (params?: {
    limit?: number
    instance_id?: number
    status?: string
    attendant_id?: number
  }) =>
    api.get<ConversationDetail[]>('/api/metrics/conversations', { params }).then(r => r.data),

  getConversation: (id: number) =>
    api.get<ConversationDetail>(`/api/metrics/conversations/${id}`).then(r => r.data),

  getMessages: (id: number) =>
    api.get<ConversationMessage[]>(`/api/metrics/conversations/${id}/messages`).then(r => r.data),

  resolveConversation: (id: number) =>
    api.post(`/api/metrics/conversations/${id}/resolve`).then(r => r.data),

  setConversationSendJid: (id: number, send_jid: string) =>
    api.patch(`/api/metrics/conversations/${id}/send-jid`, { send_jid }).then(r => r.data),

  getConversationContactStatus: (conversationId: number) =>
    api.get<{ saved: boolean; contact_id?: number }>(`/api/metrics/conversations/${conversationId}/contact-status`).then(r => r.data),

  saveContactFromConversation: (conversationId: number) =>
    api.post<{ contact_id: number; already_saved?: boolean }>(`/api/metrics/conversations/${conversationId}/save-contact`).then(r => r.data),

  getContacts: (params?: { instance_id?: number; limit?: number; offset?: number }) =>
    api.get<Contact[]>('/api/metrics/contacts', { params }).then(r => r.data),

  updateContact: (id: number, data: { contact_name?: string; contact_phone?: string; contact_send_jid?: string }) =>
    api.patch<Contact>(`/api/metrics/contacts/${id}`, data).then(r => r.data),

  deleteContact: (id: number) =>
    api.delete(`/api/metrics/contacts/${id}`).then(r => r.data),

  analyzeConversation: (id: number) =>
    api.post(`/api/metrics/conversations/${id}/analyze`).then(r => r.data),

  getAnalysisStats: (instanceId?: number) =>
    api.get<AnalysisStats>('/api/metrics/analysis-stats', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),

  updateGroupConfig: (id: number, data: { responsible_id?: number | null; manager_id?: number | null; group_tags?: string[] }) =>
    api.patch(`/api/metrics/groups/${id}/config`, data).then(r => r.data),

  syncGroupNames: (instanceId: number) =>
    api.post<{ updated: number; total_api?: number; error?: string }>('/api/metrics/groups/sync-names', null, {
      params: { instance_id: instanceId },
    }).then(r => r.data),

  getGroupOverview: (instanceId?: number) =>
    api.get<GroupOverviewMetrics>('/api/metrics/groups/overview', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),

  getGroups: (params?: { instance_id?: number; limit?: number; tag?: string }) =>
    api.get<ConversationDetail[]>('/api/metrics/groups', { params }).then(r => r.data),

  getGroupMessages: (id: number) =>
    api.get<ConversationMessage[]>(`/api/metrics/groups/${id}/messages`).then(r => r.data),

  getCalls: (params?: { instance_id?: number; limit?: number; direction?: string }) =>
    api.get<CallLogEntry[]>('/api/metrics/calls', { params }).then(r => r.data),

  getSlaAlerts: (params?: { instance_id?: number; threshold_minutes?: number }) =>
    api.get<SlaAlertsResponse>('/api/metrics/sla-alerts', { params }).then(r => r.data),

  assignConversation: (id: number, attendant_id: number | null) =>
    api.patch(`/api/metrics/conversations/${id}/assign`, { attendant_id }).then(r => r.data),

  sendMessage: (id: number, text: string) =>
    api.post<{ id: number; content: string; direction: string; timestamp: string }>(
      `/api/metrics/conversations/${id}/send`, { text }
    ).then(r => r.data),

  getNotes: (id: number) =>
    api.get<ConversationNote[]>(`/api/metrics/conversations/${id}/notes`).then(r => r.data),

  getContextSummaries: (conversationId: number) =>
    api.get<{ resolved_at: string | null; summary: string }[]>(`/api/metrics/conversations/${conversationId}/context-summaries`).then(r => r.data),

  getConversationSummaries: (params?: { days?: number; instance_id?: number }) =>
    api.get<import('@/types').ConversationSummaryItem[]>('/api/metrics/conversation-summaries', { params }).then(r => r.data),

  addNote: (id: number, content: string, author_name?: string) =>
    api.post<ConversationNote>(`/api/metrics/conversations/${id}/notes`, { content, author_name }).then(r => r.data),

  deleteNote: (conversationId: number, noteId: number) =>
    api.delete(`/api/metrics/conversations/${conversationId}/notes/${noteId}`).then(r => r.data),

  getTeamMetrics: (instanceId?: number) =>
    api.get<TeamMetrics[]>('/api/metrics/teams', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),

  getSuggestions: (conversationId: number, companyTone: string) =>
    api.get<{ suggestions: { text: string; tone_used: string; adaptation_reason: string }[] }>(
      `/api/metrics/conversations/${conversationId}/suggestions`,
      { params: { company_tone: companyTone } }
    ).then(r => r.data.suggestions),

  generateConversationFeedback: (conversationId: number) =>
    api
      .post<{
        conversa_id: string
        avaliacao_geral: {
          clareza_comunicacao: { nota: number; justificativa: string }
          empatia_tom_de_voz: { nota: number; justificativa: string }
          eficiencia_resolucao: { nota: number; justificativa: string }
          conhecimento_precisao: { nota: number; justificativa: string }
        }
        ponto_forte: { descricao: string; exemplo_conversa: string }
        area_melhoria: { descricao: string; exemplo_conversa: string }
        sugestao_acionavel: string
      }>(`/api/metrics/conversations/${conversationId}/feedback`)
      .then(r => r.data),
}

export const translationApi = {
  translateIncoming: (data: {
    texto_original: string
    idioma_destino?: string
    idioma_destino_iso?: string
    conversation_id?: number
  }) =>
    api
      .post<{ idioma_detectado: string; texto_traduzido: string | null }>(
        '/api/translation/incoming',
        data
      )
      .then(r => r.data),

  translateOutgoing: (data: {
    texto_original: string
    idioma_origem?: string
    idioma_destino: string
  }) =>
    api
      .post<{ texto_traduzido: string }>('/api/translation/outgoing', data)
      .then(r => r.data),

  getIdiomas: () =>
    api
      .get<{ idiomas: { codigo: string; nome: string }[] }>('/api/translation/idiomas')
      .then(r => r.data),
}

export const instancesApi = {
  list: () => api.get<Instance[]>('/api/instances').then(r => r.data),
  create: (data: { name: string; instance_name: string; api_url: string; api_key: string; phone_number?: string; owner_email?: string }) =>
    api.post<Instance & { qrcode?: string; api_error?: string; email_sent?: boolean | null }>('/api/instances', data).then(r => r.data),
  update: (id: number, data: { name?: string; api_url?: string; api_key?: string; phone_number?: string; owner_email?: string }) =>
    api.put<Instance & { api_error?: string; qrcode?: string | null }>(`/api/instances/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/instances/${id}`).then(r => r.data),
  checkStatus: (id: number) =>
    api.get<{ state: string; error?: string; api_url?: string; instance_name?: string }>(`/api/instances/${id}/status`).then(r => r.data),
  getQrCode: (id: number) =>
    api
      .get<{ qrcode: string | null; connected?: boolean }>(`/api/instances/${id}/qrcode`, {
        timeout: 120000,
      })
      .then(r => r.data),
  // Webhook is configured via open-wa env var, no API endpoint needed
  sendQrCodeEmail: (id: number, email?: string) =>
    api.post<{ status: string; email: string }>(`/api/instances/${id}/send-qrcode-email`, email ? { email } : {}).then(r => r.data),
  getAutoMessage: (id: number) =>
    api.get<{ enabled: boolean; text: string }>(`/api/instances/${id}/auto-message`).then(r => r.data),
  setAutoMessage: (id: number, data: { enabled: boolean; text: string }) =>
    api.put<{ enabled: boolean; text: string }>(`/api/instances/${id}/auto-message`, data).then(r => r.data),
}

export const attendantsApi = {
  list: (instanceId?: number) =>
    api.get<Attendant[]>('/api/attendants', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),
  create: (data: { name: string; phone: string; email?: string; role: string; instance_id: number; team_id?: number }) =>
    api.post<Attendant>('/api/attendants', data).then(r => r.data),
  update: (id: number, data: { name?: string; phone?: string; email?: string; role?: string; team_id?: number }) =>
    api.put<Attendant>(`/api/attendants/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/attendants/${id}`).then(r => r.data),
}

export const teamsApi = {
  list: (instanceId?: number) =>
    api.get<Team[]>('/api/teams', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),
  create: (data: { name: string; description?: string; keywords?: string; instance_id: number }) =>
    api.post<Team>('/api/teams', data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/teams/${id}`).then(r => r.data),
}

export const quickRepliesApi = {
  list: () => api.get<QuickReply[]>('/api/quick-replies').then(r => r.data),
  create: (data: { title: string; text: string; sort_order?: number }) =>
    api.post<QuickReply>('/api/quick-replies', data).then(r => r.data),
  update: (id: number, data: { title?: string; text?: string; sort_order?: number; active?: boolean }) =>
    api.put<QuickReply>(`/api/quick-replies/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/quick-replies/${id}`).then(r => r.data),
}

export const databricksApi = {
  getConfig: () =>
    api.get<DatabricksConfig | null>('/api/databricks/config').then(r => r.data),

  saveConfig: (data: {
    workspace_url: string
    api_token: string
    job_id: string
    trigger_keyword: string
    instance_id?: number | null
    param_catalog?: string
    param_schema_name?: string
    param_modo?: string
    param_output_path?: string
    client_code_regex?: string
    client_code_min_length?: number | null
    client_code_max_length?: number | null
    send_error_reply?: boolean
    reply_example?: string | null
  }) => api.post<DatabricksConfig>('/api/databricks/config', data).then(r => r.data),

  validate: (message: string) =>
    api.post<DatabricksValidation>('/api/databricks/validate', { message }).then(r => r.data),

  trigger: (message: string, phone?: string) =>
    api.post<DatabricksJobRun>('/api/databricks/trigger', { message, phone }).then(r => r.data),

  getRuns: (limit = 50) =>
    api.get<DatabricksJobRun[]>('/api/databricks/runs', { params: { limit } }).then(r => r.data),

  refreshRun: (runId: number) =>
    api.post<DatabricksJobRun>(`/api/databricks/runs/${runId}/refresh`).then(r => r.data),
}

export const reportsApi = {
  generate: (params: { instance_id: number; days?: number }) =>
    api.post<{ status: string; message: string }>('/api/reports/generate', params).then(r => r.data),
  getAttendantSummaries: (params?: { instance_id?: number; period_week?: string }) =>
    api.get<AttendantSummary[]>('/api/reports/attendant-summaries', { params }).then(r => r.data),
  debug: (instance_id?: number) =>
    api.get<Record<string, unknown>>('/api/reports/debug', { params: instance_id ? { instance_id } : {} }).then(r => r.data),
}

export const insightsApi = {
  getEmergingTopics: (params: { data_inicio: string; data_fim: string; instance_id?: number }) =>
    api.get<EmergingTopicsResult>('/api/metrics/trends/emerging-topics', { params }).then(r => r.data),

  getMetricAnomalies: (params: { data_inicio: string; data_fim: string; categoria: string; instance_id?: number }) =>
    api.get<MetricAnomaliesResult>('/api/metrics/trends/metric-anomalies', { params }).then(r => r.data),

  getSentimentAnomalies: (params: { data_inicio: string; data_fim: string; contexto: string; tipo: string; instance_id?: number }) =>
    api.get<SentimentAnomaliesResult>('/api/metrics/trends/sentiment-anomalies', { params }).then(r => r.data),

  predictChurn: (params: { numero_cliente: string; data_inicio: string; data_fim: string; instance_id?: number }) =>
    api.get<ChurnPredictionResult>('/api/metrics/churn/predict', { params }).then(r => r.data),
}

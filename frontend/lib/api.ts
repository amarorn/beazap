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
} from '@/types'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
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

  addNote: (id: number, content: string, author_name?: string) =>
    api.post<ConversationNote>(`/api/metrics/conversations/${id}/notes`, { content, author_name }).then(r => r.data),

  deleteNote: (conversationId: number, noteId: number) =>
    api.delete(`/api/metrics/conversations/${conversationId}/notes/${noteId}`).then(r => r.data),

  getTeamMetrics: (instanceId?: number) =>
    api.get<TeamMetrics[]>('/api/metrics/teams', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),
}

export const instancesApi = {
  list: () => api.get<Instance[]>('/api/instances').then(r => r.data),
  create: (data: { name: string; instance_name: string; api_url: string; api_key: string; phone_number?: string }) =>
    api.post<Instance>('/api/instances', data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/instances/${id}`).then(r => r.data),
  checkStatus: (id: number) =>
    api.get<{ state: string; error?: string; api_url?: string; instance_name?: string }>(`/api/instances/${id}/status`).then(r => r.data),
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

export const reportsApi = {
  generate: (params: { instance_id: number; days?: number }) =>
    api.post<{ status: string; message: string }>('/api/reports/generate', params).then(r => r.data),
  getAttendantSummaries: (params?: { instance_id?: number; period_week?: string }) =>
    api.get<AttendantSummary[]>('/api/reports/attendant-summaries', { params }).then(r => r.data),
  debug: (instance_id?: number) =>
    api.get<Record<string, unknown>>('/api/reports/debug', { params: instance_id ? { instance_id } : {} }).then(r => r.data),
}

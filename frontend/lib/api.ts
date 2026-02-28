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
}

export const instancesApi = {
  list: () => api.get<Instance[]>('/api/instances').then(r => r.data),
  create: (data: { name: string; instance_name: string; api_url: string; api_key: string; phone_number?: string }) =>
    api.post<Instance>('/api/instances', data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/instances/${id}`).then(r => r.data),
}

export const attendantsApi = {
  list: (instanceId?: number) =>
    api.get<Attendant[]>('/api/attendants', {
      params: instanceId ? { instance_id: instanceId } : {},
    }).then(r => r.data),
  create: (data: { name: string; phone: string; email?: string; role: string; instance_id: number }) =>
    api.post<Attendant>('/api/attendants', data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/attendants/${id}`).then(r => r.data),
}

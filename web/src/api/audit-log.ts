import { apiGet } from './client';
import type { ApiResult, AuditLogEntry } from './types';

export function listAuditLog(page = 1, perPage = 25): Promise<ApiResult<AuditLogEntry[]>> {
  return apiGet<AuditLogEntry[]>(`/audit-log?page=${page}&per_page=${perPage}`);
}

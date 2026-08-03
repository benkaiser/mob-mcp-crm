import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { ApiResult, Tag } from './types';

export type { Tag } from './types';

export function listTags(): Promise<ApiResult<Tag[]>> {
  return apiGet<Tag[]>('/tags');
}

export function createTag(body: { name: string }): Promise<ApiResult<Tag>> {
  return apiPost<Tag>('/tags', body);
}

export function updateTag(id: string, body: { name: string }): Promise<ApiResult<Tag>> {
  return apiPatch<Tag>(`/tags/${encodeURIComponent(id)}`, body);
}

export function deleteTag(id: string): Promise<ApiResult<{ id: string; deleted: true }>> {
  return apiDelete<{ id: string; deleted: true }>(`/tags/${encodeURIComponent(id)}`);
}

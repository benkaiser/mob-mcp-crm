import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ApiResult, ContactMethodTypeConfig, ContactMethodTypeOption } from './types';

export type { ContactMethodTypeConfig, ContactMethodTypeOption } from './types';

export function listContactMethodTypes(): Promise<ApiResult<ContactMethodTypeOption[]>> {
  return apiGet<ContactMethodTypeOption[]>('/contact-method-types');
}

export function listCustomContactMethodTypes(): Promise<ApiResult<ContactMethodTypeConfig[]>> {
  return apiGet<ContactMethodTypeConfig[]>('/contact-method-types/custom');
}

export function upsertContactMethodType(body: {
  key: string;
  label?: string;
  link_template?: string | null;
}): Promise<ApiResult<ContactMethodTypeConfig>> {
  return apiPost<ContactMethodTypeConfig>('/contact-method-types', body);
}

export function updateContactMethodType(
  key: string,
  body: { key?: string; label?: string; link_template?: string | null },
): Promise<ApiResult<ContactMethodTypeConfig>> {
  return apiPatch<ContactMethodTypeConfig>(`/contact-method-types/${encodeURIComponent(key)}`, body);
}

export function deleteContactMethodType(key: string): Promise<ApiResult<{ key: string; deleted: true }>> {
  return apiDelete<{ key: string; deleted: true }>(`/contact-method-types/${encodeURIComponent(key)}`);
}

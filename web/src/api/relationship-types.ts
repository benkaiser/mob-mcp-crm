import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ApiResult, CustomRelationshipType, RelationshipTypeOption } from './types';

export type { CustomRelationshipType, RelationshipTypeOption } from './types';

export function listRelationshipTypes(): Promise<ApiResult<RelationshipTypeOption[]>> {
  return apiGet<RelationshipTypeOption[]>('/relationship-types');
}

export function listCustomRelationshipTypes(): Promise<ApiResult<CustomRelationshipType[]>> {
  return apiGet<CustomRelationshipType[]>('/relationship-types/custom');
}

export function createCustomRelationshipType(body: {
  value: string;
  label?: string;
  inverse_value: string;
}): Promise<ApiResult<CustomRelationshipType>> {
  return apiPost<CustomRelationshipType>('/relationship-types/custom', body);
}

export function updateCustomRelationshipType(
  id: string,
  body: { value?: string; label?: string | null; inverse_value?: string },
): Promise<ApiResult<CustomRelationshipType>> {
  return apiPatch<CustomRelationshipType>(`/relationship-types/custom/${encodeURIComponent(id)}`, body);
}

export function deleteCustomRelationshipType(id: string): Promise<ApiResult<{ id: string; deleted: true }>> {
  return apiDelete<{ id: string; deleted: true }>(`/relationship-types/custom/${encodeURIComponent(id)}`);
}

import type { ContactMethodTypeOption } from '../api/types';

export const BUILT_IN_CONTACT_METHOD_TYPES: ContactMethodTypeOption[] = [
  { id: null, key: 'email', label: 'Email', link_template: 'mailto:{value}', default_link_template: 'mailto:{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'phone', label: 'Phone', link_template: 'tel:{value}', default_link_template: 'tel:{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'whatsapp', label: 'WhatsApp', link_template: 'https://wa.me/{value}', default_link_template: 'https://wa.me/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'telegram', label: 'Telegram', link_template: 'https://t.me/{value}', default_link_template: 'https://t.me/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'signal', label: 'Signal', link_template: 'https://signal.me/#p/{value}', default_link_template: 'https://signal.me/#p/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'twitter', label: 'Twitter / X', link_template: 'https://x.com/{value}', default_link_template: 'https://x.com/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'instagram', label: 'Instagram', link_template: 'https://instagram.com/{value}', default_link_template: 'https://instagram.com/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'facebook', label: 'Facebook Messenger', link_template: 'https://m.me/{value}', default_link_template: 'https://m.me/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'linkedin', label: 'LinkedIn', link_template: 'https://www.linkedin.com/in/{value}', default_link_template: 'https://www.linkedin.com/in/{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'website', label: 'Website', link_template: '{value}', default_link_template: '{value}', source: 'built-in', is_built_in: true },
  { id: null, key: 'other', label: 'Other', link_template: null, default_link_template: null, source: 'built-in', is_built_in: true },
];

const DANGEROUS_SCHEME = /^(?:javascript|data|vbscript):/i;
const SAFE_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeContactMethodTypeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function transformedValue(typeKey: string, value: string): string {
  const trimmed = value.trim();
  switch (typeKey) {
    case 'phone': return trimmed.replace(/\s+/g, '');
    case 'whatsapp': return trimmed.replace(/\D+/g, '');
    case 'telegram':
    case 'twitter':
    case 'instagram': return trimmed.replace(/^@+/, '');
    case 'website': return !trimmed ? '' : (SAFE_SCHEME.test(trimmed) || trimmed.startsWith('//') ? trimmed : `https://${trimmed}`);
    default: return trimmed;
  }
}

export function buildContactMethodLink(typeKey: string, value: string, template?: string | null): string | null {
  try {
    const key = normalizeContactMethodTypeKey(typeKey);
    const builtIn = BUILT_IN_CONTACT_METHOD_TYPES.find((t) => t.key === key);
    const resolved = template === undefined ? builtIn?.link_template ?? null : template;
    if (!resolved?.trim() || !resolved.includes('{value}')) return null;
    const transformed = transformedValue(key, value);
    if (!transformed) return null;
    const substitution = ['email', 'phone', 'website'].includes(key) ? transformed : encodeURIComponent(transformed);
    const link = resolved.replaceAll('{value}', substitution).trim();
    return link && !DANGEROUS_SCHEME.test(link) ? link : null;
  } catch {
    return null;
  }
}

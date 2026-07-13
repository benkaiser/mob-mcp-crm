import { showToast } from '../ui';
import { errorMessage } from './format';

/**
 * Fetch the full JSON export from `/web/api/export` and trigger a client-side
 * blob download saved as `mob-crm-export-<date>.json`. Shows a success/error
 * toast. Shared by the Data page and the Settings export section.
 *
 * @returns `true` if the download was triggered, `false` on failure.
 */
export async function downloadExport(): Promise<boolean> {
  try {
    const res = await fetch('/web/api/export', { credentials: 'include' });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const json = await res.text();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `mob-crm-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Export downloaded', 'success');
    return true;
  } catch (err) {
    showToast(errorMessage(err, 'Export failed'), 'error');
    return false;
  }
}

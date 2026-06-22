import { useState } from 'preact/hooks';
import { apiPost } from '../api/client';
import type { ImportPreview, ImportSummary, MonicaImportResult } from '../api/types';
import { Card, Button, Textarea, Tabs, Badge, ErrorBanner, ConfirmDialog, showToast } from '../ui';
import { errorMessage } from '../lib/format';

type Source = 'vcard' | 'google-csv' | 'monica';

export function ImportPage() {
  const [source, setSource] = useState<Source>('vcard');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [monicaResult, setMonicaResult] = useState<MonicaImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setText('');
    setPreview(null);
    setSummary(null);
    setMonicaResult(null);
    setError(null);
  }

  function switchSource(s: string) {
    setSource(s as Source);
    reset();
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setPreview(null);
    setSummary(null);
    setMonicaResult(null);
  }

  async function runPreview() {
    if (!text.trim()) return;
    setBusy(true); setError(null); setSummary(null);
    try {
      const { data } = await apiPost<ImportPreview>(`/import/preview/${source}`, { text });
      setPreview(data);
    } catch (err) {
      setError(errorMessage(err, 'Preview failed'));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const { data } = await apiPost<ImportSummary>(`/import/${source}`, { text });
      setSummary(data);
      setPreview(null);
      showToast(`Imported ${data.created} contact(s)`, 'success');
    } catch (err) {
      setError(errorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  }

  async function runMonicaImport() {
    setConfirmOpen(false);
    if (!text.trim()) return;
    setBusy(true); setError(null); setMonicaResult(null);
    try {
      const { data } = await apiPost<MonicaImportResult>('/import/monica', { text });
      setMonicaResult(data);
      showToast(`Imported ${data.contacts} contact(s) from Monica`, 'success');
    } catch (err) {
      setError(errorMessage(err, 'Monica import failed'));
    } finally {
      setBusy(false);
    }
  }

  const isMonica = source === 'monica';
  const accept = isMonica ? '.sql,.txt' : source === 'vcard' ? '.vcf,.vcard,text/vcard' : '.csv,text/csv';

  return (
    <div class="stack">
      <div class="page-header"><h1>Import contacts</h1></div>

      <Tabs
        tabs={[
          { id: 'vcard', label: 'vCard' },
          { id: 'google-csv', label: 'Google CSV' },
          { id: 'monica', label: 'Monica CRM' },
        ]}
        active={source}
        onChange={switchSource}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card class="stack">
        {isMonica ? (
          <>
            <p class="muted">
              Export your data from Monica CRM (Settings &rarr; Export) and upload the <code>.sql</code> file here.
            </p>
            <div class="warning-banner">
              <strong>Warning:</strong> Importing will <strong>replace all existing contacts and data</strong> in
              your account. This cannot be undone.
            </div>
          </>
        ) : (
          <p class="muted">
            {source === 'vcard'
              ? 'Paste vCard (.vcf) text or choose a file exported from your address book.'
              : 'Paste the CSV exported from Google Contacts, or choose the file.'}
          </p>
        )}
        <input type="file" accept={accept} onChange={onFile} data-testid="import-file" />
        <Textarea
          rows={10}
          value={text}
          data-testid="import-textarea"
          placeholder={isMonica ? '-- Monica SQL export…' : source === 'vcard' ? 'BEGIN:VCARD…' : 'Name,Given Name,…'}
          onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); setPreview(null); setSummary(null); setMonicaResult(null); }}
        />
        <div class="row">
          {isMonica ? (
            <Button variant="danger" data-testid="import-monica-replace" onClick={() => setConfirmOpen(true)} disabled={busy || !text.trim()}>
              {busy ? 'Working…' : 'Import & Replace Data'}
            </Button>
          ) : (
            <>
              <Button variant="secondary" data-testid="import-preview" onClick={runPreview} disabled={busy || !text.trim()}>
                {busy ? 'Working…' : 'Preview'}
              </Button>
              <Button data-testid="import-submit" onClick={runImport} disabled={busy || !text.trim()}>
                {busy ? 'Working…' : 'Import'}
              </Button>
            </>
          )}
        </div>
      </Card>

      {preview && (
        <Card class="section">
          <div class="section__head" data-testid="import-preview-result"><h2>Preview</h2><Badge tone="primary">{preview.count} record(s)</Badge></div>
          <p class="muted" data-testid="import-preview-count">{preview.count} contact(s) parsed and ready to import. Click Import to commit.</p>
        </Card>
      )}

      {summary && (
        <Card class="section" data-testid="import-result">
          <div class="section__head"><h2>Import result</h2></div>
          <div class="counts-row">
            <Res label="Created" num={summary.created} />
            <Res label="Skipped (duplicate)" num={summary.skipped_duplicate} />
            <Res label="Skipped (quota)" num={summary.skipped_quota} />
            <Res label="Methods" num={summary.per_entity.methods} />
            <Res label="Addresses" num={summary.per_entity.addresses} />
            <Res label="Notes" num={summary.per_entity.notes} />
            <Res label="Tags" num={summary.per_entity.tags} />
          </div>
          {summary.warnings.length > 0 && (
            <div style="margin-top:1rem;">
              <h3>Warnings ({summary.warnings.length})</h3>
              <ul>
                {summary.warnings.map((w, i) => <li key={i} class="muted">{w}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {monicaResult && (
        <Card class="section" data-testid="monica-result">
          <div class="section__head"><h2>Import result</h2></div>
          <div class="counts-row">
            <Res label="Contacts" num={monicaResult.contacts} />
            <Res label="Tags" num={monicaResult.tags} />
            <Res label="Contact methods" num={monicaResult.contactMethods} />
            <Res label="Notes" num={monicaResult.notes} />
            <Res label="Activities" num={monicaResult.activities} />
            <Res label="Relationships" num={monicaResult.relationships} />
            <Res label="Addresses" num={monicaResult.addresses} />
            <Res label="Life events" num={monicaResult.lifeEvents} />
            <Res label="Gifts" num={monicaResult.gifts} />
            <Res label="Reminders" num={monicaResult.reminders} />
            <Res label="Birthday reminders skipped" num={monicaResult.skipped_birthday_reminders} />
            <Res label="Calls" num={monicaResult.calls} />
          </div>
          {monicaResult.errors.length > 0 && (
            <div style="margin-top:1rem;">
              <h3>Warnings ({monicaResult.errors.length})</h3>
              <ul>
                {monicaResult.errors.map((w, i) => <li key={i} class="muted">{w}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Replace all data?"
        confirmLabel="Import & Replace"
        busy={busy}
        message="This will permanently delete all your existing contacts and data, then import from the Monica export. This cannot be undone."
        onConfirm={runMonicaImport}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Res({ label, num }: { label: string; num: number }) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return (
    <div class="count-tile" data-testid={`count-${slug}`}>
      <div class="count-tile__num" data-testid={`count-${slug}-num`}>{num}</div>
      <div class="count-tile__label">{label}</div>
    </div>
  );
}

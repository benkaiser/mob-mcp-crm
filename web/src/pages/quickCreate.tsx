import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { apiPost } from '../api/client';
import { Card, Button, Input, Select, Textarea, Field, ErrorBanner, showToast } from '../ui';
import { ContactPicker } from '../components/ContactPicker';
import { errorMessage, fieldErrors } from '../lib/format';

/**
 * Focused-creation pages for the timeline entities surfaced from the
 * sidebar + dashboard. Each page leads with the ContactPicker because the
 * common error path is forgetting which contact you meant; making picking
 * the first job avoids that footgun.
 *
 * - Notes: 1 contact (server model is per-contact).
 * - Activities: 1+ participants (multi-select; server stores via
 *   `participant_contact_ids`).
 * - Reminders: 1 contact.
 * - Tasks: 0 or 1 contact (optional — task can stand alone).
 * - Gifts / Debts: 1 contact.
 */

function useQueryParam(name: string): string | undefined {
  // wouter's hook gives the route path, not the query string, so read it
  // directly from window.location. Stable enough for initial-page reads.
  if (typeof window === 'undefined') return undefined;
  const p = new URLSearchParams(window.location.search);
  return p.get(name) ?? undefined;
}

function PageHeader({ title }: { title: string }) {
  return (
    <div class="page-header">
      <h1>{title}</h1>
      <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }}>← Back</a>
    </div>
  );
}

function useCreate() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  async function run<T>(fn: () => Promise<T>, onOk: (result: T) => void) {
    setSaving(true); setError(null); setErrs({});
    try {
      const result = await fn();
      onOk(result);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrs(fe);
      setError(errorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, errs, run, setError };
}

// ─── New note ───────────────────────────────────────────────────

export function NewNotePage() {
  const [, navigate] = useLocation();
  const initial = useQueryParam('contact_id');
  const [contactId, setContactId] = useState<string | null>(initial ?? null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const { saving, error, errs, run, setError } = useCreate();

  function submit(e: Event) {
    e.preventDefault();
    if (!contactId) { setError('Pick a contact'); return; }
    if (!body.trim()) { setError('Note body is required'); return; }
    const payload: Record<string, unknown> = { contact_id: contactId, body, is_pinned: pinned };
    if (title.trim()) payload.title = title.trim();
    run(
      () => apiPost<{ id: string }>('/notes', payload),
      (result) => {
        showToast('Note created', 'success');
        navigate(`/contacts/${contactId}`);
        void result;
      },
    );
  }

  return (
    <div class="stack" data-testid="page-new-note">
      <PageHeader title="New note" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit}>
        <Card class="stack">
          <ContactPicker mode="single" label="Who is this note about?" value={contactId} onChange={setContactId} />
          <Field label="Title (optional)">
            <Input data-testid="new-note-title" value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="Optional heading" />
          </Field>
          <Field label="Body" error={errs.body}>
            <Textarea data-testid="new-note-body" rows={8} value={body}
              onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} required />
          </Field>
          <label class="checkbox-row">
            <input type="checkbox" data-testid="new-note-pinned" checked={pinned}
              onChange={(e) => setPinned((e.target as HTMLInputElement).checked)} />
            <span>Pin to top of contact</span>
          </label>
          <div class="row">
            <Button type="submit" disabled={saving} data-testid="new-note-submit">
              {saving ? 'Saving…' : 'Create note'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

// ─── New activity ───────────────────────────────────────────��───

const ACTIVITY_TYPES = [
  'phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other',
] as const;
type ActivityKind = typeof ACTIVITY_TYPES[number];

function nowLocalDatetime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewActivityPage() {
  const [, navigate] = useLocation();
  const initial = useQueryParam('contact_id');
  const [participants, setParticipants] = useState<string[]>(initial ? [initial] : []);
  const [type, setType] = useState<ActivityKind>('in_person');
  const [occurredAt, setOccurredAt] = useState(nowLocalDatetime());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const { saving, error, errs, run, setError } = useCreate();

  function submit(e: Event) {
    e.preventDefault();
    if (participants.length === 0) { setError('Pick at least one participant'); return; }
    const payload: Record<string, unknown> = {
      type,
      occurred_at: occurredAt,
      participant_contact_ids: participants,
    };
    if (title.trim()) payload.title = title.trim();
    if (description.trim()) payload.description = description.trim();
    if (location.trim()) payload.location = location.trim();
    if (duration.trim()) {
      const n = Number(duration);
      if (!Number.isNaN(n)) payload.duration_minutes = n;
    }
    run(
      () => apiPost<{ id: string }>('/activities', payload),
      (result) => {
        showToast('Activity logged', 'success');
        // Single-participant: go back to the contact profile. Multi: timeline.
        if (participants.length === 1) navigate(`/contacts/${participants[0]}`);
        else navigate(`/activities/${result.data.id}`);
      },
    );
  }

  return (
    <div class="stack" data-testid="page-new-activity">
      <PageHeader title="Log activity" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit}>
        <Card class="stack">
          <ContactPicker mode="multi" label="Who was involved?" value={participants} onChange={setParticipants} />
          <div class="form-grid">
            <Field label="Type" error={errs.type}>
              <Select data-testid="new-activity-type" value={type}
                onChange={(e) => setType((e.target as HTMLSelectElement).value as ActivityKind)}>
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </Select>
            </Field>
            <Field label="When" error={errs.occurred_at}>
              <Input data-testid="new-activity-when" type="datetime-local" value={occurredAt}
                onInput={(e) => setOccurredAt((e.target as HTMLInputElement).value)} required />
            </Field>
          </div>
          <Field label="Title (optional)">
            <Input data-testid="new-activity-title" value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="e.g. Coffee at Blue Bottle" />
          </Field>
          <div class="form-grid">
            <Field label="Duration (minutes)">
              <Input data-testid="new-activity-duration" type="number" min={0} value={duration}
                onInput={(e) => setDuration((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Location">
              <Input data-testid="new-activity-location" value={location}
                onInput={(e) => setLocation((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea data-testid="new-activity-description" value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="row">
            <Button type="submit" disabled={saving} data-testid="new-activity-submit">
              {saving ? 'Saving…' : 'Log activity'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

// ─── New reminder ─────────────────────────���─────────────────────

const REMINDER_FREQUENCIES = ['one_time', 'weekly', 'monthly', 'yearly'] as const;
type ReminderFreq = typeof REMINDER_FREQUENCIES[number];

export function NewReminderPage() {
  const [, navigate] = useLocation();
  const initial = useQueryParam('contact_id');
  const [contactId, setContactId] = useState<string | null>(initial ?? null);
  const [title, setTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<ReminderFreq>('one_time');
  const { saving, error, errs, run, setError } = useCreate();

  function submit(e: Event) {
    e.preventDefault();
    if (!contactId) { setError('Pick a contact'); return; }
    if (!title.trim()) { setError('Title is required'); return; }
    if (!reminderDate) { setError('Date is required'); return; }
    const payload: Record<string, unknown> = {
      contact_id: contactId, title, reminder_date: reminderDate, frequency,
    };
    if (description.trim()) payload.description = description.trim();
    run(
      () => apiPost<{ id: string }>('/reminders', payload),
      () => {
        showToast('Reminder created', 'success');
        navigate(`/contacts/${contactId}`);
      },
    );
  }

  return (
    <div class="stack" data-testid="page-new-reminder">
      <PageHeader title="New reminder" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit}>
        <Card class="stack">
          <ContactPicker mode="single" label="Remind about whom?" value={contactId} onChange={setContactId} />
          <Field label="Title" error={errs.title}>
            <Input data-testid="new-reminder-title" value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
          </Field>
          <div class="form-grid">
            <Field label="When" error={errs.reminder_date}>
              <Input data-testid="new-reminder-when" type="date" value={reminderDate}
                onInput={(e) => setReminderDate((e.target as HTMLInputElement).value)} required />
            </Field>
            <Field label="Frequency">
              <Select data-testid="new-reminder-frequency" value={frequency}
                onChange={(e) => setFrequency((e.target as HTMLSelectElement).value as ReminderFreq)}>
                {REMINDER_FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea data-testid="new-reminder-description" value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="row">
            <Button type="submit" disabled={saving} data-testid="new-reminder-submit">
              {saving ? 'Saving…' : 'Create reminder'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

// ─── New task ──────────────────────────���────────────────────────

const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
type TaskPriority = typeof TASK_PRIORITIES[number];

export function NewTaskPage() {
  const [, navigate] = useLocation();
  const initial = useQueryParam('contact_id');
  // Tasks can stand alone — contact selection is optional.
  const [contactId, setContactId] = useState<string | null>(initial ?? null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [description, setDescription] = useState('');
  const { saving, error, errs, run, setError } = useCreate();

  function submit(e: Event) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    const payload: Record<string, unknown> = { title, priority };
    if (contactId) payload.contact_id = contactId;
    if (description.trim()) payload.description = description.trim();
    if (dueDate) payload.due_date = dueDate;
    run(
      () => apiPost<{ id: string }>('/tasks', payload),
      (result) => {
        showToast('Task created', 'success');
        if (contactId) navigate(`/contacts/${contactId}`);
        else navigate(`/tasks/${result.data.id}`);
      },
    );
  }

  return (
    <div class="stack" data-testid="page-new-task">
      <PageHeader title="New task" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit}>
        <Card class="stack">
          <ContactPicker mode="single" label="Link to a contact? (optional)" value={contactId} onChange={setContactId} />
          <Field label="Title" error={errs.title}>
            <Input data-testid="new-task-title" value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
          </Field>
          <div class="form-grid">
            <Field label="Due date">
              <Input data-testid="new-task-due" type="date" value={dueDate}
                onInput={(e) => setDueDate((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Priority">
              <Select data-testid="new-task-priority" value={priority}
                onChange={(e) => setPriority((e.target as HTMLSelectElement).value as TaskPriority)}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea data-testid="new-task-description" value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="row">
            <Button type="submit" disabled={saving} data-testid="new-task-submit">
              {saving ? 'Saving…' : 'Create task'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

// ─── New gift ────────────────────────────────────────────────────

const GIFT_STATUSES = ['idea', 'planned', 'purchased', 'given', 'received'] as const;
const GIFT_DIRECTIONS = ['giving', 'receiving'] as const;
type GiftStatus = typeof GIFT_STATUSES[number];
type GiftDirection = typeof GIFT_DIRECTIONS[number];

export function NewGiftPage() {
  const [, navigate] = useLocation();
  const initial = useQueryParam('contact_id');
  const [contactId, setContactId] = useState<string | null>(initial ?? null);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<GiftDirection>('giving');
  const [status, setStatus] = useState<GiftStatus>('idea');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [occasion, setOccasion] = useState('');
  const [date, setDate] = useState('');
  const { saving, error, errs, run, setError } = useCreate();

  function submit(e: Event) {
    e.preventDefault();
    if (!contactId) { setError('Pick a contact'); return; }
    if (!name.trim()) { setError('Gift name is required'); return; }
    const payload: Record<string, unknown> = { contact_id: contactId, name, direction, status };
    if (description.trim()) payload.description = description.trim();
    if (url.trim()) payload.url = url.trim();
    if (occasion.trim()) payload.occasion = occasion.trim();
    if (currency.trim()) payload.currency = currency.trim();
    if (date) payload.date = date;
    if (cost.trim()) {
      const n = Number(cost);
      if (Number.isNaN(n)) { setError('Estimated cost must be a number'); return; }
      payload.estimated_cost = n;
    }
    run(
      () => apiPost<{ id: string }>('/gifts', payload),
      (result) => {
        showToast('Gift created', 'success');
        navigate(`/gifts/${result.data.id}`);
      },
    );
  }

  return (
    <div class="stack" data-testid="page-new-gift">
      <PageHeader title="New gift" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit}>
        <Card class="stack">
          <ContactPicker mode="single" label="Who is this gift for/from?" value={contactId} onChange={setContactId} />
          <Field label="Name" error={errs.name}>
            <Input data-testid="new-gift-name" value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)} required />
          </Field>
          <div class="form-grid">
            <Field label="Direction">
              <Select data-testid="new-gift-direction" value={direction}
                onChange={(e) => setDirection((e.target as HTMLSelectElement).value as GiftDirection)}>
                {GIFT_DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select data-testid="new-gift-status" value={status}
                onChange={(e) => setStatus((e.target as HTMLSelectElement).value as GiftStatus)}>
                {GIFT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Estimated cost">
              <Input data-testid="new-gift-cost" type="number" min={0} step="0.01" value={cost}
                onInput={(e) => setCost((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Currency">
              <Input data-testid="new-gift-currency" value={currency}
                onInput={(e) => setCurrency((e.target as HTMLInputElement).value)} placeholder="USD" />
            </Field>
            <Field label="Occasion">
              <Input data-testid="new-gift-occasion" value={occasion}
                onInput={(e) => setOccasion((e.target as HTMLInputElement).value)} placeholder="birthday, holiday…" />
            </Field>
            <Field label="Date">
              <Input data-testid="new-gift-date" type="date" value={date}
                onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="URL">
            <Input data-testid="new-gift-url" type="url" value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)} placeholder="https://…" />
          </Field>
          <Field label="Description">
            <Textarea data-testid="new-gift-description" value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="row">
            <Button type="submit" disabled={saving} data-testid="new-gift-submit">
              {saving ? 'Saving…' : 'Create gift'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

// ─── New debt ────────────────────────────────────────────────────

const DEBT_DIRECTIONS = ['i_owe_them', 'they_owe_me'] as const;
type DebtDirection = typeof DEBT_DIRECTIONS[number];

export function NewDebtPage() {
  const [, navigate] = useLocation();
  const initial = useQueryParam('contact_id');
  const [contactId, setContactId] = useState<string | null>(initial ?? null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [direction, setDirection] = useState<DebtDirection>('they_owe_me');
  const [reason, setReason] = useState('');
  const [incurredAt, setIncurredAt] = useState('');
  const { saving, error, errs, run, setError } = useCreate();

  function submit(e: Event) {
    e.preventDefault();
    if (!contactId) { setError('Pick a contact'); return; }
    const n = Number(amount);
    if (!amount.trim() || Number.isNaN(n)) { setError('Amount must be a number'); return; }
    const payload: Record<string, unknown> = { contact_id: contactId, amount: n, direction };
    if (currency.trim()) payload.currency = currency.trim();
    if (reason.trim()) payload.reason = reason.trim();
    if (incurredAt) payload.incurred_at = incurredAt;
    run(
      () => apiPost<{ id: string }>('/debts', payload),
      (result) => {
        showToast('Debt created', 'success');
        navigate(`/debts/${result.data.id}`);
      },
    );
  }

  return (
    <div class="stack" data-testid="page-new-debt">
      <PageHeader title="New debt" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit}>
        <Card class="stack">
          <ContactPicker mode="single" label="Who is this debt with?" value={contactId} onChange={setContactId} />
          <div class="form-grid">
            <Field label="Direction">
              <Select data-testid="new-debt-direction" value={direction}
                onChange={(e) => setDirection((e.target as HTMLSelectElement).value as DebtDirection)}>
                {DEBT_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>{d === 'they_owe_me' ? 'They owe me' : 'I owe them'}</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" error={errs.amount}>
              <Input data-testid="new-debt-amount" type="number" min={0} step="0.01" value={amount}
                onInput={(e) => setAmount((e.target as HTMLInputElement).value)} required />
            </Field>
            <Field label="Currency">
              <Input data-testid="new-debt-currency" value={currency}
                onInput={(e) => setCurrency((e.target as HTMLInputElement).value)} placeholder="USD" />
            </Field>
            <Field label="Incurred">
              <Input data-testid="new-debt-incurred" type="date" value={incurredAt}
                onInput={(e) => setIncurredAt((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="Reason">
            <Input data-testid="new-debt-reason" value={reason}
              onInput={(e) => setReason((e.target as HTMLInputElement).value)} placeholder="What's this for?" />
          </Field>
          <div class="row">
            <Button type="submit" disabled={saving} data-testid="new-debt-submit">
              {saving ? 'Saving…' : 'Create debt'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

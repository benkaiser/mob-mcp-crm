import { useState } from 'preact/hooks';
import { apiPost, apiPatch } from '../../api/client';
import type {
  ContactMethod, Address, CustomField, Relationship, FoodPreferences, ContactMethodType,
  Note, Activity, LifeEvent, Reminder, Task, Gift, Debt,
} from '../../api/types';
import { Modal, Button, Input, Select, Textarea, Field, showToast } from '../../ui';
import { errorMessage, fieldErrors } from '../../lib/format';

const METHOD_TYPES: ContactMethodType[] = [
  'email', 'phone', 'whatsapp', 'telegram', 'signal',
  'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other',
];

interface EditorProps<T> {
  contactId: string;
  existing?: T | null;
  onClose: () => void;
  onSaved: () => void;
}

function useSave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<unknown>, onOk: () => void) {
    setSaving(true); setError(null); setErrs({});
    try {
      await fn();
      onOk();
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

// ─── Contact method editor ──────────────────────────────────────

export function MethodEditor({ contactId, existing, onClose, onSaved }: EditorProps<ContactMethod>) {
  const [type, setType] = useState<ContactMethodType>(existing?.type ?? 'email');
  const [value, setValue] = useState(existing?.value ?? '');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [isPrimary, setIsPrimary] = useState(existing?.is_primary ?? false);
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = { type, value, is_primary: isPrimary };
    if (label.trim()) body.label = label.trim();
    run(
      () => existing
        ? apiPatch(`/contacts/${contactId}/methods/${existing.id}`, body)
        : apiPost(`/contacts/${contactId}/methods`, body),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit contact method' : 'Add contact method'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="method-form" />}>
      <form id="method-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Type">
          <Select data-testid="method-type" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as ContactMethodType)}>
            {METHOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Value" error={errs.value}>
          <Input data-testid="method-value" value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} required />
        </Field>
        <Field label="Label (optional)">
          <Input data-testid="method-label" value={label} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} placeholder="work, home…" />
        </Field>
        <label class="checkbox-row">
          <input data-testid="method-primary" type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary((e.target as HTMLInputElement).checked)} />
          <span>Primary</span>
        </label>
      </form>
    </Modal>
  );
}

// ─── Address editor ─────────────────────────────────────────────

export function AddressEditor({ contactId, existing, onClose, onSaved }: EditorProps<Address>) {
  const [f, setF] = useState({
    label: existing?.label ?? '',
    street_line_1: existing?.street_line_1 ?? '',
    street_line_2: existing?.street_line_2 ?? '',
    city: existing?.city ?? '',
    state_province: existing?.state_province ?? '',
    postal_code: existing?.postal_code ?? '',
    country: existing?.country ?? '',
    is_primary: existing?.is_primary ?? false,
  });
  const { saving, error, run } = useSave();
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  function submit(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = { is_primary: f.is_primary };
    (['label', 'street_line_1', 'street_line_2', 'city', 'state_province', 'postal_code', 'country'] as const)
      .forEach((k) => { if (f[k].toString().trim()) body[k] = f[k]; });
    run(
      () => existing
        ? apiPatch(`/contacts/${contactId}/addresses/${existing.id}`, body)
        : apiPost(`/contacts/${contactId}/addresses`, body),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit address' : 'Add address'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="address-form" />}>
      <form id="address-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Label"><Input data-testid="address-label" value={f.label} onInput={(e) => set('label', (e.target as HTMLInputElement).value)} placeholder="home, work…" /></Field>
        <Field label="Street line 1"><Input data-testid="address-street1" value={f.street_line_1} onInput={(e) => set('street_line_1', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="Street line 2"><Input data-testid="address-street2" value={f.street_line_2} onInput={(e) => set('street_line_2', (e.target as HTMLInputElement).value)} /></Field>
        <div class="form-grid">
          <Field label="City"><Input data-testid="address-city" value={f.city} onInput={(e) => set('city', (e.target as HTMLInputElement).value)} /></Field>
          <Field label="State / province"><Input data-testid="address-state" value={f.state_province} onInput={(e) => set('state_province', (e.target as HTMLInputElement).value)} /></Field>
          <Field label="Postal code"><Input data-testid="address-postal" value={f.postal_code} onInput={(e) => set('postal_code', (e.target as HTMLInputElement).value)} /></Field>
          <Field label="Country"><Input data-testid="address-country" value={f.country} onInput={(e) => set('country', (e.target as HTMLInputElement).value)} /></Field>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" checked={f.is_primary} onChange={(e) => set('is_primary', (e.target as HTMLInputElement).checked)} />
          <span>Primary</span>
        </label>
      </form>
    </Modal>
  );
}

// ─── Custom field editor ────────────────────────────────────────

export function CustomFieldEditor({ contactId, existing, onClose, onSaved }: EditorProps<CustomField>) {
  const [name, setName] = useState(existing?.field_name ?? '');
  const [value, setValue] = useState(existing?.field_value ?? '');
  const [group, setGroup] = useState(existing?.field_group ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = { field_name: name, field_value: value };
    if (group.trim()) body.field_group = group.trim();
    run(
      () => existing
        ? apiPatch(`/contacts/${contactId}/custom-fields/${existing.id}`, body)
        : apiPost(`/contacts/${contactId}/custom-fields`, body),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit custom field' : 'Add custom field'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="cf-form" />}>
      <form id="cf-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Field name" error={errs.field_name}><Input data-testid="cf-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required /></Field>
        <Field label="Value" error={errs.field_value}><Input data-testid="cf-value" value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Group (optional)"><Input data-testid="cf-group" value={group} onInput={(e) => setGroup((e.target as HTMLInputElement).value)} /></Field>
      </form>
    </Modal>
  );
}

// ─── Relationship editor ────────────────────────────────────────

export function RelationshipEditor(
  { contactId, existing, onClose, onSaved, contactOptions }:
  EditorProps<Relationship> & { contactOptions: { id: string; name: string }[] },
) {
  const [related, setRelated] = useState(existing?.related_contact_id ?? '');
  const [type, setType] = useState(existing?.relationship_type ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = { relationship_type: type };
    if (notes.trim()) body.notes = notes.trim();
    if (!existing) body.related_contact_id = related;
    run(
      () => existing
        ? apiPatch(`/contacts/${contactId}/relationships/${existing.id}`, body)
        : apiPost(`/contacts/${contactId}/relationships`, body),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit relationship' : 'Add relationship'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="rel-form" />}>
      <form id="rel-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        {!existing && (
          <Field label="Related contact" error={errs.related_contact_id}>
            <Select data-testid="rel-contact" value={related} onChange={(e) => setRelated((e.target as HTMLSelectElement).value)} required>
              <option value="">Select a contact…</option>
              {contactOptions.filter((c) => c.id !== contactId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Relationship type" error={errs.relationship_type} hint="e.g. spouse, sibling, colleague">
          <Input data-testid="rel-type" value={type} onInput={(e) => setType((e.target as HTMLInputElement).value)} required />
        </Field>
        <Field label="Notes (optional)">
          <Textarea data-testid="rel-notes" value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Food preferences editor (upsert) ───────────────────────────

export function FoodPreferencesEditor(
  { contactId, existing, onClose, onSaved }: EditorProps<FoodPreferences>,
) {
  const join = (a?: string[]) => (a ?? []).join(', ');
  const [restrictions, setRestrictions] = useState(join(existing?.dietary_restrictions));
  const [allergies, setAllergies] = useState(join(existing?.allergies));
  const [favorites, setFavorites] = useState(join(existing?.favorite_foods));
  const [disliked, setDisliked] = useState(join(existing?.disliked_foods));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const { saving, error, run } = useSave();

  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  function submit(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      dietary_restrictions: split(restrictions),
      allergies: split(allergies),
      favorite_foods: split(favorites),
      disliked_foods: split(disliked),
    };
    if (notes.trim()) body.notes = notes.trim();
    run(
      () => apiPatch(`/contacts/${contactId}/food-preferences`, body),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title="Food preferences" onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="food-form" />}>
      <form id="food-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Dietary restrictions" hint="Comma-separated"><Input data-testid="food-dietary" value={restrictions} onInput={(e) => setRestrictions((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Allergies" hint="Comma-separated"><Input data-testid="food-allergies" value={allergies} onInput={(e) => setAllergies((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Favorite foods" hint="Comma-separated"><Input data-testid="food-favorites" value={favorites} onInput={(e) => setFavorites((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Disliked foods" hint="Comma-separated"><Input data-testid="food-disliked" value={disliked} onInput={(e) => setDisliked((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Notes"><Textarea data-testid="food-notes" value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} /></Field>
      </form>
    </Modal>
  );
}

// ─── Tag editor ─────────────────────────────────────────────────

export function TagEditor({ contactId, onClose, onSaved }: EditorProps<never>) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = { name };
    if (color.trim()) body.color = color.trim();
    run(
      () => apiPost(`/contacts/${contactId}/tags`, body),
      () => { showToast('Tag added', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title="Add tag" onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="tag-form" />}>
      <form id="tag-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Tag name" error={errs.name}><Input data-testid="tag-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required /></Field>
        <Field label="Color (optional)"><Input data-testid="tag-color" type="color" value={color || '#2563eb'} onInput={(e) => setColor((e.target as HTMLInputElement).value)} /></Field>
      </form>
    </Modal>
  );
}

function EditorFooter({ saving, onClose, form }: { saving: boolean; onClose: () => void; form: string }) {
  return (
    <>
      <Button variant="secondary" type="button" onClick={onClose} disabled={saving} data-testid="editor-cancel">Cancel</Button>
      <Button type="submit" form={form} disabled={saving} data-testid="editor-save">{saving ? 'Saving…' : 'Save'}</Button>
    </>
  );
}

// ─── Note editor ────────────────────────────────────────────────
// Wraps POST /web/api/notes (create) and PATCH /notes/:id (edit). Notes are
// 1-contact per record — `contact_id` is taken from the profile we're viewing.

export function NoteEditor({ contactId, existing, onClose, onSaved }: EditorProps<Note>) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [pinned, setPinned] = useState(existing?.is_pinned ?? false);
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const payload: Record<string, unknown> = { body, is_pinned: pinned };
    if (title.trim()) payload.title = title.trim();
    if (!existing) payload.contact_id = contactId;
    run(
      () => existing
        ? apiPatch(`/notes/${existing.id}`, payload)
        : apiPost('/notes', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit note' : 'Add note'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="note-form" />}>
      <form id="note-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Title (optional)">
          <Input data-testid="note-title" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="Optional heading" />
        </Field>
        <Field label="Body" error={errs.body}>
          <Textarea data-testid="note-body" rows={6} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} required />
        </Field>
        <label class="checkbox-row">
          <input data-testid="note-pinned" type="checkbox" checked={pinned} onChange={(e) => setPinned((e.target as HTMLInputElement).checked)} />
          <span>Pin to top</span>
        </label>
      </form>
    </Modal>
  );
}

// ─── Activity editor ────────────────────────────────────────────
// Activities natively support multiple participants. From the profile we
// always include the current contact; multi-participant authoring lives in
// the dedicated /activities/new page.

const ACTIVITY_TYPES = [
  'phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other',
] as const;
type ActivityKind = typeof ACTIVITY_TYPES[number];

function nowLocalDatetime(): string {
  // Default occurred_at to "now" formatted for <input type="datetime-local">.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityEditor({ contactId, existing, onClose, onSaved }: EditorProps<Activity>) {
  const [type, setType] = useState<ActivityKind>((existing?.type as ActivityKind) ?? 'in_person');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [occurredAt, setOccurredAt] = useState(
    existing?.occurred_at ? existing.occurred_at.slice(0, 16) : nowLocalDatetime(),
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [duration, setDuration] = useState(existing?.duration_minutes != null ? String(existing.duration_minutes) : '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      type,
      occurred_at: occurredAt,
      participant_contact_ids: [contactId],
    };
    if (title.trim()) payload.title = title.trim();
    if (description.trim()) payload.description = description.trim();
    if (location.trim()) payload.location = location.trim();
    if (duration.trim()) {
      const n = Number(duration);
      if (!Number.isNaN(n)) payload.duration_minutes = n;
    }
    run(
      () => existing
        ? apiPatch(`/activities/${existing.id}`, payload)
        : apiPost('/activities', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit activity' : 'Log activity'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="activity-form" />}>
      <form id="activity-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <div class="form-grid">
          <Field label="Type" error={errs.type}>
            <Select data-testid="activity-type" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as ActivityKind)}>
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="When" error={errs.occurred_at}>
            <Input data-testid="activity-when" type="datetime-local" value={occurredAt}
              onInput={(e) => setOccurredAt((e.target as HTMLInputElement).value)} required />
          </Field>
        </div>
        <Field label="Title (optional)">
          <Input data-testid="activity-title" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="e.g. Coffee at Blue Bottle" />
        </Field>
        <div class="form-grid">
          <Field label="Duration (minutes)">
            <Input data-testid="activity-duration" type="number" min={0} value={duration}
              onInput={(e) => setDuration((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Location">
            <Input data-testid="activity-location" value={location} onInput={(e) => setLocation((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea data-testid="activity-description" value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Life event editor ──────────────────────────────────────────

const LIFE_EVENT_TYPES = [
  'birth', 'death', 'marriage', 'divorce', 'graduation', 'new_job', 'promotion',
  'move', 'travel', 'milestone', 'health', 'other',
];

export function LifeEventEditor({ contactId, existing, onClose, onSaved }: EditorProps<LifeEvent>) {
  const [eventType, setEventType] = useState(existing?.event_type ?? 'milestone');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [occurredAt, setOccurredAt] = useState(existing?.occurred_at?.slice(0, 10) ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const payload: Record<string, unknown> = { event_type: eventType, title };
    if (description.trim()) payload.description = description.trim();
    if (occurredAt) payload.occurred_at = occurredAt;
    if (!existing) payload.contact_id = contactId;
    run(
      () => existing
        ? apiPatch(`/life-events/${existing.id}`, payload)
        : apiPost('/life-events', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit life event' : 'Add life event'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="le-form" />}>
      <form id="le-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <div class="form-grid">
          <Field label="Event type" error={errs.event_type}>
            <Select data-testid="le-type" value={eventType} onChange={(e) => setEventType((e.target as HTMLSelectElement).value)}>
              {LIFE_EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="When">
            <Input data-testid="le-when" type="date" value={occurredAt}
              onInput={(e) => setOccurredAt((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <Field label="Title" error={errs.title}>
          <Input data-testid="le-title" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
        </Field>
        <Field label="Description">
          <Textarea data-testid="le-description" value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Reminder editor ────────────────────────────────────────────

const REMINDER_FREQUENCIES = ['one_time', 'weekly', 'monthly', 'yearly'] as const;

export function ReminderEditor({ contactId, existing, onClose, onSaved }: EditorProps<Reminder>) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [reminderDate, setReminderDate] = useState(existing?.reminder_date?.slice(0, 10) ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [frequency, setFrequency] = useState<typeof REMINDER_FREQUENCIES[number]>(
    (existing?.frequency as typeof REMINDER_FREQUENCIES[number]) ?? 'one_time',
  );
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const payload: Record<string, unknown> = { title, reminder_date: reminderDate, frequency };
    if (description.trim()) payload.description = description.trim();
    if (!existing) payload.contact_id = contactId;
    run(
      () => existing
        ? apiPatch(`/reminders/${existing.id}`, payload)
        : apiPost('/reminders', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit reminder' : 'Add reminder'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="reminder-form" />}>
      <form id="reminder-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Title" error={errs.title}>
          <Input data-testid="reminder-title" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
        </Field>
        <div class="form-grid">
          <Field label="When" error={errs.reminder_date}>
            <Input data-testid="reminder-when" type="date" value={reminderDate}
              onInput={(e) => setReminderDate((e.target as HTMLInputElement).value)} required />
          </Field>
          <Field label="Frequency">
            <Select data-testid="reminder-frequency" value={frequency}
              onChange={(e) => setFrequency((e.target as HTMLSelectElement).value as typeof REMINDER_FREQUENCIES[number])}>
              {REMINDER_FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea data-testid="reminder-description" value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Task editor ────────────────────────────────────────────────
// Tasks can optionally be unattached to a contact. From the profile we always
// link to the current contact; the global /tasks/new page makes the link
// optional.

const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export function TaskEditor({ contactId, existing, onClose, onSaved }: EditorProps<Task>) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [dueDate, setDueDate] = useState(existing?.due_date?.slice(0, 10) ?? '');
  const [priority, setPriority] = useState<typeof TASK_PRIORITIES[number]>(
    (existing?.priority as typeof TASK_PRIORITIES[number]) ?? 'medium',
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const payload: Record<string, unknown> = { title, priority };
    if (description.trim()) payload.description = description.trim();
    if (dueDate) payload.due_date = dueDate;
    if (!existing) payload.contact_id = contactId;
    run(
      () => existing
        ? apiPatch(`/tasks/${existing.id}`, payload)
        : apiPost('/tasks', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit task' : 'Add task'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="task-form" />}>
      <form id="task-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Title" error={errs.title}>
          <Input data-testid="task-title" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
        </Field>
        <div class="form-grid">
          <Field label="Due date">
            <Input data-testid="task-due" type="date" value={dueDate}
              onInput={(e) => setDueDate((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Priority">
            <Select data-testid="task-priority" value={priority}
              onChange={(e) => setPriority((e.target as HTMLSelectElement).value as typeof TASK_PRIORITIES[number])}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea data-testid="task-description" value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Gift editor ────────────────────────────────────────────────

const GIFT_STATUSES = ['idea', 'planned', 'purchased', 'given', 'received'] as const;
const GIFT_DIRECTIONS = ['giving', 'receiving'] as const;

export function GiftEditor({ contactId, existing, onClose, onSaved }: EditorProps<Gift>) {
  const [name, setName] = useState(existing?.name ?? '');
  const [direction, setDirection] = useState<typeof GIFT_DIRECTIONS[number]>(
    (existing?.direction as typeof GIFT_DIRECTIONS[number]) ?? 'giving',
  );
  const [status, setStatus] = useState<typeof GIFT_STATUSES[number]>(
    (existing?.status as typeof GIFT_STATUSES[number]) ?? 'idea',
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [cost, setCost] = useState(existing?.estimated_cost != null ? String(existing.estimated_cost) : '');
  const [currency, setCurrency] = useState(existing?.currency ?? 'USD');
  const [occasion, setOccasion] = useState(existing?.occasion ?? '');
  const [date, setDate] = useState(existing?.date?.slice(0, 10) ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const payload: Record<string, unknown> = { name, direction, status };
    if (description.trim()) payload.description = description.trim();
    if (url.trim()) payload.url = url.trim();
    if (occasion.trim()) payload.occasion = occasion.trim();
    if (currency.trim()) payload.currency = currency.trim();
    if (date) payload.date = date;
    if (cost.trim()) {
      const n = Number(cost);
      if (!Number.isNaN(n)) payload.estimated_cost = n;
    }
    if (!existing) payload.contact_id = contactId;
    run(
      () => existing
        ? apiPatch(`/gifts/${existing.id}`, payload)
        : apiPost('/gifts', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit gift' : 'Add gift'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="gift-form" />}>
      <form id="gift-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <Field label="Name" error={errs.name}>
          <Input data-testid="gift-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required />
        </Field>
        <div class="form-grid">
          <Field label="Direction">
            <Select data-testid="gift-direction" value={direction}
              onChange={(e) => setDirection((e.target as HTMLSelectElement).value as typeof GIFT_DIRECTIONS[number])}>
              {GIFT_DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select data-testid="gift-status" value={status}
              onChange={(e) => setStatus((e.target as HTMLSelectElement).value as typeof GIFT_STATUSES[number])}>
              {GIFT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Estimated cost">
            <Input data-testid="gift-cost" type="number" min={0} step="0.01" value={cost}
              onInput={(e) => setCost((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Currency">
            <Input data-testid="gift-currency" value={currency}
              onInput={(e) => setCurrency((e.target as HTMLInputElement).value)} placeholder="USD" />
          </Field>
          <Field label="Occasion">
            <Input data-testid="gift-occasion" value={occasion}
              onInput={(e) => setOccasion((e.target as HTMLInputElement).value)} placeholder="birthday, holiday…" />
          </Field>
          <Field label="Date">
            <Input data-testid="gift-date" type="date" value={date}
              onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <Field label="URL">
          <Input data-testid="gift-url" type="url" value={url}
            onInput={(e) => setUrl((e.target as HTMLInputElement).value)} placeholder="https://…" />
        </Field>
        <Field label="Description">
          <Textarea data-testid="gift-description" value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Debt editor ────────────────────────────────────────────────

const DEBT_DIRECTIONS = ['i_owe_them', 'they_owe_me'] as const;

export function DebtEditor({ contactId, existing, onClose, onSaved }: EditorProps<Debt>) {
  const [amount, setAmount] = useState(existing?.amount != null ? String(existing.amount) : '');
  const [currency, setCurrency] = useState(existing?.currency ?? 'USD');
  const [direction, setDirection] = useState<typeof DEBT_DIRECTIONS[number]>(
    (existing?.direction as typeof DEBT_DIRECTIONS[number]) ?? 'they_owe_me',
  );
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [incurredAt, setIncurredAt] = useState(existing?.incurred_at?.slice(0, 10) ?? '');
  const { saving, error, errs, run } = useSave();

  function submit(e: Event) {
    e.preventDefault();
    const n = Number(amount);
    if (Number.isNaN(n)) {
      showToast('Amount must be a number', 'error');
      return;
    }
    const payload: Record<string, unknown> = { amount: n, direction };
    if (currency.trim()) payload.currency = currency.trim();
    if (reason.trim()) payload.reason = reason.trim();
    if (incurredAt) payload.incurred_at = incurredAt;
    if (!existing) payload.contact_id = contactId;
    run(
      () => existing
        ? apiPatch(`/debts/${existing.id}`, payload)
        : apiPost('/debts', payload),
      () => { showToast('Saved', 'success'); onSaved(); },
    );
  }

  return (
    <Modal open title={existing ? 'Edit debt' : 'Add debt'} onClose={onClose}
      footer={<EditorFooter saving={saving} onClose={onClose} form="debt-form" />}>
      <form id="debt-form" class="stack" onSubmit={submit}>
        {error && <div class="field__error">{error}</div>}
        <div class="form-grid">
          <Field label="Direction">
            <Select data-testid="debt-direction" value={direction}
              onChange={(e) => setDirection((e.target as HTMLSelectElement).value as typeof DEBT_DIRECTIONS[number])}>
              <option value="they_owe_me">They owe me</option>
              <option value="i_owe_them">I owe them</option>
            </Select>
          </Field>
          <Field label="Amount" error={errs.amount}>
            <Input data-testid="debt-amount" type="number" min={0} step="0.01" value={amount}
              onInput={(e) => setAmount((e.target as HTMLInputElement).value)} required />
          </Field>
          <Field label="Currency">
            <Input data-testid="debt-currency" value={currency}
              onInput={(e) => setCurrency((e.target as HTMLInputElement).value)} placeholder="USD" />
          </Field>
          <Field label="Incurred">
            <Input data-testid="debt-incurred" type="date" value={incurredAt}
              onInput={(e) => setIncurredAt((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <Field label="Reason">
          <Input data-testid="debt-reason" value={reason}
            onInput={(e) => setReason((e.target as HTMLInputElement).value)} placeholder="What's this for?" />
        </Field>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { apiGet, apiPost, apiPatch } from '../../api/client';
import type { Contact } from '../../api/types';
import { Button, Input, Select, Textarea, Field, Card, Spinner, ErrorBanner } from '../../ui';
import { showToast } from '../../ui';
import { errorMessage, fieldErrors } from '../../lib/format';

type BirthdayMode = 'full_date' | 'month_day' | 'approximate_age';

interface FormState {
  first_name: string;
  last_name: string;
  nickname: string;
  maiden_name: string;
  gender: string;
  pronouns: string;
  status: 'active' | 'archived' | 'deceased';
  is_favorite: boolean;
  deceased_date: string;
  birthday_enabled: boolean;
  birthday_mode: BirthdayMode;
  birthday_date: string;
  birthday_month: string;
  birthday_day: string;
  birthday_year_approximate: string;
  met_at_date: string;
  met_at_location: string;
  met_description: string;
  job_title: string;
  company: string;
  industry: string;
  work_notes: string;
}

const EMPTY: FormState = {
  first_name: '', last_name: '', nickname: '', maiden_name: '', gender: '', pronouns: '',
  status: 'active', is_favorite: false, deceased_date: '',
  birthday_enabled: false, birthday_mode: 'full_date',
  birthday_date: '', birthday_month: '', birthday_day: '', birthday_year_approximate: '',
  met_at_date: '', met_at_location: '', met_description: '',
  job_title: '', company: '', industry: '', work_notes: '',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function fromContact(c: Contact): FormState {
  return {
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    nickname: c.nickname ?? '',
    maiden_name: c.maiden_name ?? '',
    gender: c.gender ?? '',
    pronouns: c.pronouns ?? '',
    status: c.status,
    is_favorite: c.is_favorite,
    deceased_date: c.deceased_date ?? '',
    birthday_enabled: c.birthday_mode != null,
    birthday_mode: (c.birthday_mode as BirthdayMode) ?? 'full_date',
    birthday_date: c.birthday_date ?? '',
    birthday_month: c.birthday_month != null ? String(c.birthday_month) : '',
    birthday_day: c.birthday_day != null ? String(c.birthday_day) : '',
    birthday_year_approximate: c.birthday_year_approximate != null ? String(c.birthday_year_approximate) : '',
    met_at_date: c.met_at_date ?? '',
    met_at_location: c.met_at_location ?? '',
    met_description: c.met_description ?? '',
    job_title: c.job_title ?? '',
    company: c.company ?? '',
    industry: c.industry ?? '',
    work_notes: c.work_notes ?? '',
  };
}

/** Build the API payload from form state, omitting empty optionals. */
function toPayload(f: FormState): Record<string, unknown> {
  const p: Record<string, unknown> = {
    first_name: f.first_name.trim(),
    status: f.status,
    is_favorite: f.is_favorite,
  };
  const opt = (key: string, val: string) => { if (val.trim()) p[key] = val.trim(); };
  opt('last_name', f.last_name);
  opt('nickname', f.nickname);
  opt('maiden_name', f.maiden_name);
  opt('gender', f.gender);
  opt('pronouns', f.pronouns);
  opt('met_at_date', f.met_at_date);
  opt('met_at_location', f.met_at_location);
  opt('met_description', f.met_description);
  opt('job_title', f.job_title);
  opt('company', f.company);
  opt('industry', f.industry);
  opt('work_notes', f.work_notes);
  if (f.status === 'deceased') opt('deceased_date', f.deceased_date);

  if (f.birthday_enabled) {
    p.birthday_mode = f.birthday_mode;
    if (f.birthday_mode === 'full_date' && f.birthday_date) {
      p.birthday_date = f.birthday_date;
    } else if (f.birthday_mode === 'month_day') {
      if (f.birthday_month) p.birthday_month = Number(f.birthday_month);
      if (f.birthday_day) p.birthday_day = Number(f.birthday_day);
    } else if (f.birthday_mode === 'approximate_age' && f.birthday_year_approximate) {
      p.birthday_year_approximate = Number(f.birthday_year_approximate);
    }
  }
  return p;
}

export function ContactForm({ id }: { id?: string }) {
  const editing = Boolean(id);
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    apiGet<Contact>(`/contacts/${id}`)
      .then(({ data }) => { if (!cancelled) setForm(fromContact(data)); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load contact')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Default the optional sections open when they already carry data (edit mode).
  const hasBirthday = form.birthday_enabled;
  const hasMet = Boolean(form.met_at_date || form.met_at_location || form.met_description);
  const hasWork = Boolean(form.job_title || form.company || form.industry || form.work_notes);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setErrs({});
    if (!form.first_name.trim()) {
      setErrs({ first_name: 'First name is required' });
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      const result = editing
        ? await apiPatch<Contact>(`/contacts/${id}`, payload)
        : await apiPost<Contact>('/contacts', payload);
      showToast(editing ? 'Contact updated' : 'Contact created', 'success');
      navigate(`/contacts/${result.data.id}`);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrs(fe);
      setError(errorMessage(err, 'Failed to save contact'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner size="lg" center />;

  return (
    <div class="stack">
      <div class="page-header">
        <h1>{editing ? 'Edit contact' : 'New contact'}</h1>
        <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }}>← Back</a>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={submit}>
        <Card class="stack">
          <h2>Basics</h2>
          <div class="form-grid">
            <Field label="First name" htmlFor="first_name" error={errs.first_name}>
              <Input id="first_name" value={form.first_name} data-testid="contact-form-first-name"
                onInput={(e) => set('first_name', (e.target as HTMLInputElement).value)} required />
            </Field>
            <Field label="Last name" error={errs.last_name}>
              <Input value={form.last_name} data-testid="contact-form-last-name" onInput={(e) => set('last_name', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Nickname">
              <Input value={form.nickname} onInput={(e) => set('nickname', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Maiden name">
              <Input value={form.maiden_name} onInput={(e) => set('maiden_name', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Gender">
              <GenderControl value={form.gender} onChange={(v) => set('gender', v)} />
            </Field>
            <Field label="Pronouns">
              <Input value={form.pronouns} onInput={(e) => set('pronouns', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Status">
              <Select value={form.status} data-testid="contact-form-status"
                onChange={(e) => set('status', (e.target as HTMLSelectElement).value as FormState['status'])}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="deceased">Deceased</option>
              </Select>
            </Field>
            {form.status === 'deceased' && (
              <Field label="Deceased date">
                <Input type="date" value={form.deceased_date}
                  onInput={(e) => set('deceased_date', (e.target as HTMLInputElement).value)} />
              </Field>
            )}
            <Field label="Favorite">
              <label class="checkbox-row">
                <input type="checkbox" checked={form.is_favorite} data-testid="contact-form-favorite"
                  onChange={(e) => set('is_favorite', (e.target as HTMLInputElement).checked)} />
                <span>Mark as favorite</span>
              </label>
            </Field>
          </div>
        </Card>

        <details class="form-section" open={hasBirthday}>
          <summary class="form-section__summary">
            <span>Birthday</span>
            {form.birthday_enabled && <span class="muted">Recorded</span>}
          </summary>
          <div class="form-section__body stack">
          <label class="checkbox-row">
            <input type="checkbox" checked={form.birthday_enabled}
              onChange={(e) => set('birthday_enabled', (e.target as HTMLInputElement).checked)} />
            <span>Record a birthday</span>
          </label>
          {form.birthday_enabled && (
            <div class="form-grid">
              <Field label="How is it known?" hint="Pick how precisely you know the birthday.">
                <Select value={form.birthday_mode}
                  onChange={(e) => set('birthday_mode', (e.target as HTMLSelectElement).value as BirthdayMode)}>
                  <option value="full_date">Full date</option>
                  <option value="month_day">Month &amp; day only</option>
                  <option value="approximate_age">Approximate age / birth year</option>
                </Select>
              </Field>
              {form.birthday_mode === 'full_date' && (
                <Field label="Date of birth" error={errs.birthday_date}>
                  <Input type="date" value={form.birthday_date}
                    onInput={(e) => set('birthday_date', (e.target as HTMLInputElement).value)} />
                </Field>
              )}
              {form.birthday_mode === 'month_day' && (
                <>
                  <Field label="Month" error={errs.birthday_month}>
                    <Select value={form.birthday_month}
                      onChange={(e) => set('birthday_month', (e.target as HTMLSelectElement).value)}>
                      <option value="">—</option>
                      {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                    </Select>
                  </Field>
                  <Field label="Day" error={errs.birthday_day}>
                    <Input type="number" min={1} max={31} value={form.birthday_day}
                      onInput={(e) => set('birthday_day', (e.target as HTMLInputElement).value)} />
                  </Field>
                </>
              )}
              {form.birthday_mode === 'approximate_age' && (
                <Field label="Approximate birth year" error={errs.birthday_year_approximate}
                  hint="e.g. 1985 if they're about 40">
                  <Input type="number" value={form.birthday_year_approximate}
                    onInput={(e) => set('birthday_year_approximate', (e.target as HTMLInputElement).value)} />
                </Field>
              )}
            </div>
          )}
          </div>
        </details>

        <details class="form-section" open={hasMet}>
          <summary class="form-section__summary">
            <span>How you met</span>
            {hasMet && <span class="muted">Added</span>}
          </summary>
          <div class="form-section__body">
          <div class="form-grid">
            <Field label="Met on">
              <Input type="date" value={form.met_at_date}
                onInput={(e) => set('met_at_date', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Met at (location)">
              <Input value={form.met_at_location}
                onInput={(e) => set('met_at_location', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="How you met" htmlFor="met_desc">
              <Textarea id="met_desc" value={form.met_description}
                onInput={(e) => set('met_description', (e.target as HTMLTextAreaElement).value)} />
            </Field>
          </div>
          </div>
        </details>

        <details class="form-section" open={hasWork}>
          <summary class="form-section__summary" data-testid="contact-form-work-toggle">
            <span>Work</span>
            {hasWork && <span class="muted">Added</span>}
          </summary>
          <div class="form-section__body">
          <div class="form-grid">
            <Field label="Job title">
              <Input value={form.job_title} onInput={(e) => set('job_title', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Company">
              <Input value={form.company} data-testid="contact-form-company" onInput={(e) => set('company', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Industry">
              <Input value={form.industry} onInput={(e) => set('industry', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Work notes">
              <Textarea value={form.work_notes}
                onInput={(e) => set('work_notes', (e.target as HTMLTextAreaElement).value)} />
            </Field>
          </div>
          </div>
        </details>

        <div class="row" style="margin-top:1rem;">
          <Button type="submit" disabled={saving} data-testid="contact-form-submit">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create contact'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Gender as a segmented control (bean mob-crm-3w6w). Replaces the old free-text
 * box: the common cases are one tap, and "Other" reveals a text input for
 * anything else (mapping back to the same stored string).
 */
const GENDER_PRESETS = ['Female', 'Male'];

function GenderControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // "Other" mode is active when there's a value that isn't one of the presets.
  const isPreset = GENDER_PRESETS.includes(value);
  const [otherMode, setOtherMode] = useState(value !== '' && !isPreset);

  return (
    <div class="stack" style="gap:var(--space-2);">
      <div class="segmented" role="group" aria-label="Gender">
        {GENDER_PRESETS.map((opt) => (
          <button
            key={opt}
            type="button"
            class={`segmented__btn${!otherMode && value === opt ? ' segmented__btn--active' : ''}`}
            aria-pressed={!otherMode && value === opt}
            data-testid={`contact-form-gender-${opt.toLowerCase()}`}
            onClick={() => { setOtherMode(false); onChange(opt); }}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          class={`segmented__btn${otherMode ? ' segmented__btn--active' : ''}`}
          aria-pressed={otherMode}
          data-testid="contact-form-gender-other"
          onClick={() => { setOtherMode(true); if (isPreset) onChange(''); }}
        >
          Other
        </button>
      </div>
      {otherMode && (
        <Input
          value={value}
          placeholder="Specify gender"
          aria-label="Specify gender"
          data-testid="contact-form-gender-custom"
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        />
      )}
    </div>
  );
}

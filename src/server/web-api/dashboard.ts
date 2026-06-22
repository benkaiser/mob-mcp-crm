import { Router } from 'express';
import type Database from 'better-sqlite3';
import { ReminderService } from '../../services/reminders.js';
import { ContactService } from '../../services/contacts.js';
import { ActivityService } from '../../services/activities.js';
import { TaskService } from '../../services/tasks.js';
import { DebtService } from '../../services/debts.js';
import { DataExportService } from '../../services/data-export.js';
import { asyncHandler, sendData, getUserId } from './helpers.js';

/**
 * Internal API router for the SPA dashboard, mounted at /web/api/dashboard.
 *
 * GET / composes a single payload from existing services so the SPA can render
 * the dashboard in one round-trip. No new service methods are introduced — every
 * field is derived from existing list/summary calls.
 */
export function createDashboardRouter(db: Database.Database): Router {
  const router = Router();
  const reminders = new ReminderService(db);
  const contacts = new ContactService(db);
  const activities = new ActivityService(db);
  const tasks = new TaskService(db);
  const debts = new DebtService(db);
  const exporter = new DataExportService(db);

  // GET / — composed dashboard payload.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);

    const upcomingReminders = reminders.getUpcomingReminders(userId, { days_ahead: 14 }).data;
    const upcomingBirthdays = contacts.getUpcomingBirthdays(userId, { days_ahead: 30 }).data;
    const recentActivities = activities.list(userId, { page: 1, per_page: 10 }).data;

    // "Open" tasks = not completed. The task service filters a single status, so
    // merge the two non-completed statuses.
    const pendingTasks = tasks.list(userId, { status: 'pending', page: 1, per_page: 10 }).data;
    const inProgressTasks = tasks.list(userId, { status: 'in_progress', page: 1, per_page: 10 }).data;
    const openTasks = [...inProgressTasks, ...pendingTasks].slice(0, 10);

    // Compose a global debt net-balance summary by currency. DebtService.summary
    // is per-contact only, so aggregate the active debts list here.
    const activeDebts = debts.list(userId, { status: 'active', page: 1, per_page: 1000 }).data as Array<{
      amount: number; currency: string | null; direction: string;
    }>;
    const byCurrency = new Map<string, { currency: string; total_i_owe: number; total_they_owe: number; net_balance: number }>();
    for (const d of activeDebts) {
      const currency = d.currency || 'USD';
      const entry = byCurrency.get(currency) ?? { currency, total_i_owe: 0, total_they_owe: 0, net_balance: 0 };
      if (d.direction === 'i_owe_them') entry.total_i_owe += d.amount;
      else entry.total_they_owe += d.amount;
      entry.net_balance = entry.total_they_owe - entry.total_i_owe;
      byCurrency.set(currency, entry);
    }

    const stats = exporter.getStatistics(userId);
    const counts = {
      contacts: stats.total_contacts,
      active_contacts: stats.active_contacts,
      favorite_contacts: stats.favorite_contacts,
      total_activities: stats.total_activities,
      total_notes: stats.total_notes,
      pending_reminders: stats.pending_reminders,
      pending_tasks: stats.pending_tasks,
      active_debts: stats.active_debts,
      gift_ideas: stats.gift_ideas,
    };

    sendData(res, {
      upcoming_reminders: upcomingReminders,
      upcoming_birthdays: upcomingBirthdays,
      recent_activities: recentActivities,
      open_tasks: openTasks,
      debt_summary: {
        by_currency: [...byCurrency.values()],
        active_count: activeDebts.length,
      },
      counts,
    });
  }));

  return router;
}

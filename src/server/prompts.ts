import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/**
 * Register all MCP prompt definitions on the given server.
 *
 * @param server  – the McpServer instance to register prompts on
 * @param getUserId – helper that extracts the authenticated userId from the
 *                    callback's `extra` parameter (throws if not authenticated)
 */
export function registerPrompts(
  server: McpServer,
  getUserId: (extra: { authInfo?: AuthInfo }) => string,
): void {
  server.registerPrompt('daily-briefing', {
    title: 'Daily Briefing',
    description: 'Get your morning CRM overview: upcoming reminders, birthdays, pending tasks, unread notifications, and unsettled debts.',
  }, (extra) => {
    const userId = getUserId(extra);
    const today = new Date().toISOString().slice(0, 10);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me my daily CRM briefing for today (${today}). Please:

1. Check for any **upcoming and overdue reminders** (use reminder_manage with action "list" and status "active")
2. Look for any **birthdays today or in the next 7 days** (use contact_list and check birthday fields)
3. Show **pending and in-progress tasks** (use task_manage with action "list" and status "pending", then "in_progress")
4. Check for **unread notifications** (use notification_list with unread_only true)
5. Show any **unsettled debts** (use debt_manage with action "list" and status "active")
6. Show recent **CRM statistics** (use data_statistics)

Present everything in a clean, organized summary. Highlight anything urgent (overdue items, today's birthdays). If everything is clear, let me know that too!`,
        },
      }],
    };
  });

  server.registerPrompt('prepare-for-meeting', {
    title: 'Prepare for Meeting',
    description: 'Get a comprehensive dossier on a contact before meeting them: profile, recent activity, notes, relationships, food preferences, and pending items.',
    argsSchema: {
      contact_name: z.string().describe('Name of the contact to prepare for'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'm preparing to meet with **${args.contact_name}**. Please compile a comprehensive dossier:

1. **Find the contact** (use contact_list with search for "${args.contact_name}")
2. **Full profile** (use contact_get with their ID — includes contact methods, addresses, food preferences, custom fields, tags)
3. **Recent timeline** (use contact_timeline to see recent activities, notes, life events)
4. **Relationships** (use relationship_list to see who they're connected to)
5. **Pinned/recent notes** (use note_list to see important notes)
6. **Pending reminders** about them (use reminder_manage with action "list" filtered by their contact ID)
7. **Pending tasks** related to them (use task_manage with action "list" filtered by their contact ID)
8. **Gift history** (use gift_list filtered by their contact ID)
9. **Debts** (use debt_manage with action "summary" for their contact ID)

Organize this into a meeting prep brief with key talking points, things to remember, and any action items.`,
        },
      }],
    };
  });

  server.registerPrompt('log-interaction', {
    title: 'Log Interaction',
    description: 'Quickly log an interaction from a natural language description. Parses who, what, when, and where into a structured activity.',
    argsSchema: {
      description: z.string().describe('Natural language description of the interaction (e.g. "Had coffee with Sarah and Mike on Tuesday at Blue Bottle, talked about their new house")'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please log the following interaction in my CRM:

"${args.description}"

Steps:
1. **Prime context** (use prime to load contacts so you can match names)
2. **Parse the description** to identify:
   - **Who** was involved (match to existing contacts by name)
   - **What type** of interaction (phone_call, video_call, text_message, in_person, email, activity, other)
   - **When** it happened (interpret relative dates like "yesterday", "last Tuesday", etc. relative to today)
   - **Where** it took place (if mentioned)
   - **Key details** for the description/notes
3. **Create the activity** (use activity_manage with action="create" and the parsed details)
4. **Optionally create a note** if there are specific details worth recording separately on one of the contacts
5. **Ask if I want to set any follow-up reminders** based on what was discussed

If any contact names don't match existing contacts, ask me if I want to create new contacts for them.`,
        },
      }],
    };
  });

  server.registerPrompt('add-new-contact', {
    title: 'Add New Contact',
    description: 'Intelligently onboard a new contact from freeform text — parses name, phone, email, social, birthday, work info, tags, relationships, and more.',
    argsSchema: {
      info: z.string().describe('Everything you know about the person (e.g. "Met Sarah Chen at the React conference, she\'s a senior engineer at Google, email sarah@example.com, birthday March 15, she\'s friends with Mike")'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please add a new contact to my CRM based on this information:

"${args.info}"

Steps:
1. **Prime context** (use prime to load existing contacts and tags for matching)
2. **Parse the information** to extract all structured data:
   - Name (first, last, nickname)
   - Contact methods (email, phone, social handles)
   - Birthday (date, month/day, or approximate age)
   - Work info (job title, company, industry)
   - How we met (date, location, through whom, description)
   - Any tags that apply
   - Relationships to existing contacts
3. **Create the contact** (use contact_create with all parsed fields)
4. **Add contact methods** if any were mentioned (use contact_method_manage with action "add")
5. **Add address** if mentioned (use address_manage with action "add")
6. **Set food preferences** if mentioned (use food_preferences_upsert)
7. **Add tags** if applicable (use tag_manage with action "tag_contact")
8. **Create relationships** if they know existing contacts (use relationship_add)
9. **Add any notes** with additional context that doesn't fit structured fields (use note_manage with action "create")

Present a summary of everything you created and ask if anything needs correction.`,
        },
      }],
    };
  });

  server.registerPrompt('gift-ideas', {
    title: 'Gift Ideas',
    description: 'Brainstorm personalized gift ideas for a contact based on their preferences, interests, history, and upcoming occasions.',
    argsSchema: {
      contact_name: z.string().describe('Name of the contact to brainstorm gifts for'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Help me brainstorm gift ideas for **${args.contact_name}**. Please:

1. **Find the contact** (use contact_list with search for "${args.contact_name}")
2. **Get their full profile** (use contact_get — includes food preferences, custom fields)
3. **Check past gifts** (use gift_list filtered by their contact ID to see what I've already given/received)
4. **Review their notes** (use note_list for any personal details, interests, wishlists)
5. **Check recent life events** (use life_event_manage with action "list" — new job, moved, etc. might inspire ideas)
6. **Check their relationships** (use relationship_list — could inform group gift ideas)

Based on all this context, suggest **5-10 personalized gift ideas** organized by:
- **Budget tiers** (under $25, $25-50, $50-100, $100+)
- **Occasion** if relevant (birthday coming up, holiday, just because)

For each idea, explain why it's a good fit based on what you know about them. Ask if I'd like to save any as gift ideas (using gift_manage with action "create" and status "idea").`,
        },
      }],
    };
  });

  server.registerPrompt('relationship-summary', {
    title: 'Relationship Summary',
    description: 'Get a relationship health check for a contact: interaction frequency, last contact, communication patterns, and suggestions.',
    argsSchema: {
      contact_name: z.string().describe('Name of the contact to review'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    const today = new Date().toISOString().slice(0, 10);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me a relationship health check for **${args.contact_name}** (today is ${today}). Please:

1. **Find the contact** (use contact_list with search for "${args.contact_name}")
2. **Get their profile** (use contact_get for full details)
3. **Review the full timeline** (use contact_timeline with a large per_page to see all interactions)
4. **Check activities** (use activity_list filtered by their contact ID)
5. **Check relationships** (use relationship_list to see their social connections in my network)
6. **Check pending items** (use reminder_manage with action "list" and task_manage with action "list" filtered by their contact ID)
7. **Check notes** (use note_list for context)

Analyze and present:
- **Last interaction**: When and what type
- **Interaction frequency**: How often we connect, and the trend (increasing/decreasing)
- **Communication patterns**: What types of interactions are most common
- **Relationship strength**: Your assessment based on frequency, recency, and depth of interactions
- **Key milestones**: Important life events and shared experiences
- **Pending items**: Any open reminders, tasks, or unsettled debts
- **Suggestions**: Specific, actionable ways to strengthen this relationship (e.g., "It's been 3 months since you last met in person — consider scheduling a coffee")`,
        },
      }],
    };
  });

  server.registerPrompt('weekly-review', {
    title: 'Weekly Review',
    description: 'End-of-week reflection: activities logged, tasks completed, new contacts, and contacts who may need attention.',
  }, (extra) => {
    const userId = getUserId(extra);
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me my weekly CRM review for the past week (${weekAgo} to ${todayStr}). Please:

1. **Get CRM statistics** (use data_statistics for an overview)
2. **Recent activities** (use activity_list with a large per_page and review which occurred this week)
3. **Completed tasks** (use task_manage with action "list" and status "completed" and check which were completed this week)
4. **New contacts** (use contact_list sorted by created_at desc and check which were added this week)
5. **Still pending tasks** (use task_manage with action "list" and status "pending" — especially overdue ones)
6. **Upcoming reminders** (use reminder_manage with action "list" and status "active" for next week)

Summarize:
- **This week's highlights**: Key interactions, tasks completed, new contacts added
- **By the numbers**: How many activities logged, tasks completed, contacts added
- **Needs attention**: Contacts you haven't interacted with recently but probably should (favorites, close relationships with no recent activity)
- **Coming up next week**: Upcoming reminders, birthdays, and due tasks
- **Suggestions**: Any patterns or opportunities (e.g., "You logged 5 phone calls but no in-person meetings this week")`,
        },
      }],
    };
  });

  server.registerPrompt('find-connections', {
    title: 'Find Connections',
    description: 'Search your network for people matching a specific need, skill, industry, or topic.',
    argsSchema: {
      query: z.string().describe('What you\'re looking for (e.g. "who works in real estate", "who do I know at Google", "someone who can help with legal advice")'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Help me find people in my network who match this: **${args.query}**

Please search broadly:
1. **Prime context** (use prime to load all contacts with their companies and tags)
2. **Search contacts** by name, company, and job title (use contact_list with search for relevant keywords)
3. **Search by tags** (use contact_list with tag_name filter for relevant tags)
4. **Search by company** (use contact_list with company filter)
5. For promising matches, **get full details** (use contact_get to check custom fields, notes, and work info)
6. For top matches, **check notes** (use note_list — notes might mention relevant skills, interests, or expertise)

Present results as:
- **Strong matches**: People who clearly fit the criteria, with why they match
- **Possible matches**: People who might be relevant based on partial information
- **Connected through**: If any matches are related to other contacts (check relationship_list)

For each match, include their name, company/role, and why they're relevant. Suggest how I might reach out (show their contact methods if available).`,
        },
      }],
    };
  });
}

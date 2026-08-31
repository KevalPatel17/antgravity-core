/**
 * ═══════════════════════════════════════════════════════════════
 * Switch History Logger
 * ═══════════════════════════════════════════════════════════════
 * 
 * Persists a log of all auto-switch events using VS Code's
 * globalState (vscode.Memento). Entries are capped at 50 to
 * prevent unbounded growth. The history is displayed in the
 * sidebar panel and can be cleared by the user.
 */

import * as vscode from 'vscode';

// ─── Types ───────────────────────────────────────────────────

/** The type of switch event that occurred */
export type SwitchEventType = 'model' | 'account' | 'warning';

/** A single entry in the switch history log */
export interface HistoryEntry {
    /** Unique ID for this entry */
    id: string;
    /** Type of switch: model change, account change, or warning */
    type: SwitchEventType;
    /** What was switched FROM (model name or email) */
    from: string;
    /** What was switched TO (model name or email) */
    to: string;
    /** Human-readable reason for the switch */
    reason: string;
    /** ISO timestamp of when the switch occurred */
    timestamp: string;
    /** Human-readable time string (e.g., "Today, 2:45 PM") */
    timeDisplay: string;
}

// ─── Constants ───────────────────────────────────────────────

/** Key used to store history in VS Code globalState */
const HISTORY_STORAGE_KEY = 'antigravityHub.switchHistory';

/** Maximum number of history entries to keep */
const MAX_HISTORY_ENTRIES = 50;

// ─── SwitchHistory Class ─────────────────────────────────────

/**
 * Manages the switch history log using VS Code's globalState for persistence.
 * 
 * Usage:
 *   const history = new SwitchHistory(context.globalState);
 *   history.addEntry('model', 'claude-sonnet', 'claude-haiku', 'Low credits');
 *   const entries = history.getHistory();
 */
export class SwitchHistory {
    /** VS Code globalState memento for persistent storage */
    private globalState: vscode.Memento;

    /**
     * Creates a new SwitchHistory instance.
     * @param globalState - The VS Code globalState memento (from ExtensionContext)
     */
    constructor(globalState: vscode.Memento) {
        this.globalState = globalState;
    }

    /**
     * Adds a new entry to the switch history.
     * 
     * New entries are PREPENDED (newest first) and the list is
     * capped at MAX_HISTORY_ENTRIES, removing the oldest entries.
     * 
     * @param type   - Type of switch event ('model', 'account', 'warning')
     * @param from   - What was switched from
     * @param to     - What was switched to
     * @param reason - Human-readable reason for the switch
     */
    async addEntry(
        type: SwitchEventType,
        from: string,
        to: string,
        reason: string
    ): Promise<void> {
        const entries = this.getHistory();

        // Create the new entry with a unique ID and formatted timestamp
        const newEntry: HistoryEntry = {
            id: this.generateId(),
            type,
            from,
            to,
            reason,
            timestamp: new Date().toISOString(),
            timeDisplay: this.formatTime(new Date())
        };

        // Prepend new entry (newest first)
        entries.unshift(newEntry);

        // Cap at maximum entries — remove oldest from the end
        if (entries.length > MAX_HISTORY_ENTRIES) {
            entries.splice(MAX_HISTORY_ENTRIES);
        }

        // Persist to globalState
        await this.globalState.update(HISTORY_STORAGE_KEY, entries);
    }

    /**
     * Retrieves the full switch history.
     * Returns entries in reverse chronological order (newest first).
     * 
     * @returns Array of history entries
     */
    getHistory(): HistoryEntry[] {
        return this.globalState.get<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);
    }

    /**
     * Clears all switch history entries.
     * Called when the user clicks "Clear" in the sidebar.
     */
    async clearHistory(): Promise<void> {
        await this.globalState.update(HISTORY_STORAGE_KEY, []);
    }

    /**
     * Gets the count of history entries.
     * @returns Number of entries in the history
     */
    getCount(): number {
        return this.getHistory().length;
    }

    /**
     * Gets the most recent history entry, if any.
     * @returns The latest entry or undefined if history is empty
     */
    getLatest(): HistoryEntry | undefined {
        const history = this.getHistory();
        return history.length > 0 ? history[0] : undefined;
    }

    // ─── Private Helpers ─────────────────────────────────────

    /**
     * Generates a unique ID for a history entry.
     * Uses timestamp + random suffix to avoid collisions.
     */
    private generateId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 6);
        return `${timestamp}-${random}`;
    }

    /**
     * Formats a Date into a human-readable display string.
     * 
     * Examples:
     *   - "Today, 2:45 PM"
     *   - "Yesterday, 10:30 AM"
     *   - "Aug 15, 3:00 PM"
     * 
     * @param date - The date to format
     * @returns Formatted time string
     */
    private formatTime(date: Date): string {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 86400000);
        const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        // Format the time portion (e.g., "2:45 PM")
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Determine the date prefix
        if (entryDate.getTime() === today.getTime()) {
            return `Today, ${timeStr}`;
        } else if (entryDate.getTime() === yesterday.getTime()) {
            return `Yesterday, ${timeStr}`;
        } else {
            const dateStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
            return `${dateStr}, ${timeStr}`;
        }
    }
}

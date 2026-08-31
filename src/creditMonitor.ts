/**
 * ═══════════════════════════════════════════════════════════════
 * Credit Monitor
 * ═══════════════════════════════════════════════════════════════
 * 
 * Polls the Antigravity local database at configurable intervals
 * to check credit balances. When credits fall below the configured
 * threshold, it fires a callback to trigger the auto-switch logic.
 * 
 * Architecture:
 *   CreditMonitor ──(polls)──▶ Antigravity DB
 *                  ──(fires)──▶ onCreditLow callback
 *                  ──(fires)──▶ onCreditsUpdated callback
 */

import * as vscode from 'vscode';

// ─── Types ───────────────────────────────────────────────────

/** Credit information for a single model */
export interface ModelCreditInfo {
    modelName: string;
    credits: number;
}

/** Complete account data with all model credits */
export interface AccountData {
    id: string;
    email: string;
    isActive: boolean;
    models: Record<string, number>;
    refreshIn: string;
}

/** Callback type for when credits are low */
export type CreditLowCallback = (
    account: AccountData,
    model: string,
    credits: number
) => void;

/** Callback type for when credits are updated (any change) */
export type CreditsUpdatedCallback = (accounts: AccountData[]) => void;

// ─── CreditMonitor Class ────────────────────────────────────

/**
 * Monitors Antigravity credit balances at regular intervals.
 * 
 * When credits for the active account/model fall below the
 * configured threshold, the onCreditLow callback is fired
 * to trigger auto-switch logic.
 * 
 * Usage:
 *   const monitor = new CreditMonitor();
 *   monitor.onCreditLow = (account, model, credits) => { ... };
 *   monitor.onCreditsUpdated = (accounts) => { ... };
 *   monitor.startMonitoring(30000); // every 30 seconds
 *   monitor.stopMonitoring();
 */
export class CreditMonitor {
    /** Interval timer handle */
    private intervalHandle: NodeJS.Timeout | undefined;

    /** Whether monitoring is currently active */
    private _isMonitoring: boolean = false;

    /** Callback fired when credits drop below threshold */
    public onCreditLow: CreditLowCallback | undefined;

    /** Callback fired whenever credits are refreshed/updated */
    public onCreditsUpdated: CreditsUpdatedCallback | undefined;

    /** The credit threshold from settings */
    private threshold: number;

    /** Current polling interval in milliseconds */
    private intervalMs: number;

    /** Cached account data from last poll */
    private _cachedAccounts: AccountData[] = [];

    /**
     * Creates a new CreditMonitor.
     * Reads initial threshold from VS Code settings.
     */
    constructor() {
        const config = vscode.workspace.getConfiguration('antigravityHub');
        this.threshold = config.get<number>('autoSwitch.creditThreshold', 5);
        this.intervalMs = (config.get<number>('autoSwitch.checkIntervalSeconds', 30)) * 1000;
    }

    /** Whether the monitor is currently polling */
    get isMonitoring(): boolean {
        return this._isMonitoring;
    }

    /** Get the cached account data from the last poll */
    get cachedAccounts(): AccountData[] {
        return this._cachedAccounts;
    }

    /**
     * Starts the credit monitoring loop.
     * 
     * Polls the Antigravity database every `intervalMs` milliseconds.
     * If monitoring is already active, it restarts with the new interval.
     * 
     * @param intervalMs - Optional override for polling interval in ms.
     *                     Defaults to the value from VS Code settings.
     */
    startMonitoring(intervalMs?: number): void {
        // Stop any existing monitoring first
        this.stopMonitoring();

        // Use provided interval or fall back to settings
        if (intervalMs !== undefined) {
            this.intervalMs = intervalMs;
        }

        this._isMonitoring = true;

        // Run an immediate check, then start the interval
        this.checkActiveAccountCredits();

        this.intervalHandle = setInterval(() => {
            this.checkActiveAccountCredits();
        }, this.intervalMs);

        vscode.window.setStatusBarMessage(
            `$(zap) Antigravity: Monitoring every ${this.intervalMs / 1000}s`,
            3000
        );
    }

    /**
     * Stops the credit monitoring loop.
     * Clears the interval timer and resets the monitoring state.
     */
    stopMonitoring(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
        }
        this._isMonitoring = false;
    }

    /**
     * Checks the active account's credit balances.
     * 
     * This method:
     *   1. Reads account data from the Antigravity database
     *   2. Fires onCreditsUpdated with the latest data
     *   3. Checks if the active account's active model has low credits
     *   4. Fires onCreditLow if credits are at or below threshold
     * 
     * Currently uses STUB DATA for development. 
     * TODO: Replace with actual SQLite database reads when DB path is known.
     */
    async checkActiveAccountCredits(): Promise<void> {
        try {
            // ── Read accounts from database ──
            // TODO: Replace stub with actual SQLite read
            const accounts = await this.readAccountsFromDB();

            // Cache the accounts for other components
            this._cachedAccounts = accounts;

            // Fire the update callback so the UI refreshes
            if (this.onCreditsUpdated) {
                this.onCreditsUpdated(accounts);
            }

            // Find the active account
            const activeAccount = accounts.find(a => a.isActive);
            if (!activeAccount) {
                return;
            }

            // Re-read threshold from settings in case it changed
            const config = vscode.workspace.getConfiguration('antigravityHub');
            this.threshold = config.get<number>('autoSwitch.creditThreshold', 5);

            // Check if any active model has credits below threshold
            // For now, check the first model with the lowest credits
            const modelEntries = Object.entries(activeAccount.models);
            for (const [modelName, credits] of modelEntries) {
                if (credits <= this.threshold) {
                    // Fire the low credit callback
                    if (this.onCreditLow) {
                        this.onCreditLow(activeAccount, modelName, credits);
                    }
                    break; // Only fire once per check
                }
            }
        } catch (error) {
            console.error('[Antigravity Core] Error checking credits:', error);
        }
    }

    /**
     * Updates the monitoring interval.
     * If currently monitoring, restarts with the new interval.
     * 
     * @param seconds - New interval in seconds
     */
    updateInterval(seconds: number): void {
        this.intervalMs = seconds * 1000;
        if (this._isMonitoring) {
            // Restart with new interval
            this.startMonitoring(this.intervalMs);
        }
    }

    /**
     * Updates the credit threshold.
     * 
     * @param threshold - New threshold value
     */
    updateThreshold(threshold: number): void {
        this.threshold = threshold;
    }

    /**
     * Reads account data from the Antigravity local database.
     * 
     * ════════════════════════════════════════════════════════
     * STUB IMPLEMENTATION — Returns dummy data for development.
     * Replace this with actual SQLite reads when the database
     * path and schema are known.
     * ════════════════════════════════════════════════════════
     * 
     * @returns Array of AccountData objects
     */
    private async readAccountsFromDB(): Promise<AccountData[]> {
        // ── STUB: Return dummy data for development ──
        // In production, this would:
        //   1. Resolve the Antigravity DB path (configurable or auto-detect)
        //   2. Open the SQLite database
        //   3. Query account and credit tables
        //   4. Map results to AccountData objects

        return [
            {
                id: '1',
                email: 'primary@gmail.com',
                isActive: true,
                models: {
                    'claude-sonnet': 45,
                    'claude-haiku': 12,
                    'gemini-pro': 0,
                    'gemini-flash': 30
                },
                refreshIn: '2h 30m'
            },
            {
                id: '2',
                email: 'secondary@gmail.com',
                isActive: false,
                models: {
                    'claude-sonnet': 0,
                    'claude-haiku': 50,
                    'gemini-pro': 20,
                    'gemini-flash': 50
                },
                refreshIn: '5h 10m'
            },
            {
                id: '3',
                email: 'backup@gmail.com',
                isActive: false,
                models: {
                    'claude-sonnet': 50,
                    'claude-haiku': 50,
                    'gemini-pro': 50,
                    'gemini-flash': 50
                },
                refreshIn: '1h 05m'
            }
        ];
    }

    /**
     * Disposes the monitor and cleans up resources.
     * Called when the extension is deactivated.
     */
    dispose(): void {
        this.stopMonitoring();
    }
}

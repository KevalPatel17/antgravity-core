/**
 * ═══════════════════════════════════════════════════════════════
 * Auto Switch Engine
 * ═══════════════════════════════════════════════════════════════
 * 
 * Implements the smart switch decision tree that automatically
 * switches models and accounts when credits run low.
 * 
 * Decision Tree:
 *   Step 1: credits > threshold → DO NOTHING
 *   Step 2: current model exhausted → try next model (same account)
 *   Step 3: all models exhausted on account → switch to next account
 *   Step 4: all accounts + models exhausted → show warning, stop
 * 
 * This is the brain of the auto-switch feature. It coordinates
 * with CreditMonitor (input), ModelPriority (decisions),
 * HistoryLog (logging), and StatusBar (display).
 */

import * as vscode from 'vscode';
import { AccountData } from './creditMonitor';
import { getNextAvailableModel, getTotalCredits } from './modelPriority';
import { SwitchHistory } from './historyLog';
import { StatusBarManager } from './statusBar';

// ─── Types ───────────────────────────────────────────────────

/** Result of a smart switch attempt */
export interface SwitchResult {
    /** Whether a switch was performed */
    switched: boolean;
    /** Type of switch: 'model', 'account', or 'none' */
    type: 'model' | 'account' | 'none' | 'exhausted';
    /** What was switched from */
    from: string;
    /** What was switched to */
    to: string;
    /** Reason for the switch */
    reason: string;
}

// ─── AutoSwitchEngine Class ──────────────────────────────────

/**
 * The auto-switch engine that makes intelligent switching decisions
 * based on credit balances, model priority, and account availability.
 * 
 * Usage:
 *   const engine = new AutoSwitchEngine(history, statusBar);
 *   const result = await engine.smartSwitch(activeAccount, 'claude-sonnet', allAccounts);
 */
export class AutoSwitchEngine {
    /** Reference to the switch history logger */
    private history: SwitchHistory;

    /** Reference to the status bar manager */
    private statusBar: StatusBarManager;

    /** Whether notifications are enabled */
    private showNotifications: boolean;

    /** Whether to prefer the account with the highest credits */
    private preferHighestCredits: boolean;

    /**
     * Creates a new AutoSwitchEngine.
     * 
     * @param history   - SwitchHistory instance for logging switches
     * @param statusBar - StatusBarManager instance for UI updates
     */
    constructor(history: SwitchHistory, statusBar: StatusBarManager) {
        this.history = history;
        this.statusBar = statusBar;

        // Read settings
        const config = vscode.workspace.getConfiguration('antigravityHub');
        this.showNotifications = config.get<boolean>('autoSwitch.showNotifications', true);
        this.preferHighestCredits = config.get<boolean>('autoSwitch.preferHighestCredits', true);
    }

    /**
     * ══════════════════════════════════════════════════════════
     * SMART SWITCH — Main Decision Tree
     * ══════════════════════════════════════════════════════════
     * 
     * Evaluates the current credit situation and decides the
     * best course of action:
     * 
     *   Step 1: credits > threshold → do nothing (return early)
     *   Step 2: current model exhausted → switch to next model
     *   Step 3: all models exhausted → switch to next account
     *   Step 4: all exhausted → warn user, stop monitoring
     * 
     * @param currentAccount - The currently active account
     * @param currentModel   - The currently active model name
     * @param allAccounts    - Array of all available accounts
     * @returns SwitchResult describing what happened
     */
    async smartSwitch(
        currentAccount: AccountData,
        currentModel: string,
        allAccounts: AccountData[]
    ): Promise<SwitchResult> {
        const currentCredits = currentAccount.models[currentModel] ?? 0;
        const config = vscode.workspace.getConfiguration('antigravityHub');
        const threshold = config.get<number>('autoSwitch.creditThreshold', 5);

        // ── Step 1: Credits are fine — do nothing ──
        if (currentCredits > threshold) {
            return {
                switched: false,
                type: 'none',
                from: currentModel,
                to: currentModel,
                reason: `Credits (${currentCredits}) above threshold (${threshold})`
            };
        }

        // ── Step 2: Try switching to next model on SAME account ──
        const nextModel = getNextAvailableModel(currentModel, currentAccount.models);
        if (nextModel) {
            const result = await this.performModelSwitch(
                currentAccount,
                currentModel,
                nextModel,
                currentCredits
            );
            return result;
        }

        // ── Step 3: All models exhausted — switch to next account ──
        const nextAccount = this.findNextAccount(currentAccount, allAccounts);
        if (nextAccount) {
            const result = await this.performAccountSwitch(
                currentAccount,
                nextAccount
            );
            return result;
        }

        // ── Step 4: ALL accounts and models exhausted ──
        return await this.handleNoAccountsAvailable(currentAccount);
    }

    /**
     * Performs a model switch on the same account.
     * 
     * This is the PREFERRED switch type because it doesn't require
     * session changes — just updating the active model in the DB.
     * 
     * @param account      - The current account
     * @param fromModel    - Model being switched from
     * @param toModel      - Model being switched to
     * @param fromCredits  - Credits remaining on the from model
     * @returns SwitchResult
     */
    async performModelSwitch(
        account: AccountData,
        fromModel: string,
        toModel: string,
        fromCredits: number
    ): Promise<SwitchResult> {
        const toCredits = account.models[toModel] ?? 0;
        const reason = fromCredits <= 0
            ? 'Credits exhausted'
            : `Low credits (${fromCredits} remaining)`;

        // ── Show status bar animation ──
        this.statusBar.showSwitchAnimation();

        // ── Log to history ──
        await this.history.addEntry('model', fromModel, toModel, reason);

        // ── Show notification ──
        if (this.showNotifications) {
            vscode.window.showInformationMessage(
                `⚡ Antigravity: Switched model ${fromModel} → ${toModel} (${toCredits} credits)`
            );
        }

        // ── Update model in database ──
        // TODO: Actually update the Antigravity DB to change active model
        // For now, this is a stub — no reload needed for model switches

        // ── Update status bar ──
        this.statusBar.update(account.email, toModel, toCredits);

        return {
            switched: true,
            type: 'model',
            from: fromModel,
            to: toModel,
            reason
        };
    }

    /**
     * Performs a full account switch.
     * 
     * This is a heavier operation that requires:
     *   1. Injecting the new session into the Antigravity DB
     *   2. Potentially reloading the VS Code window
     * 
     * @param fromAccount - Account being switched from
     * @param toAccount   - Account being switched to
     * @returns SwitchResult
     */
    async performAccountSwitch(
        fromAccount: AccountData,
        toAccount: AccountData
    ): Promise<SwitchResult> {
        const reason = 'All models exhausted';

        // Find the best model on the new account
        const bestModel = this.getBestModelForAccount(toAccount);
        const bestCredits = bestModel ? (toAccount.models[bestModel] ?? 0) : 0;

        // ── Show status bar animation ──
        this.statusBar.showSwitchAnimation();

        // ── Log to history ──
        await this.history.addEntry(
            'account',
            fromAccount.email,
            toAccount.email,
            reason
        );

        // ── Show notification ──
        if (this.showNotifications) {
            const action = await vscode.window.showInformationMessage(
                `⚡ Antigravity: Switched account ${fromAccount.email} → ${toAccount.email}`,
                'Reload Window'
            );

            // If user clicks "Reload Window", reload to apply session changes
            if (action === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }

        // ── Inject session to database ──
        // TODO: Actually inject the new account's session into the Antigravity DB
        // This would involve:
        //   1. Reading the new account's stored session token
        //   2. Writing it as the active session
        //   3. Optionally triggering a VS Code reload

        // ── Update status bar ──
        if (bestModel) {
            this.statusBar.update(toAccount.email, bestModel, bestCredits);
        }

        return {
            switched: true,
            type: 'account',
            from: fromAccount.email,
            to: toAccount.email,
            reason
        };
    }

    /**
     * Handles the case where ALL accounts and models are exhausted.
     * 
     * Shows a warning notification with options:
     *   - "Add Account" — triggers the add account flow
     *   - "Dismiss" — closes the notification
     * 
     * Also logs the event to history and updates the status bar
     * to show the exhausted state.
     * 
     * @param currentAccount - The account that just ran out
     * @returns SwitchResult with type 'exhausted'
     */
    async handleNoAccountsAvailable(
        currentAccount: AccountData
    ): Promise<SwitchResult> {
        const reason = 'All credits exhausted across all accounts';

        // ── Log warning to history ──
        await this.history.addEntry('warning', '', '', reason);

        // ── Update status bar to exhausted state ──
        this.statusBar.showExhausted();

        // ── Show prominent warning ──
        const action = await vscode.window.showWarningMessage(
            '⚠ Antigravity Hub: All accounts and models have exhausted their credits!',
            'Add Account',
            'Dismiss'
        );

        if (action === 'Add Account') {
            // Trigger the add account command
            vscode.commands.executeCommand('antigravityHub.addAccount');
        }

        return {
            switched: false,
            type: 'exhausted',
            from: currentAccount.email,
            to: '',
            reason
        };
    }

    /**
     * Finds the next account with available credits.
     * 
     * Strategy depends on the preferHighestCredits setting:
     *   - true:  Pick the account with the MOST total credits
     *   - false: Pick the NEXT account in the list order
     * 
     * @param currentAccount - The current active account (to exclude)
     * @param allAccounts    - All available accounts
     * @returns The next available account, or null if all exhausted
     */
    private findNextAccount(
        currentAccount: AccountData,
        allAccounts: AccountData[]
    ): AccountData | null {
        // Filter out the current account and accounts with 0 total credits
        const candidates = allAccounts.filter(account => {
            if (account.id === currentAccount.id) {
                return false;
            }
            return getTotalCredits(account.models) > 0;
        });

        if (candidates.length === 0) {
            return null;
        }

        // Re-read preference from settings
        const config = vscode.workspace.getConfiguration('antigravityHub');
        const preferHighest = config.get<boolean>('autoSwitch.preferHighestCredits', true);

        if (preferHighest) {
            // ── Strategy: Pick account with most total credits ──
            return candidates.reduce((best, account) => {
                const bestCredits = getTotalCredits(best.models);
                const accountCredits = getTotalCredits(account.models);
                return accountCredits > bestCredits ? account : best;
            }, candidates[0]);
        } else {
            // ── Strategy: Pick next account in list order ──
            const currentIndex = allAccounts.findIndex(a => a.id === currentAccount.id);
            for (let i = 1; i < allAccounts.length; i++) {
                const nextIndex = (currentIndex + i) % allAccounts.length;
                const candidate = allAccounts[nextIndex];
                if (getTotalCredits(candidate.models) > 0) {
                    return candidate;
                }
            }
            return null;
        }
    }

    /**
     * Finds the best model for an account (highest credits).
     * Used when switching to a new account to pick the starting model.
     * 
     * @param account - The account to evaluate
     * @returns The model name with the most credits, or null
     */
    private getBestModelForAccount(account: AccountData): string | null {
        let bestModel: string | null = null;
        let bestCredits = 0;

        for (const [model, credits] of Object.entries(account.models)) {
            if (credits > bestCredits) {
                bestCredits = credits;
                bestModel = model;
            }
        }

        return bestModel;
    }

    /**
     * Refreshes settings from VS Code configuration.
     * Call this when settings are changed via the sidebar.
     */
    refreshSettings(): void {
        const config = vscode.workspace.getConfiguration('antigravityHub');
        this.showNotifications = config.get<boolean>('autoSwitch.showNotifications', true);
        this.preferHighestCredits = config.get<boolean>('autoSwitch.preferHighestCredits', true);
    }
}

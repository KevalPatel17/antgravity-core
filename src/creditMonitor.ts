/**
 * ═══════════════════════════════════════════════════════════════
 * Credit Monitor & Account Store
 * ═══════════════════════════════════════════════════════════════
 * 
 * Manages connected Google accounts, refreshes live credits from Google
 * APIs at configurable intervals, and notifies the UI.
 */

import * as vscode from 'vscode';
import { AuthService } from './auth';
import { BalanceService } from './balanceService';

// ─── Types ───────────────────────────────────────────────────

export interface ClaudeGptQuota {
    weeklyRemainingText: string;
    weeklyPercent?: number;
}

export interface GeminiQuota {
    weeklyPercent: number;
    fiveHourPercent: number;
}

export interface AccountData {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    isActive: boolean;
    models: Record<string, number>;
    claudeGpt: ClaudeGptQuota;
    gemini: GeminiQuota;
    refreshIn: string;
}

export type CreditLowCallback = (
    account: AccountData,
    model: string,
    credits: number
) => void;

export type CreditsUpdatedCallback = (accounts: AccountData[]) => void;

const ACCOUNTS_STORAGE_KEY = 'antigravityCore.accounts';

export class CreditMonitor {
    private intervalHandle: NodeJS.Timeout | undefined;
    private _isMonitoring: boolean = false;
    public onCreditLow: CreditLowCallback | undefined;
    public onCreditsUpdated: CreditsUpdatedCallback | undefined;
    private threshold: number;
    private intervalMs: number;
    private _cachedAccounts: AccountData[] = [];
    private globalState?: vscode.Memento;
    private _isChecking: boolean = false;

    constructor(globalState?: vscode.Memento) {
        this.globalState = globalState;
        const config = vscode.workspace.getConfiguration('antigravityHub');
        this.threshold = config.get<number>('autoSwitch.creditThreshold', 5);
        this.intervalMs = (config.get<number>('autoSwitch.checkIntervalSeconds', 30)) * 1000;
    }

    get isMonitoring(): boolean {
        return this._isMonitoring;
    }

    get cachedAccounts(): AccountData[] {
        return this._cachedAccounts;
    }

    startMonitoring(intervalMs?: number): void {
        this.stopMonitoring();

        if (intervalMs !== undefined) {
            this.intervalMs = intervalMs;
        }

        this._isMonitoring = true;
        this.checkActiveAccountCredits();

        this.intervalHandle = setInterval(() => {
            this.checkActiveAccountCredits();
        }, this.intervalMs);
    }

    stopMonitoring(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
        }
        this._isMonitoring = false;
    }

    async checkActiveAccountCredits(): Promise<void> {
        if (this._isChecking) {
            return;
        }

        this._isChecking = true;
        try {
            const accounts = await this.readAccountsFromDB();

            // Refresh live quotas for active account if refreshToken exists
            const activeAccount = accounts.find(a => a.isActive);
            if (activeAccount && activeAccount.refreshToken) {
                try {
                    const freshAccessToken = await AuthService.refreshAccessToken(activeAccount.refreshToken);
                    activeAccount.accessToken = freshAccessToken;

                    const liveQuotas = await BalanceService.fetchLiveQuotas(freshAccessToken);
                    activeAccount.models = liveQuotas.models;
                    activeAccount.claudeGpt = liveQuotas.claudeGpt;
                    activeAccount.gemini = liveQuotas.gemini;

                    await this.saveAccounts(accounts);
                } catch (e) {
                    console.log('[CreditMonitor] Quota refresh error:', e);
                }
            }

            this._cachedAccounts = accounts;

            if (this.onCreditsUpdated) {
                this.onCreditsUpdated(accounts);
            }

            if (!activeAccount) {
                return;
            }

            const config = vscode.workspace.getConfiguration('antigravityHub');
            this.threshold = config.get<number>('autoSwitch.creditThreshold', 5);

            // Check if all models on active account are exhausted
            const totalCredits = Object.values(activeAccount.models || {}).reduce((a, b) => a + b, 0);
            if (totalCredits <= this.threshold && Object.keys(activeAccount.models || {}).length > 0) {
                if (this.onCreditLow) {
                    const firstModel = Object.keys(activeAccount.models)[0];
                    this.onCreditLow(activeAccount, firstModel, totalCredits);
                }
            }
        } catch (error) {
            console.error('[Antigravity Core] Error checking credits:', error);
        } finally {
            this._isChecking = false;
        }
    }

    updateInterval(seconds: number): void {
        this.intervalMs = Math.max(10, seconds) * 1000;
        if (this._isMonitoring) {
            this.startMonitoring(this.intervalMs);
        }
    }

    updateThreshold(threshold: number): void {
        this.threshold = threshold;
    }

    async addAccount(account: AccountData): Promise<void> {
        const accounts = await this.readAccountsFromDB();
        
        // If account with same email already exists, update it
        const existingIndex = accounts.findIndex(a => a.email.toLowerCase() === account.email.toLowerCase());
        if (existingIndex !== -1) {
            accounts[existingIndex] = { ...accounts[existingIndex], ...account, isActive: true };
            accounts.forEach((a, idx) => { if (idx !== existingIndex) a.isActive = false; });
        } else {
            accounts.forEach(a => { a.isActive = false; });
            accounts.push(account);
        }

        await this.saveAccounts(accounts);
        await this.checkActiveAccountCredits();
    }

    async removeAccount(accountId: string): Promise<void> {
        let accounts = await this.readAccountsFromDB();
        const removedWasActive = accounts.find(a => a.id === accountId)?.isActive;
        accounts = accounts.filter(a => a.id !== accountId);

        if (removedWasActive && accounts.length > 0) {
            accounts[0].isActive = true;
        }

        await this.saveAccounts(accounts);
        await this.checkActiveAccountCredits();
    }

    async setActiveAccount(accountId: string): Promise<void> {
        const accounts = await this.readAccountsFromDB();
        accounts.forEach(a => {
            a.isActive = (a.id === accountId);
        });
        await this.saveAccounts(accounts);
        await this.checkActiveAccountCredits();
    }

    async saveAccounts(accounts: AccountData[]): Promise<void> {
        this._cachedAccounts = accounts;
        if (this.globalState) {
            await this.globalState.update(ACCOUNTS_STORAGE_KEY, accounts);
        }
    }

    public async readAccountsFromDB(): Promise<AccountData[]> {
        if (this.globalState) {
            const saved = this.globalState.get<AccountData[]>(ACCOUNTS_STORAGE_KEY, []);
            if (Array.isArray(saved)) {
                return saved;
            }
        }
        return [];
    }

    dispose(): void {
        this.stopMonitoring();
    }
}

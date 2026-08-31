/**
 * ═══════════════════════════════════════════════════════════════
 * Antigravity Core — Extension Entry Point
 * ═══════════════════════════════════════════════════════════════
 * 
 * Main entry point for the VS Code extension. This file:
 *   1. Registers the sidebar webview provider
 *   2. Registers all commands
 *   3. Starts the credit monitor
 *   4. Creates the status bar item
 *   5. Wires all components together
 * 
 * Activation: onStartupFinished (runs when VS Code is ready)
 */

import * as vscode from 'vscode';
import { AntigravityWebviewProvider, SIDEBAR_VIEW_ID } from './webviewProvider';
import { CreditMonitor, AccountData } from './creditMonitor';
import { AutoSwitchEngine } from './autoSwitch';
import { SwitchHistory } from './historyLog';
import { StatusBarManager } from './statusBar';
import { saveModelPriority } from './modelPriority';
import { AuthService } from './auth';

// ─── Extension State ─────────────────────────────────────────

/** Global references to core components (for cleanup on deactivate) */
let creditMonitor: CreditMonitor | undefined;
let statusBarManager: StatusBarManager | undefined;
let autoSwitchEngine: AutoSwitchEngine | undefined;
let switchHistory: SwitchHistory | undefined;
let webviewProvider: AntigravityWebviewProvider | undefined;

// ─── Activate ────────────────────────────────────────────────

/**
 * Called when the extension is activated.
 * Sets up all components and wires them together.
 * 
 * @param context - The extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('[Antigravity Core] Extension activating...');

    try {
        // ══════════════════════════════════════════════════════════
        // 1. Initialize Core Components
        // ══════════════════════════════════════════════════════════

        // Create the switch history logger (uses globalState for persistence)
        switchHistory = new SwitchHistory(context.globalState);

        // Create the status bar manager (shows account/model/credits)
        statusBarManager = new StatusBarManager();
        context.subscriptions.push({ dispose: () => statusBarManager?.dispose() });

        // Create the auto-switch engine (decision tree)
        autoSwitchEngine = new AutoSwitchEngine(switchHistory, statusBarManager);

        // Create the credit monitor with globalState for persistent account storage
        creditMonitor = new CreditMonitor(context.globalState);
        context.subscriptions.push({ dispose: () => creditMonitor?.dispose() });

        console.log('[Antigravity Core] Core components initialized successfully');

        // ══════════════════════════════════════════════════════════
        // 2. Register Webview Provider (Sidebar Panel)
        // ══════════════════════════════════════════════════════════

        webviewProvider = new AntigravityWebviewProvider(context.extensionUri);

    // Register the provider for the sidebar view
    const webviewRegistration = vscode.window.registerWebviewViewProvider(
        SIDEBAR_VIEW_ID,
        webviewProvider,
        {
            // Keep the webview alive when it's not visible (preserves state)
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    context.subscriptions.push(webviewRegistration);

    // ══════════════════════════════════════════════════════════
    // 3. Wire Up Webview Callbacks
    // ══════════════════════════════════════════════════════════

    webviewProvider.callbacks = {
        /**
         * Toggle auto-switch on/off from the sidebar toggle.
         */
        onToggleAutoSwitch: (enabled: boolean) => {
            const config = vscode.workspace.getConfiguration('antigravityHub');
            config.update('autoSwitch.enabled', enabled, vscode.ConfigurationTarget.Global);

            if (enabled) {
                creditMonitor?.startMonitoring();
                vscode.window.showInformationMessage('⚡ Auto Switch enabled');
            } else {
                creditMonitor?.stopMonitoring();
                vscode.window.showInformationMessage('⚡ Auto Switch disabled');
            }

            // Update the webview status
            webviewProvider?.updateAutoSwitchStatus(
                enabled,
                creditMonitor?.isMonitoring ?? false,
                config.get<number>('autoSwitch.checkIntervalSeconds', 30)
            );
        },

        /**
         * Activate a specific account from the sidebar.
         */
        onActivateAccount: async (accountId: string) => {
            await creditMonitor?.setActiveAccount(accountId);
            refreshAll();
            const account = creditMonitor?.cachedAccounts.find(a => a.id === accountId);
            if (account) {
                vscode.window.showInformationMessage(`⚡ Active account set to: ${account.email}`);
            }
        },

        /**
         * Remove an account from the sidebar.
         */
        onRemoveAccount: async (accountId: string) => {
            const account = creditMonitor?.cachedAccounts.find(a => a.id === accountId);
            if (!account) {
                return;
            }

            const answer = await vscode.window.showWarningMessage(
                `Remove account "${account.email}" from Antigravity Core?`,
                { modal: true },
                'Remove'
            );

            if (answer === 'Remove') {
                await creditMonitor?.removeAccount(accountId);
                refreshAll();
                vscode.window.showInformationMessage(`⚡ Removed account: ${account.email}`);
            }
        },

        /**
         * Save settings from the sidebar settings panel.
         */
        onSaveSettings: async (settings) => {
            const config = vscode.workspace.getConfiguration('antigravityHub');

            await config.update(
                'autoSwitch.creditThreshold',
                settings.creditThreshold,
                vscode.ConfigurationTarget.Global
            );
            await config.update(
                'autoSwitch.checkIntervalSeconds',
                settings.checkInterval,
                vscode.ConfigurationTarget.Global
            );
            await config.update(
                'autoSwitch.preferHighestCredits',
                settings.preferHighestCredits,
                vscode.ConfigurationTarget.Global
            );
            await config.update(
                'autoSwitch.showNotifications',
                settings.showNotifications,
                vscode.ConfigurationTarget.Global
            );

            // Update monitor with new interval
            creditMonitor?.updateInterval(settings.checkInterval);
            creditMonitor?.updateThreshold(settings.creditThreshold);

            // Refresh engine settings
            autoSwitchEngine?.refreshSettings();

            vscode.window.showInformationMessage('⚡ Settings saved');
        },

        /**
         * Refresh all data from storage.
         */
        onRefresh: () => {
            refreshAll();
        },

        /**
         * Clear the switch history log.
         */
        onClearHistory: async () => {
            await switchHistory?.clearHistory();
            webviewProvider?.updateHistory([]);
            vscode.window.showInformationMessage('⚡ Switch history cleared');
        },

        /**
         * Add a new account (opens browser / Google sign-in directly).
         */
        onAddAccount: async () => {
            vscode.window.showInformationMessage('⚡ Opening browser to connect your Antigravity Google account...');
            
            const newAccount = await AuthService.loginWithBrowser();

            if (newAccount) {
                const accounts = (await creditMonitor?.readAccountsFromDB()) || [];
                const existingIdx = accounts.findIndex(
                    a => a.email.toLowerCase() === newAccount.email.toLowerCase()
                );

                if (existingIdx >= 0) {
                    accounts.forEach(a => { a.isActive = false; });
                    accounts[existingIdx] = {
                        ...accounts[existingIdx],
                        ...newAccount,
                        isActive: true
                    };
                    await creditMonitor?.saveAccounts(accounts);
                } else {
                    await creditMonitor?.addAccount(newAccount);
                }

                await creditMonitor?.checkActiveAccountCredits();
                refreshAll();
                vscode.window.showInformationMessage(`⚡ Connected Google Account: ${newAccount.email}`);
            }
        },

        /**
         * Export all sessions to a JSON file.
         */
        onExportAll: async () => {
            const accounts = creditMonitor?.cachedAccounts ?? [];
            const history = switchHistory?.getHistory() ?? [];

            const exportData = {
                exportedAt: new Date().toISOString(),
                accounts,
                history,
                version: '1.0.0'
            };

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('antigravity-core-export.json'),
                filters: { 'JSON Files': ['json'] }
            });

            if (uri) {
                const content = JSON.stringify(exportData, null, 2);
                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(content, 'utf8')
                );
                vscode.window.showInformationMessage(
                    `⚡ Exported ${accounts.length} accounts to ${uri.fsPath}`
                );
            }
        },

        /**
         * Import sessions from a JSON file.
         */
        onImport: async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectMany: false,
                filters: { 'JSON Files': ['json'] }
            });

            if (uris && uris.length > 0) {
                try {
                    const content = await vscode.workspace.fs.readFile(uris[0]);
                    const data = JSON.parse(Buffer.from(content).toString('utf8'));

                    if (data && Array.isArray(data.accounts)) {
                        await creditMonitor?.saveAccounts(data.accounts);
                        refreshAll();
                        vscode.window.showInformationMessage(
                            `⚡ Imported ${data.accounts.length} accounts successfully.`
                        );
                    } else {
                        vscode.window.showWarningMessage('⚠ No valid accounts array found in JSON file.');
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(
                        '⚠ Failed to import: Invalid JSON file.'
                    );
                }
            }
        },

        /**
         * Reorder model priority from the sidebar drag-and-drop.
         */
        onReorderModels: async (order: string[]) => {
            await saveModelPriority(order);
            vscode.window.showInformationMessage('⚡ Model priority updated');
        }
    };

    // ══════════════════════════════════════════════════════════
    // 4. Wire Up Credit Monitor Callbacks
    // ══════════════════════════════════════════════════════════

    /**
     * When credits are updated (any poll), refresh the webview.
     */
    creditMonitor.onCreditsUpdated = (accounts: AccountData[]) => {
        const activeAccount = accounts.find(a => a.isActive);

        // Update webview with latest account data
        webviewProvider?.updateAccounts(
            accounts,
            activeAccount?.id ?? ''
        );

        // Update status bar with active account info
        if (activeAccount && statusBarManager) {
            const firstModel = Object.keys(activeAccount.models)[0] || 'claude-sonnet';
            const firstCredits = activeAccount.models[firstModel] ?? 0;
            statusBarManager.update(activeAccount.email, firstModel, firstCredits);
        } else if (statusBarManager) {
            statusBarManager.showEmpty();
        }
    };

    /**
     * When credits drop below threshold, trigger auto-switch.
     */
    creditMonitor.onCreditLow = async (
        account: AccountData,
        model: string,
        credits: number
    ) => {
        if (!autoSwitchEngine) {
            return;
        }

        const allAccounts = creditMonitor?.cachedAccounts ?? [];
        const result = await autoSwitchEngine.smartSwitch(account, model, allAccounts);

        // Notify the webview of the switch event
        if (result.switched) {
            webviewProvider?.notifySwitchEvent(
                result.from,
                result.to,
                result.reason,
                result.type
            );

            // Update history in the webview
            const history = switchHistory?.getHistory() ?? [];
            webviewProvider?.updateHistory(history);
        }
    };

    // ══════════════════════════════════════════════════════════
    // 5. Register Commands
    // ══════════════════════════════════════════════════════════

    // Refresh command — re-fetch all credit data
    const refreshCmd = vscode.commands.registerCommand(
        'antigravityHub.refresh',
        () => {
            refreshAll();
            vscode.window.showInformationMessage('⚡ Antigravity Core refreshed');
        }
    );
    context.subscriptions.push(refreshCmd);

    // Toggle auto-switch command
    const toggleCmd = vscode.commands.registerCommand(
        'antigravityHub.toggleAutoSwitch',
        () => {
            const isMonitoring = creditMonitor?.isMonitoring ?? false;
            if (isMonitoring) {
                creditMonitor?.stopMonitoring();
                vscode.window.showInformationMessage('⚡ Auto Switch disabled');
            } else {
                creditMonitor?.startMonitoring();
                vscode.window.showInformationMessage('⚡ Auto Switch enabled');
            }

            // Update webview status
            const config = vscode.workspace.getConfiguration('antigravityHub');
            webviewProvider?.updateAutoSwitchStatus(
                !isMonitoring,
                creditMonitor?.isMonitoring ?? false,
                config.get<number>('autoSwitch.checkIntervalSeconds', 30)
            );
        }
    );
    context.subscriptions.push(toggleCmd);

    // Add account command
    const addAccountCmd = vscode.commands.registerCommand(
        'antigravityHub.addAccount',
        () => {
            webviewProvider?.callbacks.onAddAccount?.();
        }
    );
    context.subscriptions.push(addAccountCmd);

    // Export all command
    const exportCmd = vscode.commands.registerCommand(
        'antigravityHub.exportAll',
        () => {
            webviewProvider?.callbacks.onExportAll?.();
        }
    );
    context.subscriptions.push(exportCmd);

    // ══════════════════════════════════════════════════════════
    // 6. Start Monitoring (if enabled in settings)
    // ══════════════════════════════════════════════════════════

    const config = vscode.workspace.getConfiguration('antigravityHub');
    const autoSwitchEnabled = config.get<boolean>('autoSwitch.enabled', true);

    if (autoSwitchEnabled) {
        creditMonitor.startMonitoring();
    } else {
        // Initial load without active interval
        creditMonitor.checkActiveAccountCredits();
    }

    // ══════════════════════════════════════════════════════════
    // 7. Listen for Configuration Changes
    // ══════════════════════════════════════════════════════════

    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('antigravityHub')) {
            const config = vscode.workspace.getConfiguration('antigravityHub');

            const enabled = config.get<boolean>('autoSwitch.enabled', true);
            const interval = config.get<number>('autoSwitch.checkIntervalSeconds', 30);
            const threshold = config.get<number>('autoSwitch.creditThreshold', 5);

            creditMonitor?.updateInterval(interval);
            creditMonitor?.updateThreshold(threshold);
            autoSwitchEngine?.refreshSettings();

            webviewProvider?.updateAutoSwitchStatus(
                enabled,
                creditMonitor?.isMonitoring ?? false,
                interval
            );
        }
    });
        context.subscriptions.push(configChangeListener);

        console.log('[Antigravity Core] Extension activated successfully!');
    } catch (err) {
        console.error('[Antigravity Core] Error during activation:', err);
    }
}

// ─── Helper Functions ────────────────────────────────────────

/**
 * Refreshes all data by triggering a credit check and updating the webview.
 */
function refreshAll(): void {
    creditMonitor?.checkActiveAccountCredits();

    const history = switchHistory?.getHistory() ?? [];
    webviewProvider?.updateHistory(history);

    const config = vscode.workspace.getConfiguration('antigravityHub');
    webviewProvider?.updateAutoSwitchStatus(
        config.get<boolean>('autoSwitch.enabled', true),
        creditMonitor?.isMonitoring ?? false,
        config.get<number>('autoSwitch.checkIntervalSeconds', 30)
    );
}

// ─── Deactivate ──────────────────────────────────────────────

/**
 * Called when the extension is deactivated.
 * Cleans up all resources.
 */
export function deactivate(): void {
    console.log('[Antigravity Core] Extension deactivating...');

    creditMonitor?.dispose();
    statusBarManager?.dispose();

    creditMonitor = undefined;
    statusBarManager = undefined;
    autoSwitchEngine = undefined;
    switchHistory = undefined;
    webviewProvider = undefined;
}

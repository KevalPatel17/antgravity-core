/**
 * ═══════════════════════════════════════════════════════════════
 * Antigravity Hub — Webview Provider
 * ═══════════════════════════════════════════════════════════════
 * 
 * Implements VS Code's WebviewViewProvider to host the sidebar
 * panel UI. This class bridges the webview (HTML/CSS/JS) with
 * the extension's TypeScript logic via postMessage communication.
 * 
 * Message Flow:
 *   Webview ──(postMessage)──▶ Provider ──▶ Extension Logic
 *   Extension Logic ──▶ Provider ──(postMessage)──▶ Webview
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ─── View ID ─────────────────────────────────────────────────

/** The view ID must match the one in package.json contributes.views */
export const SIDEBAR_VIEW_ID = 'antigravityHub.sidebarView';

// ─── Message Types (Extension → Webview) ─────────────────────

export interface UpdateAccountsMessage {
    type: 'updateAccounts';
    accounts: any[];
    activeAccountId: string;
}

export interface UpdateHistoryMessage {
    type: 'updateHistory';
    history: any[];
}

export interface AutoSwitchStatusMessage {
    type: 'autoSwitchStatus';
    enabled: boolean;
    monitoring: boolean;
    interval: number;
}

export interface SwitchEventMessage {
    type: 'switchEvent';
    from: string;
    to: string;
    reason: string;
    switchType: string;
}

export type OutboundMessage =
    | UpdateAccountsMessage
    | UpdateHistoryMessage
    | AutoSwitchStatusMessage
    | SwitchEventMessage;

// ─── Message Types (Webview → Extension) ─────────────────────

export interface ToggleAutoSwitchMessage {
    type: 'toggleAutoSwitch';
    enabled: boolean;
}

export interface ActivateAccountMessage {
    type: 'activateAccount';
    accountId: string;
}

export interface SaveSettingsMessage {
    type: 'saveSettings';
    settings: {
        creditThreshold: number;
        checkInterval: number;
        preferHighestCredits: boolean;
        showNotifications: boolean;
    };
}

export interface ReorderModelsMessage {
    type: 'reorderModels';
    order: string[];
}

export interface SimpleMessage {
    type: 'refresh' | 'clearHistory' | 'addAccount' | 'exportAll' | 'import';
}

export type InboundMessage =
    | ToggleAutoSwitchMessage
    | ActivateAccountMessage
    | SaveSettingsMessage
    | ReorderModelsMessage
    | SimpleMessage;

// ─── Callback Types ──────────────────────────────────────────

/** Callbacks the extension registers to handle webview messages */
export interface WebviewCallbacks {
    onToggleAutoSwitch: (enabled: boolean) => void;
    onActivateAccount: (accountId: string) => void;
    onSaveSettings: (settings: SaveSettingsMessage['settings']) => void;
    onRefresh: () => void;
    onClearHistory: () => void;
    onAddAccount: () => void;
    onExportAll: () => void;
    onImport: () => void;
    onReorderModels: (order: string[]) => void;
}

// ─── AntigravityWebviewProvider ──────────────────────────────

/**
 * Provides the sidebar webview panel for the Antigravity Hub.
 * 
 * Responsibilities:
 *   1. Load and display panel.html in the sidebar
 *   2. Handle messages from the webview UI
 *   3. Send data updates to the webview UI
 *   4. Manage the webview lifecycle
 * 
 * Usage:
 *   const provider = new AntigravityWebviewProvider(extensionUri);
 *   provider.callbacks = { onRefresh: () => { ... }, ... };
 *   vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, provider);
 */
export class AntigravityWebviewProvider implements vscode.WebviewViewProvider {
    /** The extension's root URI (for resolving resource paths) */
    private readonly extensionUri: vscode.Uri;

    /** The active webview view (set when the view becomes visible) */
    private _view?: vscode.WebviewView;

    /** Callbacks for handling messages from the webview */
    public callbacks: Partial<WebviewCallbacks> = {};

    /**
     * Creates a new AntigravityWebviewProvider.
     * 
     * @param extensionUri - The URI of the extension's root directory
     */
    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    /**
     * Called by VS Code when the webview view needs to be resolved.
     * This is where we set up the webview content and message handling.
     * 
     * @param webviewView  - The webview view to populate
     * @param context      - Context about how the view was resolved
     * @param token        - Cancellation token
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        // ── Configure webview options ──
        webviewView.webview.options = {
            // Allow scripts to run in the webview
            enableScripts: true,
            // Restrict resource loading to the extension directory
            localResourceRoots: [this.extensionUri]
        };

        // ── Load the HTML content ──
        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // ── Set up message handling from the webview ──
        webviewView.webview.onDidReceiveMessage(
            (message: InboundMessage) => this._handleMessage(message),
            undefined,
            []
        );

        // ── Handle view disposal ──
        webviewView.onDidDispose(() => {
            this._view = undefined;
        });

        // ── Handle view visibility changes ──
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // Refresh data when the view becomes visible
                if (this.callbacks.onRefresh) {
                    this.callbacks.onRefresh();
                }
            }
        });
    }

    /**
     * Sends a message to the webview.
     * Does nothing if the webview is not currently visible.
     * 
     * @param message - The message to send to the webview
     */
    postMessage(message: OutboundMessage): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * Sends updated account data to the webview.
     * 
     * @param accounts       - Array of all account data
     * @param activeAccountId - ID of the currently active account
     */
    updateAccounts(accounts: any[], activeAccountId: string): void {
        this.postMessage({
            type: 'updateAccounts',
            accounts,
            activeAccountId
        });
    }

    /**
     * Sends updated switch history to the webview.
     * 
     * @param history - Array of history entries
     */
    updateHistory(history: any[]): void {
        this.postMessage({
            type: 'updateHistory',
            history
        });
    }

    /**
     * Sends the current auto-switch status to the webview.
     * 
     * @param enabled    - Whether auto-switch is enabled in settings
     * @param monitoring - Whether the monitor is actively polling
     * @param interval   - Current polling interval in seconds
     */
    updateAutoSwitchStatus(enabled: boolean, monitoring: boolean, interval: number): void {
        this.postMessage({
            type: 'autoSwitchStatus',
            enabled,
            monitoring,
            interval
        });
    }

    /**
     * Notifies the webview of a switch event (for real-time UI updates).
     * 
     * @param from       - What was switched from
     * @param to         - What was switched to
     * @param reason     - Reason for the switch
     * @param switchType - 'model', 'account', or 'warning'
     */
    notifySwitchEvent(from: string, to: string, reason: string, switchType: string): void {
        this.postMessage({
            type: 'switchEvent',
            from,
            to,
            reason,
            switchType
        });
    }

    /**
     * Whether the webview is currently visible/active.
     */
    get isVisible(): boolean {
        return this._view?.visible ?? false;
    }

    // ─── Private Methods ─────────────────────────────────────

    /**
     * Handles incoming messages from the webview.
     * Routes each message type to the appropriate callback.
     * 
     * @param message - The message received from the webview
     */
    private _handleMessage(message: InboundMessage): void {
        switch (message.type) {
            case 'toggleAutoSwitch':
                if (this.callbacks.onToggleAutoSwitch) {
                    this.callbacks.onToggleAutoSwitch(
                        (message as ToggleAutoSwitchMessage).enabled
                    );
                }
                break;

            case 'activateAccount':
                if (this.callbacks.onActivateAccount) {
                    this.callbacks.onActivateAccount(
                        (message as ActivateAccountMessage).accountId
                    );
                }
                break;

            case 'saveSettings':
                if (this.callbacks.onSaveSettings) {
                    this.callbacks.onSaveSettings(
                        (message as SaveSettingsMessage).settings
                    );
                }
                break;

            case 'reorderModels':
                if (this.callbacks.onReorderModels) {
                    this.callbacks.onReorderModels(
                        (message as ReorderModelsMessage).order
                    );
                }
                break;

            case 'refresh':
                if (this.callbacks.onRefresh) {
                    this.callbacks.onRefresh();
                }
                break;

            case 'clearHistory':
                if (this.callbacks.onClearHistory) {
                    this.callbacks.onClearHistory();
                }
                break;

            case 'addAccount':
                if (this.callbacks.onAddAccount) {
                    this.callbacks.onAddAccount();
                }
                break;

            case 'exportAll':
                if (this.callbacks.onExportAll) {
                    this.callbacks.onExportAll();
                }
                break;

            case 'import':
                if (this.callbacks.onImport) {
                    this.callbacks.onImport();
                }
                break;

            default:
                console.warn('[Antigravity Hub] Unknown message type:', (message as any).type);
        }
    }

    /**
     * Loads the panel.html file and returns its content.
     * 
     * In development, reads from the src/webview directory.
     * The HTML is loaded as-is since it contains embedded CSS and JS.
     * 
     * @param webview - The webview instance (for generating URIs if needed)
     * @returns The HTML string for the webview
     */
    private _getHtmlContent(webview: vscode.Webview): string {
        // Resolve the path to panel.html
        const htmlPath = path.join(
            this.extensionUri.fsPath,
            'src',
            'webview',
            'panel.html'
        );

        try {
            // Read the HTML file from disk
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');

            // If we need to inject any VS Code specific resources in the future,
            // we can modify the HTML content here. For example:
            // const styleUri = webview.asWebviewUri(
            //     vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'styles.css')
            // );
            // htmlContent = htmlContent.replace('{{styleUri}}', styleUri.toString());

            return htmlContent;
        } catch (error) {
            // Fallback: return a simple error message
            console.error('[Antigravity Hub] Failed to load panel.html:', error);
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            background: #0D1117;
                            color: #E6EDF3;
                            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            text-align: center;
                        }
                        .error { color: #DC2626; font-size: 13px; }
                    </style>
                </head>
                <body>
                    <div>
                        <p class="error">⚠ Failed to load Antigravity Hub panel.</p>
                        <p style="color: #8B949E; font-size: 11px;">
                            Check that panel.html exists in src/webview/
                        </p>
                    </div>
                </body>
                </html>
            `;
        }
    }
}

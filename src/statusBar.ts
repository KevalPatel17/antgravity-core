/**
 * ═══════════════════════════════════════════════════════════════
 * Status Bar Manager
 * ═══════════════════════════════════════════════════════════════
 * 
 * Manages the VS Code status bar item that displays the current
 * account, active model, and credit count at a glance.
 * 
 * Features:
 *   - Color-coded credit display (green/amber/red)
 *   - Animated "Switching..." indicator during transitions
 *   - Click to open the Antigravity Hub sidebar
 */

import * as vscode from 'vscode';

// ─── Constants ───────────────────────────────────────────────

/** Status bar priority — higher number = more to the left */
const STATUS_BAR_PRIORITY = 100;

/** Duration (ms) to show the switching animation */
const SWITCH_ANIMATION_DURATION = 2000;

// ─── Color Thresholds ────────────────────────────────────────

/** Credits above this value show green */
const GREEN_THRESHOLD = 20;
/** Credits at or below this value (but > 0) show amber */
const AMBER_THRESHOLD = 20;
// Credits at 0 show red

// ─── StatusBarManager Class ──────────────────────────────────

/**
 * Creates and manages a VS Code status bar item showing
 * the current Antigravity account status at a glance.
 * 
 * Usage:
 *   const statusBar = new StatusBarManager();
 *   statusBar.update('user@gmail.com', 'claude-sonnet', 45);
 *   statusBar.showSwitchAnimation();
 *   statusBar.dispose();
 */
export class StatusBarManager {
    /** The VS Code status bar item instance */
    private statusBarItem: vscode.StatusBarItem;

    /** Timer handle for clearing the switch animation */
    private animationTimer: NodeJS.Timeout | undefined;

    /** Stored values for restoring after animation */
    private lastAccount: string = '';
    private lastModel: string = '';
    private lastCredits: number = 0;

    /**
     * Creates a new StatusBarManager and registers the status bar item.
     * The item appears on the left side of the status bar.
     */
    constructor() {
        // Create a status bar item on the left side
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            STATUS_BAR_PRIORITY
        );

        // Clicking the status bar item opens the Antigravity Hub sidebar
        this.statusBarItem.command = 'antigravityHub.refresh';

        // Set initial state
        this.statusBarItem.text = '$(zap) Antigravity Hub';
        this.statusBarItem.tooltip = 'Antigravity Hub — Click to refresh';

        // Show the item immediately
        this.statusBarItem.show();
    }

    /**
     * Updates the status bar with current account, model, and credit info.
     * 
     * Display format: "⚡ model-name · 45 credits"
     * 
     * Color coding:
     *   - Green:  credits > 20 (healthy)
     *   - Amber:  credits 1-20 (getting low)
     *   - Red:    credits = 0  (exhausted)
     * 
     * @param account - Current active account email
     * @param model   - Current active model name
     * @param credits - Remaining credits for the active model
     */
    update(account: string, model: string, credits: number): void {
        // Store values for restoration after animation
        this.lastAccount = account;
        this.lastModel = model;
        this.lastCredits = credits;

        // Format the display text
        // Using $(zap) codicon for the lightning bolt
        this.statusBarItem.text = `$(zap) ${model} · ${credits}`;

        // Build a detailed tooltip
        this.statusBarItem.tooltip = new vscode.MarkdownString(
            `**Antigravity Hub**\n\n` +
            `Account: \`${account}\`\n\n` +
            `Model: \`${model}\`\n\n` +
            `Credits: **${credits}** remaining`
        );

        // Apply color based on credit level
        this.statusBarItem.backgroundColor = this.getCreditColor(credits);

        // Ensure the item is visible
        this.statusBarItem.show();
    }

    /**
     * Shows a brief "Switching..." animation in the status bar.
     * Used when an auto-switch is in progress. The animation
     * displays for SWITCH_ANIMATION_DURATION ms, then restores
     * the previous state.
     */
    showSwitchAnimation(): void {
        // Clear any existing animation timer
        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
        }

        // Show the switching animation
        this.statusBarItem.text = '$(sync~spin) Switching...';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.warningBackground'
        );

        // Restore previous state after the animation duration
        this.animationTimer = setTimeout(() => {
            this.update(this.lastAccount, this.lastModel, this.lastCredits);
            this.animationTimer = undefined;
        }, SWITCH_ANIMATION_DURATION);
    }

    /**
     * Shows a warning state in the status bar when all credits are exhausted.
     */
    showExhausted(): void {
        this.statusBarItem.text = '$(warning) No Credits';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.errorBackground'
        );
        this.statusBarItem.tooltip = new vscode.MarkdownString(
            '**⚠ Antigravity Hub**\n\nAll accounts and models have exhausted their credits.'
        );
    }

    /**
     * Determines the status bar background color based on credit count.
     * 
     * @param credits - The current credit count
     * @returns The appropriate ThemeColor for the credit level
     */
    private getCreditColor(credits: number): vscode.ThemeColor | undefined {
        if (credits <= 0) {
            // Red — exhausted
            return new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (credits <= AMBER_THRESHOLD) {
            // Amber — getting low
            return new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            // Green / default — healthy, no special background
            return undefined;
        }
    }

    /**
     * Disposes the status bar item and cleans up timers.
     * Called when the extension is deactivated.
     */
    dispose(): void {
        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
        }
        this.statusBarItem.dispose();
    }
}

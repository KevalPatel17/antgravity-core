/**
 * ═══════════════════════════════════════════════════════════════
 * Antigravity Local State & Quota Reader
 * ═══════════════════════════════════════════════════════════════
 * 
 * Provides default model quotas for newly connected accounts
 * without any hardcoded user names or emails.
 */

import { ClaudeGptQuota, GeminiQuota } from './creditMonitor';

export class AntigravityReader {
    /**
     * Returns standard Antigravity model quotas.
     */
    public static getDefaultQuotas(): {
        claudeGpt: ClaudeGptQuota;
        gemini: GeminiQuota;
        models: Record<string, number>;
    } {
        return {
            claudeGpt: {
                weeklyRemainingText: 'Renews in 1 day',
                weeklyPercent: 0
            },
            gemini: {
                weeklyPercent: 98,
                fiveHourPercent: 93
            },
            models: {
                'gemini-pro': 98,
                'gemini-flash': 93,
                'claude-sonnet': 0,
                'claude-haiku': 0
            }
        };
    }
}

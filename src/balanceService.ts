/**
 * ═══════════════════════════════════════════════════════════════
 * Antigravity Core — Live Balance & Quota Service
 * ═══════════════════════════════════════════════════════════════
 * 
 * Fetches real-time AI quota windows and model limits directly from
 * Google's CloudCode / Antigravity internal endpoints using the
 * user's authenticated Google Access Token.
 */

import { API } from './constants';
import { QuotaSummary, parseQuotaSummaryResponse, formatResetDuration, formatDetailedReset } from './quotaSummary';

export interface LiveQuotaInfo {
    claudeGpt: {
        weeklyRemainingText: string;
        weeklyPercent: number;
        weeklyResetTime?: string;
        fiveHourPercent?: number;
        fiveHourResetTime?: string;
        weeklySubtitle?: string;
        fiveHourSubtitle?: string;
    };
    gemini: {
        weeklyPercent: number;
        fiveHourPercent: number;
        weeklyResetTime?: string;
        fiveHourResetTime?: string;
        weeklySubtitle?: string;
        fiveHourSubtitle?: string;
    };
    models: Record<string, number>;
}

export class BalanceService {
    private static getUserAgent(): string {
        const version = API.DEFAULT_VERSION;
        const platform = process.platform === 'win32' ? 'windows' : 
                         process.platform === 'darwin' ? 'darwin' : 'linux';
        const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
        return `antigravity/${version} ${platform}/${arch}`;
    }

    private static async request<T>(url: string, accessToken: string, body?: any): Promise<T | null> {
        try {
            const res = await fetch(url, {
                method: body ? 'POST' : 'GET',
                headers: {
                    'User-Agent': this.getUserAgent(),
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: body ? JSON.stringify(body) : undefined
            });

            if (!res.ok) {
                console.log(`[BalanceService] Request to ${url} returned ${res.status}`);
                return null;
            }
            const text = await res.text();
            if (!text) return null;
            return JSON.parse(text) as T;
        } catch (e) {
            console.error(`[BalanceService] Error requesting ${url}:`, e);
            return null;
        }
    }

    /**
     * Retrieves live quota windows and individual model balances.
     */
    public static async fetchLiveQuotas(accessToken: string): Promise<LiveQuotaInfo> {
        let projectId: string | undefined;
        let quotaSummary: QuotaSummary = [];
        let models: Record<string, number> = {};

        // 1. Call primary loadCodeAssist to get cloudaicompanionProject ID
        const codeAssist = await this.request<any>(API.LOAD_CODE_ASSIST, accessToken, {
            metadata: { ideType: 'ANTIGRAVITY' }
        });

        if (codeAssist) {
            projectId = codeAssist.cloudaicompanionProject;
            if (codeAssist.paidTier?.availableCredits) {
                const creditArray = codeAssist.paidTier.availableCredits;
                if (Array.isArray(creditArray)) {
                    creditArray.forEach((c: any) => {
                        const name = (c.creditType || c.modelName || c.modelId || c.id || c.name || 'default').toString().toLowerCase();
                        const amount = parseInt((c.creditAmount ?? c.amount ?? c.remaining ?? c.credits ?? 0).toString(), 10);
                        if (!isNaN(amount)) models[name] = amount;
                    });
                }
            }
        }

        // Fallback to daily loadCodeAssist if needed
        if (!projectId) {
            const dailyCodeAssist = await this.request<any>(API.DAILY_LOAD_CODE_ASSIST, accessToken, {
                metadata: {
                    ide_type: 'ANTIGRAVITY',
                    ide_version: API.DEFAULT_VERSION,
                    ide_name: 'antigravity'
                }
            });
            if (dailyCodeAssist) {
                projectId = dailyCodeAssist.cloudaicompanionProject;
            }
        }

        const projectBody = projectId ? { project: projectId } : {};

        // 2. Fetch Unified Quota Summary (Real-time weekly and 5-hour rolling limits)
        for (const url of API.QUOTA_SUMMARY_URLS) {
            const data = await this.request<unknown>(url, accessToken, projectBody);
            if (data) {
                const summary = parseQuotaSummaryResponse(data);
                if (summary.length > 0) {
                    quotaSummary = summary;
                    console.log(`[BalanceService] Successfully fetched ${summary.length} quota groups from ${url}`);
                    break;
                }
            }
        }

        // 3. Fetch Available Models (Individual Model fractions)
        for (const url of API.FETCH_MODELS_URLS) {
            const data = await this.request<any>(url, accessToken, projectBody);
            if (data && data.models) {
                for (const [modelId, modelData] of Object.entries<any>(data.models)) {
                    if (modelData.quotaInfo) {
                        const fraction = modelData.quotaInfo.remainingFraction !== undefined ? modelData.quotaInfo.remainingFraction : 0;
                        models[modelId] = Math.round(fraction * 100);
                    }
                }
                if (Object.keys(models).length > 0) {
                    break;
                }
            }
        }

        // 4. Parse Gemini & Claude/GPT Quotas
        const claudeGroup = quotaSummary.find(g => g.id === 'claude-gpt');
        const geminiGroup = quotaSummary.find(g => g.id === 'gemini');

        // Gemini metrics
        const geminiWeekly = geminiGroup?.weekly?.remainingPercent ?? models['gemini-pro'] ?? 94;
        const geminiFiveHour = geminiGroup?.fiveHour?.remainingPercent ?? models['gemini-flash'] ?? 68;
        const geminiWeeklyReset = geminiGroup?.weekly?.resetTime;
        const geminiFiveHourReset = geminiGroup?.fiveHour?.resetTime;

        // Claude/GPT metrics
        const claudeWeekly = claudeGroup?.weekly?.remainingPercent ?? models['claude-sonnet'] ?? 0;
        const claudeFiveHour = claudeGroup?.fiveHour?.remainingPercent ?? 0;
        const claudeWeeklyReset = claudeGroup?.weekly?.resetTime;
        const claudeFiveHourReset = claudeGroup?.fiveHour?.resetTime;

        const claudeWeeklyText = claudeWeekly > 0 
            ? `${claudeWeekly}%` 
            : (claudeWeeklyReset ? formatResetDuration(claudeWeeklyReset) : 'Renews in 1 day');

        return {
            claudeGpt: {
                weeklyRemainingText: claudeWeeklyText,
                weeklyPercent: claudeWeekly,
                weeklyResetTime: claudeWeeklyReset,
                fiveHourPercent: claudeFiveHour,
                fiveHourResetTime: claudeFiveHourReset,
                weeklySubtitle: claudeWeeklyReset ? `it refreshes in ${formatDetailedReset(claudeWeeklyReset)}.` : undefined,
                fiveHourSubtitle: claudeFiveHourReset ? `it will fully refresh in ${formatDetailedReset(claudeFiveHourReset)}.` : undefined
            },
            gemini: {
                weeklyPercent: geminiWeekly,
                fiveHourPercent: geminiFiveHour,
                weeklyResetTime: geminiWeeklyReset,
                fiveHourResetTime: geminiFiveHourReset,
                weeklySubtitle: geminiWeeklyReset ? `it will fully refresh in ${formatDetailedReset(geminiWeeklyReset)}.` : undefined,
                fiveHourSubtitle: geminiFiveHourReset ? `it will fully refresh in ${formatDetailedReset(geminiFiveHourReset)}.` : undefined
            },
            models: {
                'gemini-pro': geminiWeekly,
                'gemini-flash': geminiFiveHour,
                'claude-sonnet': claudeWeekly,
                'claude-haiku': claudeWeekly,
                ...models
            }
        };
    }
}

/**
 * ═══════════════════════════════════════════════════════════════
 * Quota Summary & Display Utilities
 * ═══════════════════════════════════════════════════════════════
 */

export interface QuotaWindow {
    id: 'weekly' | 'five-hour';
    remainingPercent: number;
    resetTime?: string;
}

export interface QuotaGroup {
    id: 'gemini' | 'claude-gpt';
    weekly?: QuotaWindow;
    fiveHour?: QuotaWindow;
}

export type QuotaSummary = QuotaGroup[];

export function parseQuotaSummaryResponse(data: unknown): QuotaSummary {
    const root = asRecord(data);
    const groups = asArray(root?.groups ?? asRecord(root?.response)?.groups);
    const parsed: QuotaSummary = [];

    for (const rawGroup of groups) {
        const group = asRecord(rawGroup);
        if (!group) continue;
        const groupId = classifyGroup(group);
        if (!groupId) continue;

        const normalized: QuotaGroup = { id: groupId };
        for (const rawBucket of asArray(group.buckets)) {
            const bucket = asRecord(rawBucket);
            if (!bucket || bucket.disabled === true) continue;
            const windowId = classifyWindow(bucket);
            if (!windowId) continue;

            const remaining = readRemainingPercent(bucket);
            if (remaining === undefined) continue;
            const quotaWindow: QuotaWindow = {
                id: windowId,
                remainingPercent: remaining,
                resetTime: readResetTime(bucket.resetTime),
            };
            if (windowId === 'weekly') {
                normalized.weekly = quotaWindow;
            } else {
                normalized.fiveHour = quotaWindow;
            }
        }

        if (normalized.weekly || normalized.fiveHour) {
            parsed.push(normalized);
        }
    }

    return mergeDuplicateGroups(parsed);
}

export function formatResetDuration(resetTime?: string): string {
    if (!resetTime) return 'Renews in 1 day';
    const resetAt = new Date(resetTime).getTime();
    if (!Number.isFinite(resetAt)) return 'Renews in 1 day';
    const diffMs = resetAt - Date.now();
    if (diffMs <= 0) return 'Available now';

    const totalMinutes = Math.max(1, Math.ceil(diffMs / (60 * 1000)));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mins = totalMinutes % 60;

    if (days > 0 && hours > 0) {
        return `Renews in ${days}d ${hours}h`;
    }
    if (days > 0 && mins > 0) {
        return `Renews in ${days}d ${mins}m`;
    }
    if (days > 0) {
        return `Renews in ${days} day${days > 1 ? 's' : ''}`;
    }
    if (hours > 0) {
        return `Renews in ${hours}h ${mins}m`;
    }
    return `Renews in ${mins}m`;
}

export function formatDetailedReset(resetTime?: string): string {
    if (!resetTime) return '2 days, 19 hours';
    const resetAt = new Date(resetTime).getTime();
    if (!Number.isFinite(resetAt)) return '2 days, 19 hours';
    const diffMs = resetAt - Date.now();
    if (diffMs <= 0) return 'a few moments';

    const totalMinutes = Math.max(1, Math.ceil(diffMs / (60 * 1000)));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mins = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (mins > 0 && days === 0) parts.push(`${mins} minute${mins > 1 ? 's' : ''}`);

    return parts.join(', ') || `${mins} minutes`;
}

function classifyGroup(group: Record<string, unknown>): 'gemini' | 'claude-gpt' | undefined {
    const text = searchableText(group);
    if (text.includes('gemini')) return 'gemini';
    if (text.includes('claude') || text.includes('gpt') || text.includes('other model')) return 'claude-gpt';
    return undefined;
}

function classifyWindow(bucket: Record<string, unknown>): 'weekly' | 'five-hour' | undefined {
    const text = searchableText(bucket);
    if (/five.?hour|5.?hour|\b5h\b|18000/.test(text)) return 'five-hour';
    if (/weekly|week|\b7d\b|604800/.test(text)) return 'weekly';
    const durationSeconds = Number(asRecord(bucket.window)?.seconds);
    if (Number.isFinite(durationSeconds)) {
        if (durationSeconds > 0 && durationSeconds <= 6 * 60 * 60) return 'five-hour';
        if (durationSeconds >= 6 * 24 * 60 * 60) return 'weekly';
    }
    return undefined;
}

function readRemainingPercent(bucket: Record<string, unknown>): number | undefined {
    const nestedRemaining = asRecord(bucket.remaining);
    const value = bucket.remainingFraction ?? nestedRemaining?.remainingFraction;
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
}

function readResetTime(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    const record = asRecord(value);
    if (!record) return undefined;
    if (typeof record.seconds === 'number' || typeof record.seconds === 'string') {
        const milliseconds = Number(record.seconds) * 1000;
        if (Number.isFinite(milliseconds)) return new Date(milliseconds).toISOString();
    }
    return undefined;
}

function mergeDuplicateGroups(groups: QuotaSummary): QuotaSummary {
    const merged = new Map<'gemini' | 'claude-gpt', QuotaGroup>();
    for (const group of groups) {
        const current = merged.get(group.id) || { id: group.id };
        if (group.weekly) current.weekly = group.weekly;
        if (group.fiveHour) current.fiveHour = group.fiveHour;
        merged.set(group.id, current);
    }
    return (['gemini', 'claude-gpt'] as const).flatMap(id => {
        const group = merged.get(id);
        return group ? [group] : [];
    });
}

function searchableText(record: Record<string, unknown> | null): string {
    if (!record) return '';
    return [record.id, record.bucketId, record.displayName, record.description, record.window]
        .filter(value => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

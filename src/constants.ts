/**
 * ═══════════════════════════════════════════════════════════════
 * Antigravity Core — Constants & Configuration
 * ═══════════════════════════════════════════════════════════════
 */

export const EXTENSION_ID = 'antigravity-core';
export const EXTENSION_DISPLAY_NAME = 'Antigravity Core — Auto-Switch Models & Accounts';

// ── Google OAuth Configuration ──
export const OAUTH = {
    CLIENT_ID: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep' + '.apps.googleusercontent.com',
    CLIENT_SECRET: 'GOCSPX-K58' + 'FWR486LdLJ1mLB8sXC4z6qDAf',
    REDIRECT_PATH: '/oauth-callback',
    PORTS: [8888, 8889, 8890, 8891, 8892] as const,
    SCOPES: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/cclog',
        'https://www.googleapis.com/auth/experimentsandconfigs',
    ],
    TOKEN_URL: 'https://oauth2.googleapis.com/token',
    AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    USERINFO_URL: 'https://www.googleapis.com/oauth2/v2/userinfo',
} as const;

// ── Antigravity Internal APIs ──
export const API = {
    LOAD_CODE_ASSIST: 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
    FETCH_CREDITS: 'https://cloudcode-pa.googleapis.com/v1internal:fetchCredits',
    DAILY_LOAD_CODE_ASSIST: 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
    FETCH_MODELS_URLS: [
        'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
        'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
        'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
    ] as const,
    QUOTA_SUMMARY_URLS: [
        'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
        'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
    ] as const,
    DEFAULT_VERSION: '1.22.2',
} as const;

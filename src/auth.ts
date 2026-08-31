/**
 * ═══════════════════════════════════════════════════════════════
 * Antigravity Core — Google Authentication Service
 * ═══════════════════════════════════════════════════════════════
 * 
 * Orchestrates real Google OAuth 2.0 login:
 * 1. Starts local callback server on port 8888-8892
 * 2. Opens official Google Account Chooser in browser
 * 3. Captures authorization code
 * 4. Exchanges code for Access & Refresh tokens
 * 5. Fetches live User Profile & live quota balances from Google
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { OAUTH } from './constants';
import { OAuthServer } from './oauthServer';
import { BalanceService } from './balanceService';
import { AccountData } from './creditMonitor';

export interface OAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface UserProfile {
    email: string;
    name: string;
    picture?: string;
}

export class AuthService {
    /**
     * Launches the real Google Sign-in flow and returns a fully initialized AccountData.
     */
    public static async loginWithBrowser(): Promise<AccountData | null> {
        const server = new OAuthServer();

        try {
            // 1. Start local callback server
            const port = await server.start();
            const redirectUri = `http://localhost:${port}${OAUTH.REDIRECT_PATH}`;

            // 2. Build official Google OAuth URL
            const authUrl = new URL(OAUTH.AUTH_URL);
            authUrl.searchParams.append('client_id', OAUTH.CLIENT_ID);
            authUrl.searchParams.append('redirect_uri', redirectUri);
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('scope', OAUTH.SCOPES.join(' '));
            authUrl.searchParams.append('access_type', 'offline');
            authUrl.searchParams.append('prompt', 'consent');
            authUrl.searchParams.append('include_granted_scopes', 'true');

            // 3. Open user's browser
            const urlString = authUrl.toString();
            vscode.env.openExternal(vscode.Uri.parse(urlString)).then(opened => {
                if (!opened) {
                    exec(`start "" "${urlString}"`);
                }
            }, () => {
                exec(`start "" "${urlString}"`);
            });

            // 4. Wait for authorization code
            const code = await server.waitForAuthCode();

            // 5. Exchange code for Access & Refresh tokens
            const tokens = await this.exchangeCodeForTokens(code, redirectUri);

            // 6. Fetch user profile from Google
            const profile = await this.fetchUserProfile(tokens.accessToken);

            // 7. Fetch live Antigravity quotas
            const liveQuotas = await BalanceService.fetchLiveQuotas(tokens.accessToken);

            return {
                id: Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
                name: profile.name,
                email: profile.email,
                avatarUrl: profile.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=7C3AED&color=fff&bold=true`,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                isActive: true,
                models: liveQuotas.models,
                claudeGpt: liveQuotas.claudeGpt,
                gemini: liveQuotas.gemini,
                refreshIn: '1 day'
            };
        } catch (error: any) {
            console.error('[Antigravity Core Auth] Login failed:', error);
            vscode.window.showErrorMessage(`Google Sign-in failed: ${error.message || error}`);
            return null;
        }
    }

    /**
     * Swaps the authorization code for access and refresh tokens.
     */
    public static async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
        const body = new URLSearchParams({
            client_id: OAUTH.CLIENT_ID,
            client_secret: OAUTH.CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });

        const res = await fetch(OAUTH.TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Token exchange failed (${res.status}): ${errorText}`);
        }

        const data = await res.json() as any;

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || '',
            expiresIn: data.expires_in || 3600
        };
    }

    /**
     * Refreshes an expired access token using the stored refresh token.
     */
    public static async refreshAccessToken(refreshToken: string): Promise<string> {
        const body = new URLSearchParams({
            client_id: OAUTH.CLIENT_ID,
            client_secret: OAUTH.CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });

        const res = await fetch(OAUTH.TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) {
            throw new Error(`Token refresh failed with status ${res.status}`);
        }

        const data = await res.json() as any;
        return data.access_token;
    }

    /**
     * Fetches the user profile from Google UserInfo API.
     */
    public static async fetchUserProfile(accessToken: string): Promise<UserProfile> {
        const res = await fetch(OAUTH.USERINFO_URL, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!res.ok) {
            throw new Error(`User profile fetch failed: ${res.status}`);
        }

        const data = await res.json() as any;

        return {
            email: data.email,
            name: data.name || data.email.split('@')[0],
            picture: data.picture
        };
    }
}

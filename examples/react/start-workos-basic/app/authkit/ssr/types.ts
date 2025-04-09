import { Impersonator, User } from '@workos-inc/node';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  impersonator?: Impersonator | null;
}

export interface TokenClaims {
  sid: string;
  org_id?: string;
  role?: string;
  permissions?: string[];
  entitlements?: string[];
}

export interface AuthConfig {
  clientId: string;
  apiKey: string;
  redirectUri: string;
  cookiePassword: string;
  apiHostname?: string;
  apiHttps?: boolean;
  apiPort?: number;
}

export interface StorageAdapter {
  getSessionData(request: unknown): Promise<string | null>;
  createAuthenticatedResponse(responseData: unknown, sessionData?: string): unknown;
  clearSession(request: unknown): Promise<unknown>;
}

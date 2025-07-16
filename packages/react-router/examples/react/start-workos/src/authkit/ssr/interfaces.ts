import type { Impersonator, User } from '@workos-inc/node';

export interface GetAuthURLOptions {
  redirectUri?: string;
  screenHint?: 'sign-up' | 'sign-in';
  returnPathname?: string;
}

export interface CookieOptions {
  path: '/';
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
  domain: string | undefined;
}

export interface UserInfo {
  user: User;
  sessionId: string;
  organizationId?: string;
  role?: string;
  permissions?: Array<string>;
  entitlements?: Array<string>;
  impersonator?: Impersonator;
  accessToken: string;
}
export interface NoUserInfo {
  user: null;
  sessionId?: undefined;
  organizationId?: undefined;
  role?: undefined;
  permissions?: undefined;
  entitlements?: undefined;
  impersonator?: undefined;
  accessToken?: undefined;
}

export interface AuthkitOptions {
  debug?: boolean;
  redirectUri?: string;
  screenHint?: 'sign-up' | 'sign-in';
}

export interface AuthkitResponse {
  session: UserInfo | NoUserInfo;
  headers: Headers;
  authorizationUrl?: string;
}

/**
 * AuthKit Session
 */
export interface Session {
  /**
   * The session access token
   */
  accessToken: string;
  /**
   * The session refresh token - used to refresh the access token
   */
  refreshToken: string;
  /**
   * The logged-in user
   */
  user: User;
  /**
   * The impersonator user, if any
   */
  impersonator?: Impersonator;
}

/**
 * AuthKit Configuration Options
 */
export interface AuthKitConfig {
  /**
   * The WorkOS Client ID
   * Equivalent to the WORKOS_CLIENT_ID environment variable
   */
  clientId: string;

  /**
   * The WorkOS API Key
   * Equivalent to the WORKOS_API_KEY environment variable
   */
  apiKey: string;

  /**
   * The redirect URI for the authentication callback
   * Equivalent to the WORKOS_REDIRECT_URI environment variable
   */
  redirectUri: string;

  /**
   * The password used to encrypt the session cookie
   * Equivalent to the WORKOS_COOKIE_PASSWORD environment variable
   * Must be at least 32 characters long
   */
  cookiePassword: string;

  /**
   * The hostname of the API to use
   * Equivalent to the WORKOS_API_HOSTNAME environment variable
   */
  apiHostname?: string;

  /**
   * Whether to use HTTPS for API requests
   * Equivalent to the WORKOS_API_HTTPS environment variable
   */
  apiHttps: boolean;

  /**
   * The port to use for the API
   * Equivalent to the WORKOS_API_PORT environment variable
   */
  apiPort?: number;

  /**
   * The maximum age of the session cookie in seconds
   * Equivalent to the WORKOS_COOKIE_MAX_AGE environment variable
   */
  cookieMaxAge: number;

  /**
   * The name of the session cookie
   * Equivalent to the WORKOS_COOKIE_NAME environment variable
   * Defaults to "wos-session"
   */
  cookieName: string;

  /**
   * The domain for the session cookie
   */
  cookieDomain?: string;
}

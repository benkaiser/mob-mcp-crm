import { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { OAuthService } from './oauth.js';

/**
 * Adapter that implements the MCP SDK's OAuthTokenVerifier interface,
 * wrapping our existing OAuthService for Bearer token validation.
 */
export class McpTokenVerifier implements OAuthTokenVerifier {
  constructor(private oauthService: OAuthService) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.oauthService.getTokenRecord(token);
    if (!record) {
      throw new InvalidTokenError('Invalid or expired token');
    }

    return {
      token,
      clientId: record.clientId,
      scopes: [],
      expiresAt: Math.floor(record.expiresAt / 1000), // SDK expects seconds since epoch
      extra: { userId: record.userId },
    };
  }
}

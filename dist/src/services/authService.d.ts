export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: string;
}
/** Resolve either a Quiz AI access token or a Firebase ID token to one DB user. */
export declare function resolveAuthToken(token: string): Promise<AuthenticatedUser | null>;
export declare function issueAccessToken(user: {
    id: string;
    role: string;
}): string;
//# sourceMappingURL=authService.d.ts.map
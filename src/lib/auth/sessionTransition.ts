export interface SessionIdentity {
  readonly id: string;
}

export interface SessionTransitionEffects<TUser extends SessionIdentity> {
  invalidateWorkspace: () => void;
  publishIdentity: (user: TUser) => void;
  clearIdentity: () => void;
  resolveWorkspace: (user: TUser) => Promise<void>;
}

export interface SignInAttemptToken {
  readonly attemptGeneration: number;
  readonly sessionGeneration: number;
}

export interface InitialSessionToken {
  readonly attemptGeneration: number;
  readonly sessionGeneration: number;
}

export type SessionTransitionOutcome =
  | 'published'
  | 'cleared'
  | 'already_current'
  | 'failed'
  | 'superseded';

/**
 * Coordinates provider responses and authoritative Auth events before any
 * identity is published. Workspace invalidation always precedes identity
 * publication/clearing, and workspace resolution starts only after adoption.
 */
export class AuthSessionTransitionCoordinator<TUser extends SessionIdentity> {
  private attemptGeneration = 0;
  private sessionGeneration = 0;
  private activeUserId: string | null = null;

  beginSignIn(): SignInAttemptToken {
    this.attemptGeneration += 1;
    return Object.freeze({
      attemptGeneration: this.attemptGeneration,
      sessionGeneration: this.sessionGeneration,
    });
  }

  beginInitialSessionRead(): InitialSessionToken {
    return Object.freeze({
      attemptGeneration: this.attemptGeneration,
      sessionGeneration: this.sessionGeneration,
    });
  }

  failSignIn(token: SignInAttemptToken): SessionTransitionOutcome {
    if (!this.isAttemptCurrent(token)) return 'superseded';
    this.attemptGeneration += 1;
    return 'failed';
  }

  async completeSignIn(
    token: SignInAttemptToken,
    user: TUser,
    effects: SessionTransitionEffects<TUser>,
  ): Promise<SessionTransitionOutcome> {
    if (!this.isAttemptCurrent(token)) {
      return this.activeUserId === user.id ? 'already_current' : 'superseded';
    }

    this.attemptGeneration += 1;
    this.sessionGeneration += 1;
    this.activeUserId = user.id;
    await this.publish(user, effects);
    return 'published';
  }

  async completeInitialSession(
    token: InitialSessionToken,
    user: TUser | null,
    effects: SessionTransitionEffects<TUser>,
  ): Promise<SessionTransitionOutcome> {
    if (token.attemptGeneration !== this.attemptGeneration
        || token.sessionGeneration !== this.sessionGeneration) return 'superseded';
    this.sessionGeneration += 1;
    if (!user) {
      this.activeUserId = null;
      this.clear(effects);
      return 'cleared';
    }
    this.activeUserId = user.id;
    await this.publish(user, effects);
    return 'published';
  }

  async applyAuthEvent(
    user: TUser | null,
    effects: SessionTransitionEffects<TUser>,
  ): Promise<SessionTransitionOutcome> {
    // Auth events represent the provider's current session and supersede every
    // pending response, including an attempt that originally caused the event.
    this.attemptGeneration += 1;
    this.sessionGeneration += 1;
    if (!user) {
      this.activeUserId = null;
      this.clear(effects);
      return 'cleared';
    }
    this.activeUserId = user.id;
    await this.publish(user, effects);
    return 'published';
  }

  cancelSession(effects: SessionTransitionEffects<TUser>): void {
    this.attemptGeneration += 1;
    this.sessionGeneration += 1;
    this.activeUserId = null;
    this.clear(effects);
  }

  private isAttemptCurrent(token: SignInAttemptToken): boolean {
    return token.attemptGeneration === this.attemptGeneration
      && token.sessionGeneration === this.sessionGeneration;
  }

  private async publish(user: TUser, effects: SessionTransitionEffects<TUser>): Promise<void> {
    effects.invalidateWorkspace();
    effects.publishIdentity(user);
    await effects.resolveWorkspace(user);
  }

  private clear(effects: SessionTransitionEffects<TUser>): void {
    effects.invalidateWorkspace();
    effects.clearIdentity();
  }
}

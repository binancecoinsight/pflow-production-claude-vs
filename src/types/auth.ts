import { User } from '@supabase/supabase-js';
import { UserProfile, PharmacyMember, Pharmacy, Branch, UserRole, Subscription } from './database';

export type SessionState =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticated_loading'
  | 'authenticated_select_pharmacy'
  | 'authenticated_ready'
  | 'authenticated_no_membership'
  | 'authenticated_error';

export interface MembershipWithPharmacy extends PharmacyMember {
  pharmacy?: Pharmacy;
}

export interface AuthContextValue {
  state: SessionState;
  user: User | null;
  profile: UserProfile | null;
  memberships: MembershipWithPharmacy[];
  membership: PharmacyMember | null;
  pharmacy: Pharmacy | null;
  branch: Branch | null;
  role: UserRole | null;
  permissions: string[];
  subscription: Subscription | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  selectPharmacy: (pharmacyId: string) => Promise<void>;
  refreshContext: () => Promise<void>;
}

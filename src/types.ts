export interface UserProfile {
  uid: string;
  email: string;
  role: 'player' | 'chamber' | 'admin' | 'business';
  town?: string;
  displayName?: string;
  bingoBoard?: string[];
  boardSize?: number;
  businessId?: string;
  lastActive?: string;
  lastReadAt?: string;
  onboardingComplete?: boolean;
  tourCompleted?: boolean;
  roleSelected?: boolean;
  currentLocation?: {
    lat: number;
    lng: number;
  };
  metadata?: Record<string, any>;
}

export interface Business {
  id: string;
  name: string;
  town: string;
  task: string;
  category?: string;
  qrCode: string;
  nfcId?: string;
  address: string;
  lat?: number;
  lng?: number;
  description?: string;
  image?: string;
  website?: string;
  email?: string;
}

export interface Town {
  id: string;
  name: string;
}

export interface AppSettings {
  freeSpaceName: string;
  freeSpaceTask: string;
  boardSize: number;
  difficulty: number;
  raffleEnabled?: boolean;
  raffleDescription?: string;
  raffleRequirement?: number;
  bingoPrize?: string;
  showRealtimeMapToChamber?: boolean;
  primaryColor?: string;
  accentColor?: string;
  chamberName?: string;
  chamberLogoUrl?: string;
  gamePaused?: boolean;
  businessCategories?: string[];
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetUid: string;
  targetEmail?: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string | 'all';
  message: string;
  type: 'info' | 'win' | 'raffle' | 'game';
  read?: boolean;
  timestamp: string;
  createdBy?: string;
}

export interface Completion {
  id: string;
  userId: string;
  businessId: string;
  timestamp: string;
  town: string;
}

export interface RaffleEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  timestamp: string;
  completionsCount: number;
}

export interface Winner {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  timestamp: string;
  prize?: string;
}

export interface Activity {
  id: string;
  userId: string;
  type: 'view_business' | 'open_app' | 'click_directions';
  targetId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface Invite {
  id: string;
  token: string;
  role: 'player' | 'chamber' | 'business';
  businessId?: string;
  businessName?: string;
  emailHint?: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedBy?: string;
  usedAt?: string;
}

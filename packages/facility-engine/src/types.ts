export const ENGINE_VERSION = "facility-engine-v1.0.0";
export const PACKAGE_VERSION = "1.0.0";

export interface RoomSnapshot {
  id: string;
  code: string;
  name: string;
  roomType: string;
  building: string;
  floor: string;
  capacity: number;
  status: "ACTIVE" | "MAINTENANCE" | "DISABLED";
  features: Record<string, string | number | boolean>;
}

export interface OccupancyInterval {
  roomId: string;
  startAt: string;
  endAt: string;
  kind: "TIMETABLE" | "CONFIRMED_BOOKING" | "MAINTENANCE_BLOCK";
  label: string;
}

export interface PendingHold {
  requestId: string;
  roomId: string;
  startAt: string;
  endAt: string;
  createdAt: string;
  active: boolean;
}

export interface OperationalHours {
  startMinutes: number;
  endMinutes: number;
  weekdaysOnly: true;
}

export interface PlanningRequest {
  requestId: string;
  attendees: number;
  requiredFeatures: string[];
  preferredRoomType?: string;
  preferredBuilding?: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI";
  timeWindow: { start: string; end: string; flexible: boolean };
  setupMinutes?: number;
  cleanupMinutes?: number;
}

export interface SchoolState {
  rooms: RoomSnapshot[];
  occupancy: OccupancyInterval[];
  pendingHolds: PendingHold[];
  hours: OperationalHours;
  dateForDay: string;
}

export type HardFailReason =
  | "ROOM_NOT_ACTIVE"
  | "CAPACITY"
  | "MISSING_FEATURE"
  | "TIMETABLE_CONFLICT"
  | "CONFIRMED_BOOKING_CONFLICT"
  | "MAINTENANCE_BLOCK"
  | "OUTSIDE_HOURS"
  | "EXACT_TIME";

export interface SoftBreakdown {
  roomTypeFit: number;
  buildingFit: number;
  capacityEfficiency: number;
  holdRisk: number;
  timeFit: number;
}

export interface FacilityPlan {
  roomId: string;
  roomCode: string;
  startAt: string;
  endAt: string;
  score: number;
  hardPassed: true;
  soft: SoftBreakdown;
  reasons: string[];
  tradeoffs: string[];
  pendingConflictRisk: number;
}

export interface NoSolution {
  kind: "NO_SOLUTION";
  blockers: { reason: HardFailReason; count: number; detail: string }[];
  alternatives: { description: string; relaxes: string[] }[];
}

export type PlanResult =
  | { kind: "PLANS"; plans: FacilityPlan[]; engineVersion: string }
  | (NoSolution & { engineVersion: string });

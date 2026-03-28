export interface DSPUser {
  id: string;
  name: string;
  rank: string;
  badgeNumber: string;
  phone: string;
  email: string;
  assignedAreaId: string;
  assignedSectors: string[];
  isActive: boolean;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  rank: string;
  badgeNumber: string;
  phone: string;
  assignedSectorId: string;
  dutyCategory: DutyCategory;
  currentLocation: GeoPoint | null;
  lastLocationUpdate: string | null;
  isOnDuty: boolean;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'viewer';
  isActive: boolean;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}

export type DutyCategory =
  | 'traffic_control'
  | 'patrolling'
  | 'checkpoint'
  | 'vip_duty'
  | 'school_duty'
  | 'special_event'
  | 'reserve';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

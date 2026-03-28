import { GeoPoint } from './users';
import { TrafficSnapshot, Alert } from './traffic';

// Client -> Server events
export interface ClientToServerEvents {
  'location:update': (data: LocationUpdatePayload) => void;
  'alert:create': (data: CreateAlertPayload) => void;
  'alert:resolve': (data: { alertId: string }) => void;
  'traffic:snapshot': (data: TrafficSnapshot) => void;
  'sector:subscribe': (data: { sectorIds: string[] }) => void;
  'sector:unsubscribe': (data: { sectorIds: string[] }) => void;
}

// Server -> Client events
export interface ServerToClientEvents {
  'location:updated': (data: StaffLocationEvent) => void;
  'alert:new': (data: Alert) => void;
  'alert:resolved': (data: { alertId: string; resolvedBy: string }) => void;
  'traffic:update': (data: TrafficSnapshot) => void;
  'roster:updated': (data: { rosterId: string; date: string }) => void;
  'staff:status': (data: StaffStatusEvent) => void;
  'prediction:new': (data: { sectorId: string }) => void;
  'connection:ack': (data: { userId: string; timestamp: string }) => void;
}

export interface LocationUpdatePayload {
  staffId: string;
  location: GeoPoint;
  accuracy: number;
  batteryLevel: number;
  timestamp: string;
}

export interface StaffLocationEvent {
  staffId: string;
  name: string;
  location: GeoPoint;
  accuracy: number;
  batteryLevel: number;
  isOnDuty: boolean;
  timestamp: string;
}

export interface StaffStatusEvent {
  staffId: string;
  isOnDuty: boolean;
  isOnline: boolean;
  timestamp: string;
}

export interface CreateAlertPayload {
  type: Alert['type'];
  severity: Alert['severity'];
  title: string;
  description: string;
  location: GeoPoint;
  sectorId: string;
}

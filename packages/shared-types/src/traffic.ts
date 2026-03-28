import { GeoPoint } from './users';

export type TrafficDensity = 'low' | 'moderate' | 'high' | 'severe' | 'gridlock';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'congestion'
  | 'accident'
  | 'road_closure'
  | 'vip_movement'
  | 'weather'
  | 'construction'
  | 'special_event';

export interface TrafficSnapshot {
  id: string;
  sectorId: string;
  intersectionId: string | null;
  density: TrafficDensity;
  vehicleCount: number;
  avgSpeed: number;
  location: GeoPoint;
  capturedAt: string;
  capturedBy: string;
  notes: string | null;
}

export interface Prediction {
  id: string;
  sectorId: string;
  intersectionId: string | null;
  predictedDensity: TrafficDensity;
  predictedVehicleCount: number;
  confidence: number;
  predictedFor: string;
  generatedAt: string;
  modelVersion: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  location: GeoPoint;
  sectorId: string;
  areaId: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

import { GeoPoint } from './users';

export interface Area {
  id: string;
  name: string;
  code: string;
  dspId: string;
  sectors: Sector[];
  boundary: GeoPoint[];
  centerPoint: GeoPoint;
  createdAt: string;
  updatedAt: string;
}

export interface Sector {
  id: string;
  name: string;
  code: string;
  areaId: string;
  boundary: GeoPoint[];
  centerPoint: GeoPoint;
  keyIntersections: Intersection[];
  createdAt: string;
  updatedAt: string;
}

export interface Intersection {
  id: string;
  name: string;
  location: GeoPoint;
  sectorId: string;
  trafficSignalId: string | null;
  avgDailyVolume: number;
}

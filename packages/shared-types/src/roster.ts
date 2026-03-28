import { DutyCategory } from './users';

export interface DailyRoster {
  id: string;
  date: string;
  areaId: string;
  createdBy: string;
  entries: RosterEntry[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  rosterId: string;
  staffId: string;
  sectorId: string;
  dutyCategory: DutyCategory;
  shiftStart: string;
  shiftEnd: string;
  intersectionId: string | null;
  notes: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'absent' | 'reassigned';
}

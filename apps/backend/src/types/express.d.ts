declare global {
  namespace Express {
    interface Request {
      id: string;
      dsp?: {
        id: string;
        username: string;
        fullName: string;
        areaId: string | null;
      };
      staff?: {
        id: string;
        badgeId: string;
        fullName: string;
        sectorId: string | null;
        areaId: string | null;
      };
      admin?: {
        id: string;
        username: string;
        isSuperAdmin: boolean;
      };
    }
  }
}

export {};

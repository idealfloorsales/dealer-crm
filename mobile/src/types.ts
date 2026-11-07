export type Permissions = Record<string, boolean>;

export type CRMUser = {
  id: string;
  username: string;
  fullName?: string;
  role: string;
  scope: string;
  permissions: Permissions;
};

export type MotivationScheme = {
  id?: string;
  _id?: string;
  name?: string;
  ratePerM2?: number;
  validFrom?: string;
  validTo?: string;
  active?: boolean;
};

export type Dealer = {
  id: string;
  _id?: string;
  dealer_id?: string;
  name: string;
  city?: string;
  address?: string;
  status?: string;
  responsible?: string;
  region_sector?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  instagram?: string;
  bonuses?: string;
  motivation_scheme?: MotivationScheme | string | null;
  contacts?: Array<{ name?: string; position?: string; contactInfo?: string }>;
};

export type SaleRow = {
  id?: string;
  _id?: string;
  month: string;
  group?: string;
  dealerId?: string;
  dealerName?: string;
  plan?: number;
  fact?: number;
  isCustom?: boolean;
};

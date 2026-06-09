import type { Event } from "~~/layers/event/shared/types/types";

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

export interface User {
  username: string;
  email?: string;
  fullName: string;
  role: UserRole;
  createdAt: Date;
  active: boolean;
  events?: Event[]
}

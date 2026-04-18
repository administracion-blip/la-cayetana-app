export type UserStatus = "pending_payment" | "active" | "inactive";

export type PostType = "event" | "promo" | "info";

export interface UserRecord {
  id: string;
  entityType: "USER";
  membershipId: string;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  status: UserStatus;
  stripeSessionId: string;
  stripePaymentStatus: string;
  createdAt: string;
  exportedToAgora: boolean;
  exportedAt?: string;
  /** Solo gestión en Dynamo; no se expone en APIs públicas ni carnet. */
  isAdmin?: boolean;
}

/** Pago de Checkout confirmado; persiste hasta activar carnet o queda como auditoría. */
export interface PaidSessionRecord {
  id: string;
  entityType: "PAID_SESSION";
  stripeSessionId: string;
  payerEmail?: string;
  payerName?: string;
  paymentStatus: string;
  amountTotal?: number;
  currency?: string;
  createdAt: string;
  updatedAt: string;
}

/** Token de un solo uso para restablecer contraseña (misma tabla Dynamo que users). */
export interface PasswordResetRecord {
  id: string;
  entityType: "PWD_RESET";
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface PostRecord {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  type: PostType;
  startDate: string;
  endDate: string;
  visible: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  phone?: string;
  status: UserStatus;
  createdAt: string;
}

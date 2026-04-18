export type UserStatus = "pending_payment" | "active" | "inactive";

export type UserSex = "male" | "female" | "prefer_not_to_say";

export type PostType = "event" | "promo" | "info";

export interface UserRecord {
  id: string;
  /**
   * Tipo de ítem en DynamoDB:
   *  - `DRAFT_REGISTRATION`: alta pendiente de pago. Se auto-borra por TTL si
   *    Stripe no confirma. No es un socio real y queda oculto del admin.
   *  - `USER`: socio confirmado (pago realizado o legacy importado).
   * Solo los `USER` se listan como socios, se exportan y pueden operar.
   */
  entityType: "USER" | "DRAFT_REGISTRATION";
  /** Solo se asigna al activarse (tras pago confirmado). */
  membershipId?: string;
  name: string;
  email: string;
  /**
   * Hash bcrypt de la contraseña. Puede estar ausente en socios legacy
   * importados masivamente que aún no han establecido contraseña.
   */
  passwordHash?: string;
  /**
   * Hash pendiente de aplicar en la próxima activación/renovación por pago.
   * Evita que un socio cambie su contraseña sin pagar: se persiste aquí durante
   * el preregistro y se mueve a `passwordHash` al confirmarse Stripe.
   */
  pendingPasswordHash?: string;
  /**
   * Cambios de perfil pendientes de aplicar en la próxima activación/renovación.
   * Se actualizan los campos presentes (name, phone, sex, birthYear).
   */
  pendingProfile?: {
    name?: string;
    phone?: string;
    sex?: UserSex;
    birthYear?: number;
  };
  phone?: string;
  /** Datos del formulario de alta (obligatorios desde el nuevo flujo). */
  sex?: UserSex;
  birthYear?: number;
  status: UserStatus;
  /** Se rellena al crear la sesión de Checkout. */
  stripeSessionId?: string;
  /** Se rellena al confirmarse el pago. */
  stripePaymentStatus?: string;
  createdAt: string;
  /** Fecha en la que el pago fue confirmado (al pasar a `active`). */
  paidAt?: string;
  /** Importe pagado en la última compra (céntimos). */
  paidAmount?: number;
  /** Divisa del último pago. Se fuerza a "EUR". */
  paidCurrency?: string;
  /** Estado de entrega física del bono al socio. */
  deliveryStatus?: "pending" | "delivered";
  /** Fecha/hora (ISO) en la que se marcó como entregado. */
  deliveredAt?: string;
  /** Id del admin que marcó la entrega (auditoría). */
  deliveredByUserId?: string;
  /** TTL DynamoDB (segundos epoch). Solo presente en `pending_payment`. */
  expiresAt?: number;
  /** Evita reenviar el correo de bienvenida. */
  welcomeEmailSent?: boolean;
  exportedToAgora: boolean;
  exportedAt?: string;
  /** Solo gestión en Dynamo; no se expone en APIs públicas ni carnet. `false` en altas nuevas. */
  isAdmin?: boolean;
  /** Indica que el socio fue importado masivamente (legacy). */
  legacy?: boolean;
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
  /** Solo presente en cuentas activas. */
  membershipId?: string;
  name: string;
  email: string;
  phone?: string;
  status: UserStatus;
  createdAt: string;
}

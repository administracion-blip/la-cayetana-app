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
  /**
   * Socio fundador del club. Cuando es `true` se muestra un distintivo
   * amarillo "Fundador" en el carnet digital, junto al chip de "Socio activo".
   * Se gestiona manualmente desde DynamoDB.
   */
  founder?: boolean;
  /** Id del admin que aprobó manualmente la activación/renovación (flujo manual). */
  activatedByUserId?: string;
  /** Fecha ISO de la última activación manual (flujo manual). */
  activatedAt?: string;
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

/**
 * Evento / entrada de programación que se publicita en el feed de la app.
 * Vive en la tabla `la_cayetana_programacion`.
 */
export interface EventRecord {
  /** Partition key de la tabla. UUID v4. */
  id: string;
  /** Partición del GSI `by-start`. Constante `"EVENT"`. */
  entityType: "EVENT";
  title: string;
  description: string;
  /**
   * Fecha y hora del evento en ISO 8601 (`2026-05-12T20:30:00.000Z`).
   * Se usa como SK del GSI `by-start` para ordenar el feed cronológicamente.
   */
  startAt: string;
  /**
   * Clave del objeto en S3 (ruta relativa dentro del bucket
   * `PROGRAMACION_S3_BUCKET`). Ej: `programacion/ab12-….jpg`.
   */
  imageKey: string;
  /** Content-type del archivo subido (p.ej. `image/jpeg`). */
  imageContentType?: string;
  /** Si es `true`, aparece en el feed público de `/app`. */
  published: boolean;
  /**
   * Si es `true` y `published` también lo es, el evento puede aparecer como
   * pop up recurrente en la página principal del socio (`/app`).
   * `undefined` se trata como `false` (compatibilidad con eventos antiguos).
   */
  showAsPopup?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Id del admin que creó el evento (auditoría). */
  createdByUserId: string;
  /** Id del admin que actualizó el evento por última vez. */
  updatedByUserId?: string;
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

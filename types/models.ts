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
   * Socio fundador de la caseta. Cuando es `true` se muestra un distintivo
   * amarillo "Fundador" en el carnet digital, junto al chip de "Socio activo".
   * Se gestiona manualmente desde DynamoDB.
   */
  founder?: boolean;
  /** Id del admin que aprobó manualmente la activación/renovación (flujo manual). */
  activatedByUserId?: string;
  /** Fecha ISO de la última activación manual (flujo manual). */
  activatedAt?: string;
  /**
   * Ruleta de la Suerte: si es `true`, este socio puede validar canjes en
   * taquilla (su QR se escanea desde la app del ganador para marcar el premio
   * como redeemed). Independiente de `isAdmin`: un validador de taquilla no
   * tiene por qué acceder al panel. Solo aplica a cuentas con `status = active`.
   */
  canValidatePrizes?: boolean;
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

// ─── Ruleta de la Suerte ──────────────────────────────────────────────────

/** Tipos de premio soportados por la ruleta. */
export type PrizeType =
  | "copa"
  | "tercio"
  | "chupito"
  | "rebujito"
  | "botella";

/**
 * Estados por los que pasa un premio tras concederse.
 *
 * - `awarded`: vivo, pendiente de canjear en taquilla.
 * - `redeemed`: validado por un socio con `canValidatePrizes` en taquilla.
 * - `expired`: caducado por tiempo (15 min). Devuelve stock al ciclo.
 * - `discarded`: el propio socio lo descartó conscientemente desde la app
 *   (pulsó "Cerrar" + confirm sobre la card de premio). **No** devuelve
 *   stock al ciclo y **no** permite volver a ganar en el mismo ciclo.
 */
export type PrizeStatus = "awarded" | "redeemed" | "expired" | "discarded";

/** Resultado bruto de una tirada. */
export type SpinOutcome = "win" | "lose";

/** Por qué una tirada terminó en `lose` (auditoría). */
export type SpinLoseReason =
  | "no_stock"
  | "already_won_in_cycle"
  | "random";

/** entityType de cada ítem de `la_cayetana_roulette` (discriminante). */
export type RouletteEntityType =
  | "ROULETTE_CONFIG"
  | "ROULETTE_CYCLE"
  | "ROULETTE_USER_CYCLE"
  | "ROULETTE_SPIN"
  | "ROULETTE_PRIZE"
  | "ROULETTE_CONSOLATION";

/**
 * Estados del premio de consolación ("rasca"):
 *  - `awarded`: vivo y rascable/canjeable.
 *  - `redeemed`: validado en taquilla por un usuario con `canValidatePrizes`.
 *  - `expired`: caducado por tiempo (`expiresAt`).
 *
 * No existe un estado `discarded` para el rasca (a diferencia del premio
 * de ruleta): un regalo de consolación no se descarta voluntariamente.
 */
export type ConsolationStatus = "awarded" | "redeemed" | "expired";

/**
 * Tipos de recompensa de consolación. De momento solo existe uno, pero el
 * campo es extensible sin migración si en el futuro se añaden variantes.
 */
export type ConsolationRewardType = "discount_1eur_drinks";

/** Mapa de inventario por tipo de premio (stock inicial / restante). */
export type PrizeStockMap = Record<PrizeType, number>;

/**
 * Ítem de configuración global de la ruleta. Único (`PK = "CONFIG"`,
 * `SK = "CURRENT"`). Solo editable desde el panel admin.
 */
export interface RouletteConfigRecord {
  PK: "CONFIG";
  SK: "CURRENT";
  entityType: "ROULETTE_CONFIG";
  /** Zona horaria IANA para calcular el ciclo (13:00–12:59 local). */
  timezone: string;
  /** Hora local a la que abre un nuevo ciclo (0..23). Por defecto 13. */
  cycleStartHour: number;
  /** Nº máximo de tiradas por socio y ciclo. Por defecto 2. */
  spinsPerCycle: number;
  /** Segundos para canjear un premio antes de que caduque. Por defecto 900. */
  redeemWindowSec: number;
  /**
   * Tasa objetivo de victoria (0..1). Se usa para calcular el "bucket de
   * perder" al ponderar premios en stock. Ej: 0.3 → ~30% tiradas ganadoras
   * mientras haya stock.
   */
  targetWinRate: number;
  /** Stock inicial por premio y día. */
  dailyStock: PrizeStockMap;
  /** membershipId del usuario con comportamiento shadow (CY1000 por defecto). */
  shadowMembershipId: string;
  /** Probabilidad de ganar para el usuario shadow (0..1). */
  shadowWinRate: number;
  /**
   * Si es `true`, al perder todas las tiradas del ciclo sin ganar ningún
   * premio el backend genera automáticamente un "rasca" de consolación
   * (`ROULETTE_CONSOLATION`) en la misma transacción. El usuario shadow
   * (CY1000) queda siempre excluido de este flujo.
   */
  consolationEnabled: boolean;
  /**
   * Ventana de canje del rasca en segundos (contado desde `awardedAt`).
   * Por defecto 1200 (20 min).
   */
  consolationWindowSec: number;
  /** Tipo de recompensa del rasca. */
  consolationRewardType: ConsolationRewardType;
  /** Etiqueta visible al rascar (ej: "DESCUENTO DE 1€ EN TUS COPAS"). */
  consolationRewardLabel: string;
  updatedAt: string;
  updatedByUserId?: string;
}

/**
 * Meta por ciclo diario (cupo consumido vs. restante). Se crea on-demand al
 * primer spin de cada ciclo. `PK = "CYCLE#yyyy-MM-dd"`, `SK = "META"`.
 */
export interface RouletteCycleRecord {
  PK: `CYCLE#${string}`;
  SK: "META";
  entityType: "ROULETTE_CYCLE";
  /** Identificador del ciclo: fecha local (yyyy-MM-dd) del día de apertura. */
  cycleId: string;
  /** Inicio del ciclo en UTC (ISO). */
  startsAt: string;
  /** Fin del ciclo en UTC (ISO, inclusivo al ms). */
  endsAt: string;
  /** Snapshot del stock inicial al abrir el ciclo (para auditoría). */
  stockInitial: PrizeStockMap;
  /** Stock vivo (decrece al otorgar premio, aumenta al caducar uno). */
  stockRemaining: PrizeStockMap;
  /** Total de tiradas reales (excluye shadow). */
  spinsTotal: number;
  /** Total de premios concedidos reales (excluye shadow). */
  winsTotal: number;
  createdAt: string;
}

/**
 * Contador por socio y ciclo. `PK = "CYCLE#yyyy-MM-dd"`, `SK = "USER#<userId>"`.
 * Se actualiza en la misma transacción que el SPIN/PRIZE.
 */
export interface RouletteUserCycleRecord {
  PK: `CYCLE#${string}`;
  SK: `USER#${string}`;
  entityType: "ROULETTE_USER_CYCLE";
  cycleId: string;
  userId: string;
  membershipId?: string;
  /** 0..spinsPerCycle. */
  spinsUsed: number;
  /** 0 ó 1 (tope duro). */
  prizesWon: number;
  lastSpinAt?: string;
  /** prizeId del premio vivo si lo hay; se limpia al canjear/caducar. */
  activePrizeId?: string | null;
  /**
   * consolationId del rasca generado en este ciclo (si se generó). Sirve
   * de centinela de idempotencia: la transacción que crea el rasca incluye
   * `attribute_not_exists(consolationId)` para evitar duplicados ante
   * reintentos o condiciones de carrera. No se limpia al canjear/caducar.
   */
  consolationId?: string | null;
}

/**
 * Registro inmutable de una tirada. Append-only.
 * `PK = "CYCLE#yyyy-MM-dd"`, `SK = "SPIN#<createdAt-ISO>#<spinId>"`.
 */
export interface RouletteSpinRecord {
  PK: `CYCLE#${string}` | `SHADOW#${string}`;
  SK: `SPIN#${string}`;
  entityType: "ROULETTE_SPIN";
  spinId: string;
  cycleId: string;
  userId: string;
  membershipId?: string;
  createdAt: string;
  outcome: SpinOutcome;
  prizeId: string | null;
  prizeType: PrizeType | null;
  loseReason: SpinLoseReason | null;
  /** true si corresponde al usuario shadow (CY1000). No computa métricas. */
  shadow: boolean;
}

/**
 * Estado vivo de un premio. Clave propia para facilitar `GetItem` por `prizeId`
 * (`PK = "PRIZE#<prizeId>"`, `SK = "META"`). Los GSIs permiten:
 *  - GSI1 (`by-user-prize`): listar premios de un socio por fecha.
 *  - GSI2 (`by-prize-status`): barrer premios `awarded` cuyo TTL haya vencido.
 */
export interface RoulettePrizeRecord {
  PK: `PRIZE#${string}`;
  SK: "META";
  /** Solo se rellena en ítems PRIZE para que salgan en el GSI1. */
  GSI1PK?: `USER#${string}`;
  GSI1SK?: `PRIZE#${string}`;
  /** Se actualiza al cambiar de estado para que GSI2 refleje el estado actual. */
  GSI2PK?: `PRIZE_STATUS#${PrizeStatus}`;
  GSI2SK?: string;
  entityType: "ROULETTE_PRIZE";
  prizeId: string;
  userId: string;
  membershipId?: string;
  cycleId: string;
  spinId: string;
  prizeType: PrizeType;
  status: PrizeStatus;
  awardedAt: string;
  /** ISO. El backend marca `expired` cuando `now >= expiresAt`. */
  expiresAt: string;
  redeemedAt?: string | null;
  redeemedByUserId?: string | null;
  /** ISO. Se rellena al pasar a `discarded`. */
  discardedAt?: string | null;
  /** userId del socio que descartó (en la práctica, el propio dueño). */
  discardedByUserId?: string | null;
  shadow: boolean;
}

/**
 * Premio de consolación ("rasca") que se genera automáticamente cuando un
 * socio gasta todas las tiradas del ciclo sin ganar ningún premio.
 *
 * Vive en la misma tabla single-table `la_cayetana_roulette` para compartir
 * patrón de claves y GSIs con el resto de ítems. Mantiene entidad y estados
 * propios para no interferir con `ROULETTE_PRIZE` (stock, `targetWinRate`,
 * etc.).
 *
 * Claves:
 *  - `PK = "CONSOLATION#<consolationId>"`, `SK = "META"`.
 *  - GSI1 (`by-user-prize`): `GSI1PK = "USER#<userId>"`,
 *    `GSI1SK = "CONSOLATION#<awardedAt-ISO>"` — permite listar rascas de un
 *    socio por fecha, compartiendo índice con los premios (se diferencian
 *    por el prefijo del SK).
 *  - GSI2 (`by-prize-status`): `GSI2PK = "CONSOLATION_STATUS#<status>"`,
 *    `GSI2SK = expiresAt` — permite barrer rascas pendientes por estado si
 *    hiciera falta un job de limpieza (hoy la expiración es lazy).
 *
 * CY1000 (usuario shadow) nunca recibe este ítem.
 */
export interface RouletteConsolationRecord {
  PK: `CONSOLATION#${string}`;
  SK: "META";
  /** Partición del socio en el GSI1 (reutilizado con los PRIZE). */
  GSI1PK?: `USER#${string}`;
  /** Prefijo `CONSOLATION#…` (distinto de `PRIZE#…`) para poder filtrar. */
  GSI1SK?: `CONSOLATION#${string}`;
  /** Se actualiza al cambiar de estado para que GSI2 lo refleje. */
  GSI2PK?: `CONSOLATION_STATUS#${ConsolationStatus}`;
  GSI2SK?: string;
  entityType: "ROULETTE_CONSOLATION";
  consolationId: string;
  userId: string;
  membershipId?: string;
  /** Ciclo de ruleta en cuyo contexto se emitió (yyyy-MM-dd local). */
  cycleId: string;
  rewardType: ConsolationRewardType;
  /** Snapshot de la etiqueta mostrada al usuario (ej. "DESCUENTO DE 1€…"). */
  rewardLabel: string;
  status: ConsolationStatus;
  awardedAt: string;
  /** ISO. El backend marca `expired` cuando `now >= expiresAt`. */
  expiresAt: string;
  redeemedAt?: string | null;
  redeemedByUserId?: string | null;
}

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
  /**
   * Importe pagado en la última cuota, en EUROS (admite decimales: 50 = 50,00 €,
   * 49.5 = 49,50 €). Stripe nos da céntimos (`session.amount_total`); en
   * `activateUserAfterPayment` los convertimos antes de persistir.
   */
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
  /**
   * Legacy / superpermiso. Mantenido por compatibilidad con cuentas existentes:
   * cuando es `true`, equivale a tener todos los flags de acceso/capacidad de
   * administración (entrada al panel, secciones, gestión de socios, reservas
   * y programación). El nuevo modelo de permisos va por flags concretos
   * (`canAccessAdmin`, `canAccessAdminSocios`, `canManageSociosActions`, etc.)
   * y `isAdmin` ya no se promueve desde la UI.
   */
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
  /** Fecha ISO en la que un admin dio de baja al socio (status → `inactive`). */
  deactivatedAt?: string;
  /** Id del admin que dio de baja al socio (auditoría). */
  deactivatedByUserId?: string;
  /**
   * Ruleta de la Suerte: si es `true`, este socio puede validar canjes en
   * taquilla (su QR se escanea desde la app del ganador para marcar el premio
   * como redeemed). Independiente de `isAdmin`: un validador de taquilla no
   * tiene por qué acceder al panel. Solo aplica a cuentas con `status = active`.
   */
  canValidatePrizes?: boolean;
  /**
   * Editar la configuración global de la Ruleta (`/admin/roulette/config`):
   * temporada, horarios, stock, tasas y consolación. Independiente de
   * `canValidatePrizes` (que solo habilita la taquilla) y de
   * `canEditUserPermissions` (que ahora se queda solo para gestión de socios).
   */
  canEditRouletteConfig?: boolean;
  /**
   * Acceso de **solo lectura** al panel `/admin/roulette` (registro de tiradas,
   * premios y rascas por jornada, con KPIs y stock). No permite editar la
   * configuración ni mutar el estado de premios. Quien tenga
   * `canEditRouletteConfig` (o `isAdmin` legacy) ya puede ver el registro
   * implícitamente; este flag sirve para perfiles de "monitor" que no
   * deben tocar la configuración.
   */
  canViewRouletteOps?: boolean;
  // ── Permisos granulares del módulo Reservas ────────────────────────────
  // Son campos opcionales para no romper compatibilidad con socios
  // existentes: `undefined` se trata como `false`. Solo tienen efecto si
  // el usuario es staff (p. ej. `isAdmin` true o cuenta interna); un socio
  // normal no los utilizará jamás.
  /** Staff: puede ver y gestionar reservas (confirmar, cambiar estado...). */
  canManageReservations?: boolean;
  /** Staff: puede escribir en el chat de una reserva (incluye adjuntar menús/cartas). */
  canReplyReservationChats?: boolean;
  /** Staff: puede editar la configuración de slots y el template de prepago. */
  canEditReservationConfig?: boolean;
  /** Staff: puede subir/editar/eliminar los documentos PDF (menús, cartas, condiciones). */
  canManageReservationDocuments?: boolean;
  /** Staff: puede escribir notas internas (visibles solo para staff) en una reserva. */
  canWriteReservationNotes?: boolean;
  /**
   * Permite editar permisos de otros socios desde el modal. Llave “maestra”
   * dentro del backoffice: quien tenga esto puede cambiar cualquier flag
   * (incluido el suyo). Implica acceso a `/admin/users`.
   */
  canEditUserPermissions?: boolean;
  /**
   * Puerta del área de administración (`/admin`). Quien lo tenga ve el hub
   * (aunque luego solo aparezcan las tarjetas para las que tenga sección).
   */
  canAccessAdmin?: boolean;
  /**
   * Acceso a Administración · Socios (`/admin/users`).
   */
  canAccessAdminSocios?: boolean;
  /**
   * Acciones de socios: activar/renovar, marcar entregado / deshacer entrega,
   * importar y exportar Excel. Sin este flag el panel de socios queda en
   * modo solo lectura para esa cuenta.
   */
  canManageSociosActions?: boolean;
  /**
   * Acceso al backoffice de reservas (`/admin/reservas`). Las acciones dentro
   * dependen de los permisos finos del módulo.
   */
  canAccessAdminReservas?: boolean;
  /**
   * Acceso a Administración · Programación (`/admin/programacion`).
   */
  canAccessAdminProgramacion?: boolean;
  /**
   * Permite enviar invitaciones de alta a nuevos socios desde el panel.
   * El invitado completa sus datos sin pasar por Stripe y queda en
   * `active` automáticamente al aceptar la invitación.
   */
  canInviteSocios?: boolean;
  /**
   * Permite editar la ficha de un socio (nombre, teléfono, sexo, año de
   * nacimiento). El email y la contraseña se cambian por flujos propios.
   */
  canEditSociosProfile?: boolean;
  /**
   * Permite dar de baja a un socio: cambia su estado a `inactive` sin
   * borrar el registro. La reactivación pasa por el flujo manual normal.
   */
  canDeactivateSocios?: boolean;
}

/**
 * Token de un solo uso para invitar a un nuevo socio (alta sin Stripe).
 * Vive en la misma tabla Dynamo que los usuarios.
 *
 * Se genera al pulsar "Invitar socio" desde admin: se persiste hasheado
 * (SHA-256) y se envía el token en claro por email; el invitado lo abre
 * en `/invitacion?token=…`, completa sus datos y queda activo.
 */
export interface MemberInviteRecord {
  /** `INVITE#<sha256(token)>` */
  id: string;
  entityType: "MEMBER_INVITE";
  email: string;
  /** Nombre (opcional) precargado por el admin al invitar. */
  name?: string;
  /** Teléfono (opcional) precargado por el admin al invitar. */
  phone?: string;
  /** Id del usuario que envió la invitación (auditoría). */
  invitedByUserId: string;
  /** Cuándo caduca (ISO). */
  expiresAt: string;
  /** TTL nativo de DynamoDB para limpiar la invitación. */
  ttlEpoch: number;
  createdAt: string;
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
  /**
   * Hora local (0..23) a la que la jornada termina y la ruleta queda
   * **cerrada** (no se pueden iniciar tiradas) hasta `cycleStartHour`.
   * Por defecto 4 → jornada "abierta" 13:00 → 04:00, cerrada 04:00 → 13:00.
   * El usuario shadow nunca se ve afectado por esta ventana.
   */
  closedWindowStartHour: number;
  /**
   * Hora local (0..23) a la que la ruleta vuelve a estar operativa. Se usa
   * solo para calcular `opensAt` en el cliente; se asume igual a
   * `cycleStartHour`, pero se guarda explícito por claridad y por si en el
   * futuro se quieren separar (p. ej. cerrar antes del siguiente ciclo).
   * Por defecto 13.
   */
  closedWindowEndHour: number;
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
  /**
   * Fecha local de inicio de la temporada (`yyyy-MM-dd`, en `timezone`),
   * inclusiva. Mientras la fecha local actual sea anterior, no se permiten
   * tiradas y `getStatusForUser` devuelve `seasonClosed: true` con motivo
   * `"before_season"`. `null` = sin límite de inicio (comportamiento previo).
   *
   * No afecta a premios/rascas ya emitidos (su `expiresAt` se respeta) ni al
   * usuario shadow (CY1000), que se salta el control de temporada.
   */
  seasonStartDate?: string | null;
  /**
   * Fecha local de fin de la temporada (`yyyy-MM-dd`, en `timezone`),
   * inclusiva. Pasada esa fecha local, no se permiten tiradas y
   * `getStatusForUser` devuelve `seasonClosed: true` con motivo
   * `"after_season"`. `null` = sin límite de fin.
   */
  seasonEndDate?: string | null;
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

// ─── Reservas (módulo conversacional de reservas de menú/mesa) ────────────

/**
 * Identifica a quién pertenece una reserva. Solo uno de los dos ids estará
 * presente según el canal de creación: socios logueados usan `userId`;
 * invitados sin cuenta usan `guestId`. No se mezclan.
 */
export interface ReservationIdentity {
  userId: string | null;
  guestId: string | null;
}

/**
 * Estados por los que pasa una reserva. Son independientes del estado del
 * chat y del estado de pago; se actualizan con `TransactWrite` + `version`
 * para evitar carreras entre staff y cliente.
 *
 *  - `pending`: el cliente envió la solicitud y staff aún no respondió.
 *  - `awaiting_customer`: staff respondió y espera aceptación del cliente
 *    (normalmente tras un cambio de hora/condiciones).
 *  - `awaiting_prepayment`: reserva con ≥ 8 personas pendiente de pago por
 *    transferencia manual. Staff debe confirmar la recepción.
 *  - `confirmed`: reserva en firme, visible en el tablero de servicio.
 *  - `cancelled_by_customer`: el cliente canceló desde la app / magic link.
 *  - `cancelled_by_staff`: staff canceló desde el panel (p. ej. aforo).
 *  - `no_show`: staff marcó que no se presentó (auditoría).
 *  - `completed`: staff marcó que asistió y terminó el servicio.
 *
 * Se consideran "activas y no finalizadas" (para la pantalla de decisión
 * en la app) los estados: `pending`, `awaiting_customer`,
 * `awaiting_prepayment`, `confirmed`.
 */
export type ReservationStatus =
  | "pending"
  | "awaiting_customer"
  | "awaiting_prepayment"
  | "confirmed"
  | "cancelled_by_customer"
  | "cancelled_by_staff"
  | "no_show"
  | "completed";

/**
 * Estado del prepago (solo aplica a reservas con `partySize >= 8`). En
 * reservas menores de 8 este campo es `not_required`.
 */
export type PrepaymentStatus =
  | "not_required"
  | "pending_instructions"
  | "awaiting_transfer"
  | "received"
  | "refunded";

/**
 * Justificante de señal (PDF/imagen) con importe. Varias entradas por reserva
 * reempluyen el modelo de un solo `prepaymentProofS3Key` antiguo.
 */
export interface PrepaymentProofItem {
  proofId: string;
  s3Key: string;
  fileName: string;
  /** Céntimos abonados documentados con este justificante. */
  amountCents: number;
  uploadedAt: string;
}

/** entityType de cada ítem de `la_cayetana_reservations` (discriminante). */
export type ReservationEntityType =
  | "RESERVATION"
  | "RESERVATION_MESSAGE"
  | "RESERVATION_EVENT"
  | "RESERVATION_NOTE"
  | "RESERVATION_GUEST"
  | "RESERVATION_DOCUMENT"
  | "RESERVATION_CONFIG"
  | "RESERVATION_OTP";

/**
 * Código OTP de un solo uso para que un guest recupere el acceso a sus
 * reservas sin abrir el magic link del email.
 *
 * Claves:
 *  - `PK = "OTP#<emailNormalized>"`, `SK = "CURRENT"`.
 *
 * Un solo registro por email — al pedir un código nuevo sobreescribimos
 * el anterior (invalida implicitamente los intentos acumulados). El
 * código se guarda hasheado (SHA-256 con `pepper`) para que ni siquiera
 * el operador pueda leerlo en DynamoDB. `expiresAtIso` es el corte
 * real; el atributo TTL nativo de DynamoDB (`ttlEpoch`) lo limpia
 * automáticamente pasados unos minutos para no ensuciar la tabla.
 */
export interface ReservationOtpRecord {
  PK: `OTP#${string}`;
  SK: "CURRENT";
  entityType: "RESERVATION_OTP";
  emailNormalized: string;
  codeHash: string;
  attempts: number;
  /** Epoch en segundos para el atributo TTL nativo de DynamoDB. */
  ttlEpoch: number;
  /** ISO string de expiración (para lógica en código). */
  expiresAtIso: string;
  createdAt: string;
}

/**
 * Datos de contacto denormalizados de la reserva. Se guardan junto a la
 * `RESERVATION` (aunque el usuario esté logueado) para que el tablero de
 * servicio pueda leer en una única llamada todo lo necesario.
 */
export interface ReservationContactSnapshot {
  name: string;
  email: string;
  /** Normalizado a E.164 si es posible; si no, limpio de espacios. */
  phone: string;
}

/**
 * Ítem principal de una reserva.
 *
 * Claves:
 *  - `PK = "RES#<reservationId>"`, `SK = "META"`.
 *  - GSI1 `by-status-date`: `GSI1PK = "STATUS#<status>"`,
 *    `GSI1SK = "<reservationStartAtIso>#<reservationId>"`.
 *  - GSI2 `by-date`: `GSI2PK = "DATE#<yyyy-MM-dd>"`,
 *    `GSI2SK = "<startMinutes>#<reservationId>"` (ordenado por hora).
 *  - GSI3 `by-customer`:
 *      `GSI3PK = "USER#<userId>"` o `"GUEST#<guestId>"`,
 *      `GSI3SK = "<reservationStartAtIso>#<reservationId>"` — permite
 *      listar del más próximo al más lejano.
 *  - GSI4 `by-email`: `GSI4PK = "EMAIL#<normalizedEmail>"`,
 *    `GSI4SK = "RES#<createdAt>#<reservationId>"` — se usa tanto para
 *    detectar duplicados entre canales (user ↔ guest) como para que staff
 *    encuentre todas las reservas de un email.
 */
export interface ReservationRecord {
  PK: `RES#${string}`;
  SK: "META";
  GSI1PK?: `STATUS#${ReservationStatus}`;
  GSI1SK?: string;
  GSI2PK?: `DATE#${string}`;
  GSI2SK?: string;
  GSI3PK?: `USER#${string}` | `GUEST#${string}`;
  GSI3SK?: string;
  GSI4PK?: `EMAIL#${string}`;
  GSI4SK?: string;
  entityType: "RESERVATION";
  reservationId: string;

  // Identidad del cliente (uno y solo uno de los dos es no-null).
  userId: string | null;
  guestId: string | null;
  membershipId?: string;

  // Snapshot de contacto (denormalizado, ver `ReservationContactSnapshot`).
  contact: ReservationContactSnapshot;

  // Fecha + hora elegidas por el cliente. `reservationDate` en local
  // `yyyy-MM-dd`, `reservationTime` en `HH:mm` local 24h. La conversión
  // a instante UTC la hacemos aquí para indexar por GSI.
  reservationDate: string;
  reservationTime: string;
  /** Instante UTC (ISO) equivalente a `reservationDate + reservationTime`. */
  reservationStartAtIso: string;
  /** Minuto del día (0..1439) — sirve para ordenar dentro del GSI2. */
  startMinutes: number;

  partySize: number;
  /**
   * Etiqueta de mesa asignada en sala (texto libre, p. ej. "3" o "12A").
   * Solo backoffice; no afecta a índices.
   */
  tableLabel?: string;
  /** Petición textual libre (alérgenos, cumpleaños, decoración...). */
  notes?: string;
  /**
   * Menús elegidos: la suma de `quantity` debe ser igual a `partySize`.
   * Incluye snapshot de nombre, importe y principales. Reservas antiguas
   * pueden no tener el campo.
   */
  menuLineItems?: ReservationMenuLineItem[];

  status: ReservationStatus;
  prepaymentStatus: PrepaymentStatus;

  /** Importe de prepago en céntimos, si aplica. */
  prepaymentAmountCents?: number;
  /** Deadline ISO para transferir (se fija al pasar a `awaiting_prepayment`). */
  prepaymentDeadlineAt?: string;
  /** Instrucciones de prepago personalizadas para esta reserva (snapshot). */
  prepaymentInstructions?: string;
  prepaymentReceivedAt?: string;
  prepaymentReceivedByUserId?: string;
  /**
   * Justificante de señal subido al marcar "recibido" (staff). Privado, S3.
   * @deprecated Sustituido por `prepaymentProofItems`; se conserva en lectura/migración.
   */
  prepaymentProofS3Key?: string;
  /**
   * Nombre original del archivo (solo backoffice / auditoría).
   * @deprecated Sustituido por `prepaymentProofItems`.
   */
  prepaymentProofFileName?: string;
  /** Varios comprobantes con importe. Si existen, prevalecen sobre la pareja legacy. */
  prepaymentProofItems?: PrepaymentProofItem[];

  /** Último evento público/ cliente (para pintar la pantalla rápida). */
  lastClientVisibleStatus?: ReservationStatus;

  createdAt: string;
  /** Canal desde el que se creó (`app` para logueados, `guest_link` para guest). */
  createdVia: "app" | "guest_link";
  /** Timestamp del último update (cualquier cambio en la reserva). */
  updatedAt: string;
  /** Quien hizo el último cambio (staff userId, cliente userId o `guest:<guestId>`). */
  updatedBy?: string;

  /** Optimistic concurrency: se incrementa con cada `updateReservation`. */
  version: number;

  // Contadores para la UI. No son la verdad absoluta (la verdad son los
  // MSG), pero permiten pintar el badge de "no leídos" sin hacer query.
  unreadForStaff: number;
  unreadForCustomer: number;
  lastMessageAt?: string;
}

/**
 * Mensaje de chat de una reserva. Append-only.
 *  - `PK = "RES#<reservationId>"`, `SK = "MSG#<createdAt>#<messageId>"`.
 */
export interface ReservationMessageRecord {
  PK: `RES#${string}`;
  SK: `MSG#${string}`;
  entityType: "RESERVATION_MESSAGE";
  messageId: string;
  reservationId: string;
  /** Quien envía: el cliente o un staff concreto. */
  authorType: "customer" | "staff" | "system";
  /** userId del staff si `authorType === "staff"`. Si es customer, el userId/guestId del cliente. */
  authorId: string | null;
  /** Nombre visible del autor (snapshot): "Juan" o "Equipo La Cayetana". */
  authorDisplayName: string;
  body: string;
  createdAt: string;
  /** Referencias a documentos (p. ej. "carta-2026.pdf") adjuntados. */
  documentIds?: string[];
  /** `true` si lo leyó el cliente; los mensajes del cliente empiezan `true` por el propio cliente. */
  readByCustomerAt?: string | null;
  readByStaffAt?: string | null;
}

/**
 * Evento de auditoría (cambio de estado, cancelación, prepago recibido...).
 * Append-only. No se muestran al cliente salvo los marcados como públicos.
 *  - `PK = "RES#<reservationId>"`, `SK = "EVT#<createdAt>#<eventId>"`.
 */
export interface ReservationEventRecord {
  PK: `RES#${string}`;
  SK: `EVT#${string}`;
  entityType: "RESERVATION_EVENT";
  eventId: string;
  reservationId: string;
  /** Código normalizado del evento (`status_changed`, `prepayment_received`, ...). */
  kind: string;
  /** Metadata arbitraria (estado anterior/nuevo, importe, etc.). */
  meta?: Record<string, unknown>;
  /** Si es `true`, se muestra en la línea de tiempo del cliente. */
  publicToCustomer: boolean;
  createdAt: string;
  createdBy: string;
}

/**
 * Nota interna del staff sobre una reserva. Nunca visible para cliente.
 *  - `PK = "RES#<reservationId>"`, `SK = "NOTE#<createdAt>#<noteId>"`.
 */
export interface ReservationNoteRecord {
  PK: `RES#${string}`;
  SK: `NOTE#${string}`;
  entityType: "RESERVATION_NOTE";
  noteId: string;
  reservationId: string;
  body: string;
  createdAt: string;
  createdByUserId: string;
  createdByDisplayName: string;
}

/**
 * Ficha de invitado (guest, sin cuenta). Se crea la primera vez que un
 * email no registrado hace una reserva; se reutiliza en visitas futuras
 * del mismo email.
 *  - `PK = "GUEST#<guestId>"`, `SK = "META"`.
 *  - GSI4 `by-email`: `GSI4PK = "EMAIL#<normalizedEmail>"`,
 *    `GSI4SK = "GUEST#<guestId>"`.
 */
export interface GuestRecord {
  PK: `GUEST#${string}`;
  SK: "META";
  GSI4PK?: `EMAIL#${string}`;
  GSI4SK?: `GUEST#${string}`;
  entityType: "RESERVATION_GUEST";
  guestId: string;
  name: string;
  email: string;
  /** Email normalizado (lowercase + trim) usado como clave de índices. */
  emailNormalized: string;
  phone: string;
  /**
   * Versión incremental de las sesiones del guest. Se aumenta cuando staff
   * aplica un cambio significativo en cualquiera de sus reservas (fecha,
   * hora, estado relevante) para invalidar el magic link previo.
   */
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Documento PDF (carta, menús, condiciones de prepago...). Se sirve a
 * través del endpoint proxy `/api/reservations/documents/:id/file`; el
 * bucket S3 es privado.
 *  - `PK = "DOC#<documentId>"`, `SK = "META"`.
 */
export type ReservationDocumentKind =
  | "menu"
  | "carta"
  | "bebidas"
  | "prepayment_terms"
  | "other";

export interface ReservationDocumentRecord {
  PK: `DOC#${string}`;
  SK: "META";
  entityType: "RESERVATION_DOCUMENT";
  documentId: string;
  kind: ReservationDocumentKind;
  title: string;
  description?: string;
  /** Clave S3 dentro de `RESERVATION_DOCS_S3_BUCKET`. */
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  /** Si es `true`, aparece en el catálogo mostrado al cliente desde el chat. */
  visibleToCustomer: boolean;
  /** Orden dentro del listado visible (asc). */
  sortOrder: number;
  createdAt: string;
  createdByUserId: string;
  updatedAt: string;
  updatedByUserId?: string;
}

/**
 * Configuración de slots de reservas. Define los tramos permitidos por día
 * de la semana y excepciones concretas por fecha (cierres, festivos,
 * horarios especiales). Ítem único:
 *  - `PK = "CONFIG"`, `SK = "SLOTS"`.
 */
export interface ReservationSlotWindow {
  /** `HH:mm` local 24h, inclusive. */
  from: string;
  /** `HH:mm` local 24h, inclusive. Si `to < from`, se interpreta día siguiente. */
  to: string;
  /** Paso en minutos (p. ej. 30 → slots 13:00, 13:30, 14:00...). */
  stepMinutes: number;
  /** Capacidad máxima simultánea en este tramo (comensales totales). */
  capacity: number;
}

export interface ReservationSlotDay {
  windows: ReservationSlotWindow[];
}

export type ReservationWeekdayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export interface ReservationConfigSlotsRecord {
  PK: "CONFIG";
  SK: "SLOTS";
  entityType: "RESERVATION_CONFIG";
  /** Zona horaria IANA (`Europe/Madrid`). */
  timezone: string;
  /** Configuración por día de la semana. */
  byWeekday: Record<ReservationWeekdayKey, ReservationSlotDay>;
  /**
   * Excepciones por fecha concreta (`yyyy-MM-dd`). Si la clave existe,
   * SUSTITUYE a la de `byWeekday` para ese día. `windows = []` = cerrado.
   */
  exceptions: Record<string, ReservationSlotDay>;
  /** Anticipación mínima en minutos desde `now` hasta el slot. Por defecto 120. */
  advanceMinMinutes: number;
  /** Máxima anticipación en días desde `now` hasta el slot. Por defecto 60. */
  advanceMaxDays: number;
  /**
   * Rango fijo (opcional) de fechas reservables por el cliente, `yyyy-MM-dd`
   * en `timezone`. Se combina con la anticipación: fecha efectiva en
   * [max(hoy, from), min(hoy+advanceMaxDays, until)].
   */
  bookableFromDate?: string;
  bookableUntilDate?: string;
  /** Mínimo y máximo de comensales aceptados por reserva. */
  minPartySize: number;
  maxPartySize: number;
  updatedAt: string;
  updatedByUserId?: string;
}

/**
 * Configuración del prepago manual (solo reservas `partySize >= 8`).
 *  - `PK = "CONFIG"`, `SK = "PREPAYMENT"`.
 */
export interface ReservationConfigPrepaymentRecord {
  PK: "CONFIG";
  SK: "PREPAYMENT";
  entityType: "RESERVATION_CONFIG";
  /** Si es `false`, no se pide prepago en ninguna reserva. */
  enabled: boolean;
  /** Nº mínimo de comensales a partir del cual se exige prepago. */
  minPartySize: number;
  /** Importe por persona en céntimos (10 € → 1000). */
  amountPerPersonCents: number;
  /** Horas desde la solicitud para que el cliente transfiera. */
  deadlineHours: number;
  /**
   * Plantilla editable que staff ve y puede personalizar al cambiar estado
   * a `awaiting_prepayment`. Soporta placeholders:
   *  `{{amount}}`, `{{deadline}}`, `{{reservationDate}}`, `{{reservationTime}}`,
   *  `{{partySize}}`, `{{reservationId}}`.
   */
  instructionsTemplate: string;
  updatedAt: string;
  updatedByUserId?: string;
}

/** Oferta de menú (catálogo editado en la config de reservas). */
export interface ReservationMenuOffer {
  offerId: string;
  name: string;
  /** Importe de referencia en céntimos. */
  priceCents: number;
  /**
   * Hasta 4 textos fijos por posición (puede incluir cadenas vacías).
   * Antes de mostrar al cliente se omiten vacíos. Longitud 4 al guardar.
   */
  mainCourses: string[];
  active: boolean;
  sortOrder: number;
  imageS3Key?: string;
  imageContentType?: string;
}

/**
 * Catálogo de menús ofrecidos.
 *  - `PK = "CONFIG"`, `SK = "MENUS"`.
 */
export interface ReservationConfigMenusRecord {
  PK: "CONFIG";
  SK: "MENUS";
  entityType: "RESERVATION_CONFIG";
  offers: ReservationMenuOffer[];
  updatedAt: string;
  updatedByUserId?: string;
}

/**
 * Cierres (gates) para funcionalidades públicas de la web, editables
 * desde admin.
 *  - `PK = "CONFIG"`, `SK = "CARNET"` (SK heredado; el ítem agrupa
 *    ahora todos los cierres para evitar múltiples lecturas).
 *  Misma tabla que reservas.
 */
export interface ReservationConfigAccessGatesRecord {
  PK: "CONFIG";
  SK: "CARNET";
  entityType: "RESERVATION_CONFIG";
  /**
   * Tras este instante (ISO/UTC) se bloquean altas de nuevos socios vía
   * web. `FECHA_LIMITE_COMPRA_CARNET` (env), si está definida, manda.
   */
  carnetPurchaseDeadlineIso?: string;
  /** Tras este instante se desactiva crear nuevas reservas de mesa. */
  tableReservationDeadlineIso?: string;
  /**
   * Tras este instante se desactiva el login público (los administradores
   * siguen pudiendo entrar por bypass).
   */
  loginDeadlineIso?: string;
  updatedAt: string;
  updatedByUserId?: string;
}

/** @deprecated Alias retrocompatible de `ReservationConfigAccessGatesRecord`. */
export type ReservationConfigCarnetRecord = ReservationConfigAccessGatesRecord;

/** Línea persistida en la reserva (snapshot). */
export interface ReservationMenuLineItem {
  offerId: string;
  quantity: number;
  nameSnapshot: string;
  priceCents: number;
  mainCoursesSnapshot: string[];
}

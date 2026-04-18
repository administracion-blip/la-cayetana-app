import type Stripe from "stripe";
import { sendWelcomeRegistrationEmail } from "@/lib/email/transactional";
import {
  activateUserAfterPayment,
  getUserById,
  getUserByStripeSessionId,
  markWelcomeEmailSent,
} from "@/lib/repositories/users";
import type { UserRecord } from "@/types/models";

/**
 * Dada una Checkout Session de Stripe, intenta activar el preregistro asociado
 * (si aún no lo estaba) y envía correo de bienvenida una sola vez. Idempotente.
 * Devuelve el usuario actualizado o null si no se pudo localizar.
 */
export async function activateUserFromCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<UserRecord | null> {
  if (session.payment_status !== "paid") return null;

  const userIdFromRef =
    typeof session.client_reference_id === "string" &&
    session.client_reference_id.length > 0
      ? session.client_reference_id
      : null;
  const userIdFromMeta =
    typeof session.metadata?.userId === "string" &&
    session.metadata.userId.length > 0
      ? session.metadata.userId
      : null;

  let user: UserRecord | null = null;
  const userId = userIdFromRef ?? userIdFromMeta;
  if (userId) {
    user = await getUserById(userId);
  }
  if (!user) {
    // Fallback: preregistros antiguos identificados por el bloqueo de stripeSessionId.
    user = await getUserByStripeSessionId(session.id);
  }
  if (!user) {
    console.warn(
      "[checkout-activation] pago sin preregistro asociado",
      session.id,
    );
    return null;
  }

  const { user: activated, justActivated } = await activateUserAfterPayment({
    userId: user.id,
    stripeSessionId: session.id,
    stripePaymentStatus: session.payment_status,
    amountTotal: session.amount_total,
  });

  if (
    justActivated ||
    (activated.status === "active" && activated.welcomeEmailSent !== true)
  ) {
    if (activated.membershipId) {
      try {
        const sent = await sendWelcomeRegistrationEmail({
          toEmail: activated.email,
          name: activated.name,
          membershipId: activated.membershipId,
          phone: activated.phone,
        });
        if (sent) {
          await markWelcomeEmailSent(activated.id);
        }
      } catch (e) {
        console.error("[checkout-activation] email bienvenida", e);
      }
    }
  }

  return activated;
}

import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { hashResetToken } from "@/lib/auth/reset-token";
import {
  deletePasswordReset,
  getPasswordReset,
  isPasswordResetExpired,
} from "@/lib/repositories/password-reset";
import { getUserById, updatePasswordHashByUserId } from "@/lib/repositories/users";
import { resetPasswordSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = resetPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos no válidos (contraseña mín. 8 caracteres)" },
        { status: 400 },
      );
    }

    const { token, password } = parsed.data;
    const tokenHash = hashResetToken(token);
    const record = await getPasswordReset(tokenHash);

    if (!record || isPasswordResetExpired(record)) {
      return NextResponse.json(
        { error: "El enlace ha caducado o no es válido. Solicita uno nuevo." },
        { status: 400 },
      );
    }

    const user = await getUserById(record.userId);
    if (!user || user.status !== "active") {
      await deletePasswordReset(tokenHash);
      return NextResponse.json(
        { error: "No se puede restablecer la contraseña para esta cuenta." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    await updatePasswordHashByUserId(user.id, passwordHash);
    await deletePasswordReset(tokenHash);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo cambiar la contraseña" },
      { status: 500 },
    );
  }
}

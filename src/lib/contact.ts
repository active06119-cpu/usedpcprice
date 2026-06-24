export function getContactInfo() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;
  const telegramRaw = process.env.NEXT_PUBLIC_CONTACT_TELEGRAM?.trim() || null;
  const telegramUsername = telegramRaw?.replace(/^@/, "") || null;
  const telegramUrl = telegramUsername ? `https://t.me/${telegramUsername}` : null;

  return { email, telegramUsername, telegramUrl };
}

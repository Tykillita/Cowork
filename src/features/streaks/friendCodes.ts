export type PublicPerson = { uid: string; name: string; photoURL: string };
export interface FriendCodeView extends PublicPerson { code: string }
export type RequestDirection = "incoming" | "outgoing";
export type RequestStatus = "pending" | "accepted" | "rejected" | "cancelled" | "expired";
export interface FriendRequestView {
  id: string; name: string; photoURL: string; direction: RequestDirection;
  kind: "friend" | "streak";
  status: RequestStatus; expiresAt: number; createdAt: number;
}
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function normalizeFriendCode(input: string): string {
  const value = input.toUpperCase().replace(/[\s-]/g, "");
  const code = value.length === 10 && value.startsWith("CW") ? value.slice(2) : value;
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) throw Object.assign(new Error("Escribe un código de amigo válido, como CW-7K9M-2X4P."), { code: "cowork/precondition" });
  return code;
}
export const formatFriendCode = (code: string) => `CW-${code.slice(0, 4)}-${code.slice(4)}`;
export const randomFriendCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => CODE_ALPHABET[byte & 31]).join("");

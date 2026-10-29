export function passwordError(password) {
  if ([...password].length < 12) return 'Choose a password with at least 12 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Your password is too long. Use at most 72 bytes; accented characters and emoji use more space.';
  return '';
}

function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const cfg = useRuntimeConfig()
  return safeEqual(username, cfg.adminUsername) && safeEqual(password, cfg.adminPassword)
}

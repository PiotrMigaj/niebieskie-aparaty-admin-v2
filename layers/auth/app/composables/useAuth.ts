import type { LoginInput } from '#layers/auth/shared/types/schemas'

export function useAuth() {
  const { loggedIn, user, session, fetch: refreshSession, clear } = useUserSession()

  async function login(input: LoginInput) {
    await $fetch('/api/auth/login', { method: 'POST', body: input })
    await refreshSession()
    await navigateTo('/')
  }

  async function logout() {
    await clear()
    await navigateTo('/login')
  }

  return { loggedIn, user, session, login, logout }
}

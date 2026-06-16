export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    const config = useRuntimeConfig()
    const allowableEmails = (config.allowableEmails as string ?? '')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean)

    if (!allowableEmails.includes(user.email)) {
      return sendRedirect(event, '/login?error=unauthorized')
    }

    await setUserSession(event, {
      user: {
        name: user.name ?? user.email,
        role: 'admin',
        email: user.email,
      },
      loggedInAt: new Date(),
    })
    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth')
  },
})

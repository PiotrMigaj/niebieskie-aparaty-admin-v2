const PROTECTED_PATHS = [
  '/api/users',
  '/api/events',
  '/api/galleries',
  '/api/selections',
  '/api/files',
]

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!PROTECTED_PATHS.some(prefix => path.startsWith(prefix))) return
  await requireUserSession(event)
})

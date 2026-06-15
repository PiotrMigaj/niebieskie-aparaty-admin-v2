export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const { cloudFrontDistributionId } = useRuntimeConfig()

  return await invalidatePaths(cloudFrontDistributionId, [
    `/${username}/${eventId}/selection/*`,
  ])
})

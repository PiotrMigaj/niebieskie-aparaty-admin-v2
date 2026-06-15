export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const { galleryCloudFrontDistributionId } = useRuntimeConfig()

  return await invalidatePaths(galleryCloudFrontDistributionId, [
    `/${username}/${eventId}/*`,
  ])
})

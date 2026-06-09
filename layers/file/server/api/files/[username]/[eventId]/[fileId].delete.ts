import { fileRepository } from '#layers/file/server/repository/fileRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!
  const fileId = getRouterParam(event, 'fileId')!

  const file = await fileRepository.findOne(username, eventId, fileId)
  if (!file) throw createError({ statusCode: 404, message: 'File not found' })

  const { uploadBucketName } = useRuntimeConfig()

  await getS3().send(new DeleteObjectCommand({ Bucket: uploadBucketName, Key: file.objectKey }))
  await fileRepository.deleteFile(username, eventId, fileId)

  return { success: true }
})

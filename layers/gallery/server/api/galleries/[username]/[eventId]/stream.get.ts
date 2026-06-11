import { createEventStream } from 'h3'
import { galleryRepository } from '../../../../repository/galleryRepository'
import { galleryItemRepository } from '../../../../repository/galleryItemRepository'

const TICK_MS = 3000

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const stream = createEventStream(event)
  let cancelled = false
  stream.onClosed(() => {
    cancelled = true
  })

  const tick = async (): Promise<boolean> => {
    const gallery = await galleryRepository.findByUsernameAndEventId(username, eventId)
    if (!gallery) {
      await stream.push({ event: 'not-found', data: '{}' })
      return false
    }
    const items = await galleryItemRepository.findAllForEvent(username, eventId)
    await stream.push({
      event: 'gallery',
      data: JSON.stringify({ ...gallery, items }),
    })
    return gallery.isUploaded !== true
  }

  const runLoop = async () => {
    try {
      let keepGoing = await tick()
      while (keepGoing && !cancelled) {
        await sleep(TICK_MS)
        if (cancelled) break
        keepGoing = await tick()
      }
    } catch (e) {
      console.error('[gallery stream]', e)
    } finally {
      if (!cancelled) await stream.close()
    }
  }

  runLoop()

  return stream.send()
})

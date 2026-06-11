# Backend Patterns

## Repository Pattern

One class per domain entity. Lives in `layers/<name>/server/repository/<entity>Repository.ts`. Exported as a singleton instance.

```ts
class EventRepository {
  async persist(input: CreateEventInput): Promise<Event> { ... }
  async findAll(username: string): Promise<Event[]> { ... }
  async findByUsername(username: string): Promise<Event | undefined> { ... }
}

export const eventRepository = new EventRepository()
```

Rules:
- Always maps raw DynamoDB items to domain types before returning — never expose `$metadata`, internal key fields, or GSI attributes to callers
- Generates IDs internally (`crypto.randomUUID()`) — callers pass business data only
- Uses `getDynamoDb()` and `TABLE_NAME` from the base layer (auto-imported, no import statement needed)
- All DynamoDB command classes (`PutCommand`, `QueryCommand`, `GetCommand`, `DeleteCommand`, `UpdateCommand`, `TransactWriteCommand`) are also auto-imported

## API Route Handlers

File naming follows Nitro conventions: `index.get.ts`, `index.post.ts`, `[username].get.ts`, `[eventId].delete.ts`.

Standard handler sequence:

```ts
export default defineEventHandler(async (event) => {
  // 1. Validate — readValidatedBody auto-converts ZodError to 422
  const body = await readValidatedBody(event, (b) => CreateEventSchema.parse(b))

  // 2. Domain logic — cross-entity checks before write
  const user = await userRepository.findByUsername(body.username)
  if (!user) throw createError({ statusCode: 404, message: 'User not found' })

  // 3. Persist
  const created = await eventRepository.persist(body)

  // 4. Return — H3 serializes to JSON automatically
  return created
})
```

For GET handlers use `getQuery(event)` for query params and `getRouterParam(event, 'username')` for path params.

## DynamoDB Patterns

**Conditional put (prevent duplicates):**
```ts
await getDynamoDb().send(new PutCommand({
  TableName: TABLE_NAME,
  Item: { ... },
  ConditionExpression: 'attribute_not_exists(PK)',
}))
// Catch ConditionalCheckFailedException → throw createError({ statusCode: 409 })
```

**Item collection query (all events for a user):**
```ts
await getDynamoDb().send(new QueryCommand({
  TableName: TABLE_NAME,
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: { ':pk': `USER#${username}`, ':prefix': 'EVENT#' },
}))
```

**Direct get (single item, O(1)):**
```ts
await getDynamoDb().send(new GetCommand({
  TableName: TABLE_NAME,
  Key: { PK: `USER#${username}`, SK: '#PROFILE' },
}))
```

**GSI query (list all users):**
```ts
await getDynamoDb().send(new QueryCommand({
  TableName: TABLE_NAME,
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: { ':pk': 'ENTITY#USER' },
}))
```

GSI `IndexName` strings match the field prefix exactly: `'GSI1'`, `'GSI2'`.

For the full entity key schema and access patterns see `dynamodb-desing/single-table-design.md`.

## Validation

Zod schemas live in `layers/<name>/shared/schemas.ts` so they're usable on both server and client.

```ts
// shared/schemas.ts
export const CreateEventSchema = z.object({ ... })
export type CreateEventInput = z.infer<typeof CreateEventSchema>
```

`readValidatedBody(event, (b) => Schema.parse(b))` auto-converts `ZodError` to HTTP 422 — no manual wrapping needed.

## Error Handling

| Situation | How to throw |
|-----------|-------------|
| Entity not found | `throw createError({ statusCode: 404 })` |
| Duplicate / conflict | `throw createError({ statusCode: 409 })` |
| Validation error | Handled automatically by `readValidatedBody` (422) |
| Business rule violation | `throw createError({ statusCode: 422, message: '...' })` |

H3 includes `stack` in error responses only in dev. Production strips it automatically. To suppress in dev, set `nitro.errorHandler` in `nuxt.config.ts`.

## Auto-Imports Available in Server Code

No import statement needed for any of these:

- `hashPassword`, `verifyPassword`, `passwordNeedsReHash` — from `nuxt-auth-utils`
- `getDynamoDb()`, `TABLE_NAME` — from `layers/base/server/utils/dynamoDb.ts`
- `PutCommand`, `QueryCommand`, `GetCommand`, `DeleteCommand`, `UpdateCommand`, `TransactWriteCommand`, `BatchWriteCommand` — re-exported from base layer
- All utilities exported from `layers/*/shared/utils/`
- `isError(e)` — H3 built-in; returns `true` if `e` is already an H3Error. Use in `catch` blocks as `if (isError(e)) throw e` so `createError()` thrown inside a repository propagates correctly instead of being wrapped in a generic 500.

**Do NOT** export a function named `hashPassword` from `shared/utils/` — it shadows the nuxt-auth-utils global.

Node.js built-ins (`node:crypto`, `node:util`, `Buffer`) are NOT available in `shared/utils/` files (compiled under a shared tsconfig with `"types": []`). Keep Node-dependent code in `server/utils/` instead.

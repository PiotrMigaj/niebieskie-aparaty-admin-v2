# DynamoDB Single Table Design PROPOSAL Schema

## 📋 Entity Table Layout

This schema uses **Strict Prefix Isolation** to prevent over-fetching. By giving every entity its own distinct starting word in the Sort Key (SK), we can retrieve exact item types without unintentionally pulling nested or related data.

| Entity | Partition Key (`PK`) | Sort Key (`SK`) | `GSI1PK` (Optional) |
| :--- | :--- | :--- | :--- |
| **User** | `USER#<username>` | `#PROFILE` | `ENTITY#USER` |
| **Event** | `USER#<username>` | `EVENT#<event_uuid>` | |
| **Selection** | `USER#<username>` | `SELECTION#<event_uuid>` | |
| **Selection Item** | `USER#<username>` | `SELECTION_ITEM#<event_uuid>#<item_uuid>` | |
| **Gallery Item** | `USER#<username>` | `GALLERY#<event_uuid>#<item_uuid>` | |

---

## 🎯 Access Patterns & Queries

Here is the exact DynamoDB operation and Key Condition Expression required for each access pattern:

### 1. Users
* **Find all users**
    * **Operation:** `Query` (on Global Secondary Index `GSI1`)
    * **Condition:** `GSI1PK = ENTITY#USER`
    * *Note: This groups all users under one index partition for admin/listing purposes.*

### 2. Events
* **Find all events for a user (Without Selections or Gallery Items)**
    * **Operation:** `Query`
    * **Condition:** `PK = USER#<username>` AND `SK begins_with("EVENT#")`
* **Find specific event with ID and username**
    * **Operation:** `GetItem`
    * **Condition:** `PK = USER#<username>` AND `SK = EVENT#<event_uuid>`

### 3. Selections
> Selection now stores only metadata (no upload-progress fields, no race-safe gate) — see `single-table-design.md` §5 "Why Selection has no upload-progress fields" for rationale.
* **Find selection for an event (Return ONLY the Selection, no items)**
    * **Operation:** `GetItem`
    * **Condition:** `PK = USER#<username>` AND `SK = SELECTION#<event_uuid>`
* **Find all selection items for an event (Return ONLY the items, no main selection)**
    * **Operation:** `Query`
    * **Condition:** `PK = USER#<username>` AND `SK begins_with("SELECTION_ITEM#<event_uuid>#")`

### 4. Galleries
* **Find all gallery items for an event ID**
    * **Operation:** `Query`
    * **Condition:** `PK = USER#<username>` AND `SK begins_with("GALLERY#<event_uuid>#")`

---

## 💡 Key Design Principles Used
1.  **Item Collections:** Related data (Events, Selections, Galleries) are stored in the same partition (`USER#<username>`) for high-speed, localized querying.
2.  **Strict Prefix Isolation:** `EVENT#`, `SELECTION#`, and `SELECTION_ITEM#` are purposefully separated. This prevents `begins_with()` from accidentally fetching 1:N relational data when you only want the parent entity.
3.  **Trailing Hashes (`#`):** Used in `begins_with` queries (e.g., `GALLERY#<event_uuid>#`) to ensure exact UUID matches and avoid overlapping IDs.
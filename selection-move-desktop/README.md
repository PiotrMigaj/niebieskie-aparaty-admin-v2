# Selection Move Desktop

Small Electron helper that reads finalised Selections from DynamoDB and moves the picked photos from a local folder into a `wybrane/` subfolder. Sibling to the main Nuxt admin app; not part of its build.

## Develop

```bash
cd selection-move-desktop
pnpm install
pnpm dev
```

On first launch the app asks for AWS credentials. They are encrypted with Electron `safeStorage` (Keychain on macOS, DPAPI on Windows) and saved to the app's `userData` folder. To override during development, set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `DDB_TABLE_NAME` in the shell before `pnpm dev`.

Use a dedicated read-only IAM user with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Query", "dynamodb:GetItem"],
      "Resource": [
        "arn:aws:dynamodb:eu-central-1:*:table/niebieskie-aparaty-prod",
        "arn:aws:dynamodb:eu-central-1:*:table/niebieskie-aparaty-prod/index/GSI1"
      ]
    }
  ]
}
```

## Package

```bash
pnpm pack:mac     # → dist-release/Selection Move-<v>-<arch>.dmg
pnpm pack:win     # → dist-release/Selection Move-<v>.exe (portable, no install)
pnpm pack:all     # both
```

Windows portable: copy the `.exe` to the target machine and double-click — no installer, no admin rights needed.

## Flow

1. Credentials screen on first run (or after "Reset credentials").
2. Selection list — only `blocked: true` rows can be picked.
3. Choose source folder containing the original photos.
4. App moves files whose names appear in `Selection.selectedImages` into `<folder>/wybrane/`. Cross-volume moves fall back to copy + unlink.
5. Summary with counts (moved / missing / already-existed / errored).

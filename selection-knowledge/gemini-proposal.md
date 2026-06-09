# Serverless Image Processing Architecture Documentation

## 1. System Overview

This document outlines the event-driven, serverless architecture for asynchronously processing high-resolution images (up to 20MB) into web-optimized formats (WebP, <1MB). The system is designed to offload heavy CPU operations from the main Node.js (Nuxt) server to AWS Lambda, ensuring high availability, zero event-loop blocking, and high cost-efficiency.

---

## 2. Core Components

| Component | Role | Description |
| :--- | :--- | :--- |
| **Nuxt Frontend** | Client Application | Initiates the upload process and pushes files directly to AWS S3. |
| **Nuxt Backend** | Orchestrator / Auth | Secures the process by generating S3 Presigned URLs with locked path parameters. |
| **Amazon S3 (Uploads)** | Temporary Storage | Receives raw, high-resolution images directly from the client. |
| **Amazon SQS** | Buffer / Shock Absorber | Queues S3 object creation events to prevent Lambda concurrency limits from being overwhelmed during bulk uploads. |
| **AWS Lambda** | Worker | Polls SQS, downloads the raw image, compresses it using `sharp`, and coordinates downstream actions. |
| **Amazon S3 (Processed)** | Permanent Storage | Stores the optimized WebP images for application use. |
| **Amazon DynamoDB** | Database | Stores application state and metadata (e.g., event ID, object key, dimensions). |

---

## 3. Data Flow and Execution State

To maintain a stateless and highly scalable pipeline, system state (such as the photographer's username and the specific event ID) is passed through the system via the **S3 Object Key**.

### Step-by-Step Flow

1. **Upload Initialization:** The client requests an upload URL for a specific event. The Nuxt backend validates the session and generates an S3 Presigned URL.
   * *Generated Key Pattern:* `{username}/{eventId}/selection_original/{filename}`
2. **Direct Upload:** The client uploads the 20MB file directly to the S3 `Uploads` bucket using the Presigned URL. The Nuxt server's compute resources are bypassed.
3. **Event Trigger:** Upon successful upload, S3 publishes an `s3:ObjectCreated:*` event to the SQS Queue.
4. **Queue Processing:** The SQS queue buffers the events. The AWS Lambda worker polls the queue (e.g., batch size of 1-5).
5. **Image Processing (Lambda):**
   * Extracts `username`, `eventId`, and `filename` by parsing the S3 Object Key.
   * Downloads the raw image into memory.
   * Compresses and converts the image to WebP using the Node.js `sharp` library.
6. **Persistence:**
   * Uploads the WebP file to the `Processed` bucket at `{username}/{eventId}/selection/{filename}.webp`.
   * Appends the image metadata (width, height, new S3 Key) to the corresponding `eventId` record in DynamoDB.
7. **Cleanup:**
   * Deletes the original 20MB file from the `Uploads` bucket.

---

## 4. Error Handling and Resilience

### Dead Letter Queue (DLQ)
If the Lambda function fails to process an image (e.g., corrupted file format, memory limit exceeded), it will throw an error. SQS will automatically retry the message up to a configured threshold (e.g., 3 times). If it continues to fail, SQS moves the message to a Dead Letter Queue (DLQ) for manual inspection and alerts the engineering team.

### Orphaned File Cleanup (S3 Lifecycle Rule)
To prevent AWS storage costs from accumulating due to failed Lambda executions (where the cleanup step is never reached), the `Uploads` bucket is configured with an **S3 Lifecycle Rule**. This rule automatically permanently deletes any object in the `Uploads` bucket older than 24 hours.

---

## 5. Cost Optimization Strategy

* **Zero Idle Compute:** Lambda and SQS are billed purely on usage. If no photos are uploaded, the compute cost is $0.
* **Direct-to-S3 Uploads:** Bypassing the Node.js server eliminates the need for expensive, memory-heavy EC2/ECS instances to handle multipart form data.
* **Ephemeral Storage:** Raw 20MB files exist in the `Uploads` bucket for mere seconds (or maximum 24 hours), keeping S3 GB/month costs negligible.

---

## 6. Infrastructure as Code (AWS SAM)

This architecture is deployed using the AWS Serverless Application Model (SAM). The Lambda function is written in TypeScript and bundled using `esbuild`. 

*Note: The `sharp` library requires native Linux binaries. The SAM build process must be executed using the `--use-container` flag to ensure compatibility with the AWS Lambda execution environment.*

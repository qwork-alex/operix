import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

export const s3 = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

const PUBLIC_BUCKETS = ["avatars", "hail-reports", "marketplace", "logos"];

const ALL_BUCKETS = [
  "uploads",
  "avatars",
  "hail-reports",
  "marketplace",
  "logos",
  "production-photos",
  "accounting-receipts",
  "billing-receipts",
  "payment-proofs",
  "invoice-pdfs",
];

async function bucketExists(name: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    return true;
  } catch {
    return false;
  }
}

function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

export async function ensureBuckets(): Promise<void> {
  for (const name of ALL_BUCKETS) {
    const exists = await bucketExists(name);
    if (!exists) {
      await s3.send(new CreateBucketCommand({ Bucket: name }));
      console.log(`[minio] bucket criado: ${name}`);
    }
    if (PUBLIC_BUCKETS.includes(name)) {
      await s3.send(
        new PutBucketPolicyCommand({ Bucket: name, Policy: publicReadPolicy(name) })
      );
    }
  }
  console.log("[minio] buckets verificados");
}

export { PUBLIC_BUCKETS };
